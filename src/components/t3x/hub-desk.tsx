import { useEffect, useMemo, useState } from "react";
import { formatMs } from "@/lib/net/format";
import { readBenchHistory, readJournal, readPings, subscribeMemory, type PingMark } from "@/lib/net/memory";
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

  useEffect(() => {
    const sync = () => {
      setPings(readPings());
      setJournal(readJournal());
      setBench(readBenchHistory()[0] || null);
    };
    sync();
    return subscribeMemory(sync);
  }, []);

  const link = model.link;
  const ping = model.path?.pingMs ?? null;
  const alerts = useMemo(() => {
    const rows: string[] = [];
    if (link && !link.online) rows.push("The link is down.");
    if (ping != null && ping >= 250) rows.push("Latency is high on this path.");
    if (link?.saveData) rows.push("The phone is saving data.");
    if (model.identity?.starlink && ping != null && ping >= 80) rows.push("Starlink is up, but this pass is slower than a clear shot.");
    return rows;
  }, [link, model.identity?.starlink, ping]);

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

      {pings.length > 1 ? (
        <div className="card">
          <p className="stat-label">Ping trail</p>
          <div className="mt-3 flex h-20 items-end gap-1" aria-hidden="true">
            {pings.map((mark) => (
              <div
                key={mark.at}
                className="min-w-1 flex-1 rounded-sm bg-accent"
                style={{ height: `${Math.max(8, Math.round((mark.pingMs / peak) * 100))}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {bench ? (
        <section className="grid grid-cols-3 gap-3">
          <article className="card">
            <p className="stat-label">Down</p>
            <p className="stat-value mt-2">{bench.downMbps == null ? "—" : bench.downMbps >= 10 ? bench.downMbps.toFixed(1) : bench.downMbps.toFixed(2)}</p>
            <p className="text-base text-fg">Mb/s</p>
          </article>
          <article className="card">
            <p className="stat-label">Up</p>
            <p className="stat-value mt-2">{bench.upMbps == null ? "—" : bench.upMbps >= 10 ? bench.upMbps.toFixed(1) : bench.upMbps.toFixed(2)}</p>
            <p className="text-base text-fg">Mb/s</p>
          </article>
          <article className="card">
            <p className="stat-label">Loaded</p>
            <p className="mt-2 text-lg font-semibold">{formatMs(bench.loadedPingMs ?? null)}</p>
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
        <section className="card">
          <p className="kicker">Log</p>
          <ul className="mt-3 grid gap-2">
            {journal.slice(0, 6).map((entry) => (
              <li key={entry.id} className="text-base text-fg">
                {entry.summary.replaceAll("Hidden", "Online")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
