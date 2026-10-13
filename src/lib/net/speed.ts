import type { BenchResult } from "@/lib/net/types";

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function samplePing(signal: AbortSignal): Promise<{ pingMs: number; jitterMs: number }> {
  const samples: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const start = performance.now();
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=0&r=${Math.random()}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) throw new Error("Latency probe failed.");
    await res.arrayBuffer();
    samples.push(performance.now() - start);
  }
  const kept = samples.slice(1);
  const pingMs = median(kept);
  const jitterMs = kept.reduce((sum, value) => sum + Math.abs(value - pingMs), 0) / kept.length;
  return { pingMs, jitterMs };
}

async function sampleDownload(
  signal: AbortSignal,
  onSample: (mbps: number) => void,
): Promise<{ downMbps: number; samples: number[] }> {
  const bytes = 8_000_000;
  const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Math.random()}`, {
    cache: "no-store",
    signal,
  });
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
  const seconds = (performance.now() - start) / 1000;
  const downMbps = seconds > 0 ? (received * 8) / seconds / 1_000_000 : 0;
  if (samples.length === 0) samples.push(downMbps);
  onSample(downMbps);
  return { downMbps, samples };
}

async function sampleUpload(signal: AbortSignal): Promise<number | null> {
  const bytes = 1_500_000;
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
): Promise<BenchResult> {
  const ping = await samplePing(signal);
  const down = await sampleDownload(signal, onSample);
  const upMbps = await sampleUpload(signal);
  return {
    at: Date.now(),
    pingMs: ping.pingMs,
    jitterMs: ping.jitterMs,
    downMbps: down.downMbps,
    upMbps,
    samples: down.samples,
  };
}

export function leoNote(pingMs: number | null, starlink: boolean): string {
  if (pingMs == null) return "";
  if (starlink && pingMs < 80) return "Latency fits a clear low-earth-orbit pass.";
  if (starlink) return "This is Starlink, but the path is slower than a clear shot.";
  if (pingMs < 40) return "Latency is low enough for fiber or a clear LEO link.";
  if (pingMs >= 450) return "Latency this high usually means GEO satellite, a weak cell, or a very long path.";
  return "";
}
