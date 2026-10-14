import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { formatMbps, formatMs } from "@/lib/net/format";
import { pushBench, readBenchHistory, subscribeMemory } from "@/lib/net/memory";
import { benchNotes, leoNote, runBench } from "@/lib/net/speed";
import type { BenchResult } from "@/lib/net/types";
import type { LinkModel } from "@/components/t3x/use-link";

export function BenchDesk({ model }: { model: LinkModel }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState<number[]>([]);
  const [current, setCurrent] = useState<BenchResult | null>(null);
  const [history, setHistory] = useState<BenchResult[]>([]);
  const [stage, setStage] = useState("");

  useEffect(() => {
    const sync = () => setHistory(readBenchHistory());
    sync();
    return subscribeMemory(sync);
  }, []);

  async function start() {
    const controller = new AbortController();
    setRunning(true);
    setError("");
    setLive([]);
    setStage("Idle ping");
    try {
      const result = await runBench(
        (mbps) => {
          setLive((prev) => [...prev, mbps].slice(-40));
        },
        controller.signal,
        setStage,
      );
      setCurrent(result);
      pushBench(result);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "The bench could not finish.");
      }
    } finally {
      setRunning(false);
      setStage("");
    }
  }

  const shown = current;
  const peak = Math.max(1, ...live);
  const note = leoNote(shown?.pingMs ?? null, Boolean(model.identity?.starlink));

  return (
    <div className="grid gap-4">
      <section className="card">
        <p className="kicker">Bench</p>
        <h2 className="mt-2 text-2xl font-semibold">Measure the path you are on</h2>
        <p className="mt-2 max-w-2xl text-base text-fg">
          Six checks against Cloudflare: idle ping, time to first byte, one download, ping while that download runs, three downloads at once, then an upload. About 17 MB down and 2 MB up.
        </p>
        <button type="button" className="btn btn-primary mt-4 w-full text-lg" onClick={() => void start()} disabled={running || model.link?.online === false}>
          <Gauge aria-hidden="true" size={16} />
          {running ? stage || "Running…" : "Start bench"}
        </button>
        {error ? <p className="mt-3 text-base text-mark">{error}</p> : null}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <article className="card">
          <p className="stat-label">Idle ping</p>
          <p className="stat-value mt-2">{formatMs(shown?.pingMs ?? null)}</p>
          <p className="mt-1 text-base text-fg">Jitter {formatMs(shown?.jitterMs ?? null)}</p>
        </article>
        <article className="card">
          <p className="stat-label">Loaded ping</p>
          <p className="stat-value mt-2">{formatMs(shown?.loadedPingMs ?? null)}</p>
          <p className="mt-1 text-base text-fg">While the download runs</p>
        </article>
        <article className="card">
          <p className="stat-label">First byte</p>
          <p className="stat-value mt-2">{formatMs(shown?.ttfbMs ?? null)}</p>
          <p className="mt-1 text-base text-fg">Until the download answers</p>
        </article>
        <article className="card">
          <p className="stat-label">Download</p>
          <p className="stat-value mt-2">{formatMbps(shown?.downMbps ?? (live.at(-1) ?? null))}</p>
          <p className="mt-1 text-base text-fg">One connection</p>
        </article>
        <article className="card">
          <p className="stat-label">Three at once</p>
          <p className="stat-value mt-2">{formatMbps(shown?.parallelMbps ?? null)}</p>
          <p className="mt-1 text-base text-fg">Parallel download</p>
        </article>
        <article className="card">
          <p className="stat-label">Upload</p>
          <p className="stat-value mt-2">{formatMbps(shown?.upMbps ?? null)}</p>
          <p className="mt-1 text-base text-fg">One connection</p>
        </article>
      </section>

      {note ? <p className="text-base text-fg">{note}</p> : null}
      {shown ? benchNotes(shown).map((line) => (
        <p key={line} className="text-base text-fg">{line}</p>
      )) : null}

      {live.length > 1 ? (
        <div className="card">
          <p className="stat-label">Download while it ran</p>
          <div className="mt-3 flex h-24 items-end gap-1" aria-hidden="true">
            {live.map((value, index) => (
              <div
                key={`${index}-${value.toFixed(2)}`}
                className="min-w-1 flex-1 rounded-sm bg-primary"
                style={{ height: `${Math.max(6, (value / peak) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section className="card">
          <p className="kicker">On this device</p>
          <ul className="mt-3 grid gap-2">
            {history.map((row) => (
              <li key={row.at} className="grid gap-1 text-base">
                <span className="tabular-nums text-fg">{new Date(row.at).toLocaleString()}</span>
                <span className="tabular-nums">
                  {formatMs(row.pingMs)} idle
                  {row.loadedPingMs != null ? ` · ${formatMs(row.loadedPingMs)} loaded` : ""}
                  {row.ttfbMs != null ? ` · ${formatMs(row.ttfbMs)} first byte` : ""}
                  {" · "}
                  {formatMbps(row.downMbps)} down
                  {row.parallelMbps != null ? ` · ${formatMbps(row.parallelMbps)} ×3` : ""}
                  {row.upMbps != null ? ` · ${formatMbps(row.upMbps)} up` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
