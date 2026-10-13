import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { formatMbps, formatMs } from "@/lib/net/format";
import { pushBench, readBenchHistory, subscribeMemory } from "@/lib/net/memory";
import { leoNote, runBench } from "@/lib/net/speed";
import type { BenchResult } from "@/lib/net/types";
import type { LinkModel } from "@/components/t3x/use-link";

export function BenchDesk({ model }: { model: LinkModel }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState<number[]>([]);
  const [current, setCurrent] = useState<BenchResult | null>(null);
  const [history, setHistory] = useState<BenchResult[]>([]);

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
    try {
      const result = await runBench((mbps) => {
        setLive((prev) => [...prev, mbps].slice(-40));
      }, controller.signal);
      setCurrent(result);
      pushBench(result);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "The bench could not finish.");
      }
    } finally {
      setRunning(false);
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
        <p className="mt-2 max-w-2xl text-sm text-muted">
          A short test against Cloudflare. About 8 MB down and 1.5 MB up. The browser’s own
          “downlink” number is only a hint — this is the measurement.
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => void start()} disabled={running || model.link?.online === false}>
          <Gauge aria-hidden="true" size={16} />
          {running ? "Running…" : "Start bench"}
        </button>
        {error ? <p className="mt-3 text-sm text-mark">{error}</p> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="card">
          <p className="stat-label">Ping</p>
          <p className="stat-value mt-2">{formatMs(shown?.pingMs ?? null)}</p>
          <p className="mt-1 text-sm text-muted">Jitter {formatMs(shown?.jitterMs ?? null)}</p>
        </article>
        <article className="card">
          <p className="stat-label">Download</p>
          <p className="stat-value mt-2">{formatMbps(shown?.downMbps ?? (live.at(-1) ?? null))}</p>
        </article>
        <article className="card">
          <p className="stat-label">Upload</p>
          <p className="stat-value mt-2">{formatMbps(shown?.upMbps ?? null)}</p>
        </article>
      </section>

      {note ? <p className="text-sm text-muted">{note}</p> : null}

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
              <li key={row.at} className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="tabular-nums text-muted">{new Date(row.at).toLocaleString()}</span>
                <span className="tabular-nums">
                  {formatMs(row.pingMs)} · {formatMbps(row.downMbps)} down
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
