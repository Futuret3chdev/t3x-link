import { useEffect, useMemo, useState } from "react";
import { formatMs } from "@/lib/net/format";
import { readBenchHistory, readJoin, readJournal, readPings, subscribeMemory, type JoinTry, type PingMark } from "@/lib/net/memory";
import { runTool, type ToolKind, type ToolReport } from "@/lib/net/tools";
import type { BenchResult, JournalEntry } from "@/lib/net/types";
import type { LinkModel } from "@/components/t3x/use-link";

const TOOLS: { id: ToolKind; label: string }[] = [
  { id: "dns", label: "DNS" },
  { id: "mx", label: "Mail" },
  { id: "rdap", label: "Whois" },
  { id: "https", label: "Site" },
];

export function HubDesk({ model }: { model: LinkModel }) {
  const [pings, setPings] = useState<PingMark[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [bench, setBench] = useState<BenchResult | null>(null);
  const [host, setHost] = useState("example.com");
  const [tool, setTool] = useState<ToolKind>("dns");
  const [report, setReport] = useState<ToolReport | null>(null);
  const [toolError, setToolError] = useState("");
  const [toolBusy, setToolBusy] = useState(false);
  const [liveDown, setLiveDown] = useState<number | null>(null);
  const [liveUp, setLiveUp] = useState<number | null>(null);
  const [downTrail, setDownTrail] = useState<number[]>([]);
  const [upTrail, setUpTrail] = useState<number[]>([]);
  const [liveLoaded, setLiveLoaded] = useState<number | null>(null);
  const [logPage, setLogPage] = useState(0);
  const [joinTry, setJoinTry] = useState<JoinTry | null>(null);

  useEffect(() => {
    const sync = () => {
      setPings(readPings());
      setJournal(readJournal());
      setBench(readBenchHistory()[0] || null);
    };
    sync();
    return subscribeMemory(sync);
  }, []);

  useEffect(() => {
    let stop = false;
    let timer = 0;
    let which: "down" | "up" = "down";
    const beat = async () => {
      if (stop) return;
      try {
        if (which === "down") {
          const probe = (async () => {
            const mark = performance.now();
            const ping = await fetch(`https://speed.cloudflare.com/__down?bytes=0&r=${Math.random()}`, { cache: "no-store" });
            await ping.arrayBuffer();
            return ping.ok ? performance.now() - mark : 0;
          })();
          const start = performance.now();
          const res = await fetch(`https://speed.cloudflare.com/__down?bytes=400000&r=${Math.random()}`, { cache: "no-store" });
          const body = await res.arrayBuffer();
          const loaded = await probe;
          const seconds = (performance.now() - start) / 1000;
          const mbps = seconds > 0 ? (body.byteLength * 8) / seconds / 1_000_000 : 0;
          if (!stop && res.ok && mbps > 0) {
            setLiveDown(mbps);
            setDownTrail((rows) => [...rows, mbps].slice(-12));
          }
          if (!stop && loaded > 0) setLiveLoaded(loaded);
          which = "up";
        } else {
          const bytes = 120_000;
          const start = performance.now();
          const res = await fetch("https://speed.cloudflare.com/__up", {
            method: "POST",
            body: new Uint8Array(bytes),
            cache: "no-store",
          });
          await res.arrayBuffer();
          const seconds = (performance.now() - start) / 1000;
          const mbps = seconds > 0 ? (bytes * 8) / seconds / 1_000_000 : 0;
          if (!stop && res.ok && mbps > 0) {
            setLiveUp(mbps);
            setUpTrail((rows) => [...rows, mbps].slice(-12));
          }
          which = "down";
        }
      } catch {
        which = which === "down" ? "up" : "down";
      }
      if (!stop) timer = window.setTimeout(() => void beat(), 2000);
    };
    timer = window.setTimeout(() => void beat(), 600);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const sync = () => setJoinTry(readJoin());
    sync();
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const link = model.link;
  const ping = model.path?.pingMs ?? null;
  const alerts = useMemo(() => {
    const rows: string[] = [];
    const latest = pings.at(-1)?.pingMs ?? ping;
    if (link && !link.online) rows.push("The link is down.");
    if (latest != null && latest >= 150) rows.push("Latency is high on this path.");
    if (liveLoaded != null && latest != null && liveLoaded >= latest * 2 && liveLoaded >= 120) {
      rows.push("Loaded ping is much higher than the idle ping.");
    }
    if (liveDown != null && liveDown < 2) rows.push("Download is very slow.");
    if (liveUp != null && liveUp < 0.5) rows.push("Upload is very slow.");
    if (link?.saveData) rows.push("The phone is saving data.");
    if (model.identity?.starlink && latest != null && latest >= 80) rows.push("Starlink is up, but this pass is slower than a clear shot.");
    return rows;
  }, [link, liveDown, liveLoaded, liveUp, model.identity?.starlink, ping, pings]);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    setToolBusy(true);
    setToolError("");
    try {
      setReport(await runTool({ data: { kind: tool, host } }));
    } catch (reason) {
      setReport(null);
      setToolError(reason instanceof Error ? reason.message : "That check failed.");
    } finally {
      setToolBusy(false);
    }
  }

  const peak = Math.max(1, ...pings.map((row) => row.pingMs));
  const downPeak = Math.max(1, ...downTrail);
  const upPeak = Math.max(1, ...upTrail);
  const downShown = liveDown ?? bench?.downMbps ?? null;
  const upShown = liveUp ?? bench?.upMbps ?? null;
  const loadedShown = liveLoaded ?? bench?.loadedPingMs ?? null;
  const rate = (value: number | null) => (value == null ? "—" : value >= 10 ? value.toFixed(1) : value.toFixed(2));

  return (
    <div className="grid gap-4">
      <section className="card">
        <p className="kicker">Control hub</p>
        <h2 className="mt-2 text-2xl font-semibold">This phone</h2>
        <p className="mt-2 text-base text-fg">Ping, speed, and a host check. The phone chooses Wi-Fi or cellular. This page cannot switch it.</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <article className="card">
          <p className="stat-label">Link</p>
          <p className="stat-value mt-2">{link ? (link.online ? link.typeLabel : "Down") : "…"}</p>
          <p className="mt-1 text-base text-fg">{link?.effectiveLabel || model.identity?.city || "Live"}</p>
        </article>
        <article className="card">
          <p className="stat-label">Ping</p>
          <p className="stat-value mt-2">{formatMs(ping)}</p>
          <p className="mt-1 text-base text-fg">{link?.rtt != null ? `Hint ${formatMs(link.rtt)}` : "Measured from this phone"}</p>
        </article>
        <article className="card">
          <p className="stat-label">Provider</p>
          <p className="mt-2 text-lg font-semibold">{model.identity?.holder || (model.reading ? "Looking up…" : "—")}</p>
          <p className="mt-1 text-base text-fg">{model.identity?.starlink ? "Starlink" : model.identity?.city || "Public path"}</p>
        </article>
      </section>

      {alerts.length > 0 ? (
        <section className="card grid gap-2">
          <p className="kicker">Alerts</p>
          {alerts.map((line) => (
            <p key={line} className="text-base text-fg">
              {line}
            </p>
          ))}
        </section>
      ) : (
        <p className="text-base text-fg">No alerts on this path.</p>
      )}

      {joinTry ? (
        <section className="card grid gap-1">
          <p className="kicker">After {joinTry.name}</p>
          <p className="text-lg font-semibold">
            {link && !link.online ? "Link down" : `Link up · ${formatMs(pings.at(-1)?.pingMs ?? ping)}`}
          </p>
        </section>
      ) : null}

      {pings.length > 1 ? (
        <div className="card">
          <p className="stat-label">Ping trail</p>
          <p className="mt-1 text-lg font-semibold">{Math.round(pings[pings.length - 1].pingMs)} ms</p>
          <div className="mt-3 flex h-20 items-end gap-1" aria-hidden="true">
            {pings.map((mark) => (
              <div
                key={mark.at}
                className="trail-bar min-w-1 flex-1 rounded-sm bg-accent"
                style={{ height: `${Math.max(8, Math.round((mark.pingMs / peak) * 100))}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {downShown != null || upShown != null || loadedShown != null ? (
        <section className="grid grid-cols-3 gap-3">
          <article className="card">
            <p className="stat-label">Down</p>
            <p className="stat-value mt-2">{rate(downShown)}</p>
            <p className="text-base text-fg">Mb/s</p>
            {downTrail.length > 1 ? (
              <div className="mt-2 flex h-8 items-end gap-0.5" aria-hidden="true">
                {downTrail.map((value, index) => (
                  <div key={`${index}-${value}`} className="trail-bar min-w-1 flex-1 rounded-sm bg-accent" style={{ height: `${Math.max(12, Math.round((value / downPeak) * 100))}%` }} />
                ))}
              </div>
            ) : null}
          </article>
          <article className="card">
            <p className="stat-label">Up</p>
            <p className="stat-value mt-2">{rate(upShown)}</p>
            <p className="text-base text-fg">Mb/s</p>
            {upTrail.length > 1 ? (
              <div className="mt-2 flex h-8 items-end gap-0.5" aria-hidden="true">
                {upTrail.map((value, index) => (
                  <div key={`${index}-${value}`} className="trail-bar min-w-1 flex-1 rounded-sm bg-primary" style={{ height: `${Math.max(12, Math.round((value / upPeak) * 100))}%` }} />
                ))}
              </div>
            ) : null}
          </article>
          <article className="card">
            <p className="stat-label">Loaded</p>
            <p className="stat-value mt-2">{formatMs(loadedShown)}</p>
          </article>
        </section>
      ) : null}

      <section className="card grid gap-3">
        <p className="kicker">Tools</p>
        <h2 className="text-2xl font-semibold">Check a host</h2>
        <form onSubmit={(event) => void ask(event)} className="grid gap-3">
          <input className="field" value={host} onChange={(event) => setHost(event.target.value)} placeholder="example.com" autoComplete="off" />
          <div className="tab-wrap">
            {TOOLS.map((item) => (
              <button key={item.id} type="button" className="tab" aria-pressed={tool === item.id} onClick={() => setTool(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <button type="submit" className="btn btn-primary w-full text-lg" disabled={toolBusy}>
            {toolBusy ? "Checking…" : "Run"}
          </button>
        </form>
        {toolError ? <p className="text-base text-mark">{toolError}</p> : null}
        {report ? (
          <div className="grid gap-1">
            <p className="text-lg font-semibold">{report.title}</p>
            {report.lines.map((line) => (
              <p key={line} className="text-base text-fg" style={{ overflowWrap: "anywhere" }}>
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {journal.length > 0 ? (
        <section className="card grid gap-3">
          <p className="kicker">Log</p>
          <ul className="grid gap-2">
            {journal.slice(logPage * 5, logPage * 5 + 5).map((entry) => (
              <li key={entry.id} className="text-base text-fg">
                {entry.summary.replaceAll("Hidden", "Online")}
              </li>
            ))}
          </ul>
          {journal.length > 5 ? (
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="btn btn-ghost" disabled={logPage === 0} onClick={() => setLogPage((page) => Math.max(0, page - 1))}>
                Newer
              </button>
              <p className="text-base text-fg">
                {logPage + 1} / {Math.ceil(journal.length / 5)}
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={(logPage + 1) * 5 >= journal.length}
                onClick={() => setLogPage((page) => page + 1)}
              >
                Older
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
