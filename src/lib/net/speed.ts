import type { BenchResult } from "@/lib/net/types";

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function samplePing(signal: AbortSignal): Promise<{ pingMs: number; jitterMs: number; missed: number }> {
  const samples: number[] = [];
  let missed = 0;
  for (let i = 0; i < 8; i += 1) {
    const start = performance.now();
    try {
      const res = await fetch(`https://speed.cloudflare.com/__down?bytes=0&r=${Math.random()}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) {
        missed += 1;
        continue;
      }
      await res.arrayBuffer();
      samples.push(performance.now() - start);
    } catch (error) {
      if (signal.aborted) throw error;
      missed += 1;
    }
  }
  if (samples.length < 3) throw new Error("Latency probe failed.");
  const kept = samples.slice(1);
  const pingMs = median(kept);
  const jitterMs = kept.reduce((sum, value) => sum + Math.abs(value - pingMs), 0) / kept.length;
  return { pingMs, jitterMs, missed };
}

async function loadedPings(signal: AbortSignal, stop: { current: boolean }): Promise<number | null> {
  const samples: number[] = [];
  let tries = 0;
  await new Promise((resolve) => setTimeout(resolve, 300));
  while (!stop.current && samples.length < 5 && tries < 8) {
    tries += 1;
    const start = performance.now();
    try {
      const res = await fetch(`https://speed.cloudflare.com/__down?bytes=0&r=${Math.random()}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) continue;
      await res.arrayBuffer();
      samples.push(performance.now() - start);
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return samples.length ? median(samples) : null;
}

async function sampleDownload(
  signal: AbortSignal,
  onSample: (mbps: number) => void,
): Promise<{ downMbps: number; samples: number[]; ttfbMs: number; loadedPingMs: number | null }> {
  const bytes = 8_000_000;
  const stop = { current: false };
  const loaded = loadedPings(signal, stop);
  const opened = performance.now();
  const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Math.random()}`, {
    cache: "no-store",
    signal,
  });
  const ttfbMs = performance.now() - opened;
  if (!res.ok || !res.body) throw new Error("Download probe failed.");
  const reader = res.body.getReader();
  const samples: number[] = [];
  let received = 0;
  const start = performance.now();
  let lastMark = start;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    const now = performance.now();
    if (now - lastMark > 180) {
      const mbps = (received * 8) / ((now - start) / 1000) / 1_000_000;
      samples.push(mbps);
      onSample(mbps);
      lastMark = now;
    }
  }
  stop.current = true;
  const loadedPingMs = await loaded;
  const seconds = (performance.now() - start) / 1000;
  const downMbps = seconds > 0 ? (received * 8) / seconds / 1_000_000 : 0;
  if (samples.length === 0) samples.push(downMbps);
  onSample(downMbps);
  return { downMbps, samples, ttfbMs, loadedPingMs };
}

async function sampleParallel(signal: AbortSignal): Promise<number | null> {
  const bytes = 3_000_000;
  const start = performance.now();
  try {
    const sizes = await Promise.all(
      [0, 1, 2].map(async () => {
        const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Math.random()}`, {
          cache: "no-store",
          signal,
        });
        if (!res.ok) throw new Error("Parallel probe failed.");
        return (await res.arrayBuffer()).byteLength;
      }),
    );
    const total = sizes.reduce((sum, size) => sum + size, 0);
    const seconds = (performance.now() - start) / 1000;
    return seconds > 0 ? (total * 8) / seconds / 1_000_000 : null;
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}

async function sampleUpload(signal: AbortSignal): Promise<number | null> {
  const bytes = 2_000_000;
  const body = new Uint8Array(bytes);
  const start = performance.now();
  try {
    const res = await fetch("https://speed.cloudflare.com/__up", {
      method: "POST",
      body,
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    await res.arrayBuffer();
    const seconds = (performance.now() - start) / 1000;
    return seconds > 0 ? (bytes * 8) / seconds / 1_000_000 : null;
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}

export async function runBench(
  onSample: (mbps: number) => void,
  signal: AbortSignal,
  onStage?: (label: string) => void,
): Promise<BenchResult> {
  onStage?.("Idle ping");
  const ping = await samplePing(signal);
  onStage?.("Download");
  const down = await sampleDownload(signal, onSample);
  onStage?.("Three connections");
  const parallelMbps = await sampleParallel(signal);
  onStage?.("Upload");
  const upMbps = await sampleUpload(signal);
  return {
    at: Date.now(),
    pingMs: ping.pingMs,
    jitterMs: ping.jitterMs,
    downMbps: down.downMbps,
    upMbps,
    samples: down.samples,
    loadedPingMs: down.loadedPingMs,
    ttfbMs: down.ttfbMs,
    parallelMbps,
    missed: ping.missed,
  };
}

export function benchNotes(result: BenchResult): string[] {
  const notes: string[] = [];
  if (
    result.loadedPingMs != null &&
    result.pingMs > 0 &&
    result.loadedPingMs > result.pingMs * 2 &&
    result.loadedPingMs - result.pingMs > 40
  ) {
    notes.push("Latency climbs while the link is busy.");
  } else if (result.loadedPingMs != null && result.loadedPingMs <= result.pingMs * 1.4) {
    notes.push("Latency stays steady under load.");
  }
  if (result.parallelMbps != null && result.downMbps > 1 && result.parallelMbps > result.downMbps * 1.35) {
    notes.push("Several connections at once are faster than one.");
  } else if (result.parallelMbps != null && result.downMbps > 8 && result.parallelMbps < result.downMbps * 0.9) {
    notes.push("One connection already fills the path.");
  }
  if ((result.missed ?? 0) > 0) notes.push(`${result.missed} latency probes did not answer.`);
  return notes;
}

export function leoNote(pingMs: number | null, starlink: boolean): string {
  if (pingMs == null) return "";
  if (starlink && pingMs < 80) return "Latency fits a clear low-earth-orbit pass.";
  if (starlink) return "This is Starlink, but the path is slower than a clear shot.";
  if (pingMs < 40) return "Latency is low enough for fiber or a clear LEO link.";
  if (pingMs >= 450) return "Latency this high usually means GEO satellite, a weak cell, or a very long path.";
  return "";
}
