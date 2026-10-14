import { useEffect, useMemo, useState } from "react";
import { SkyView } from "@/components/t3x/sky-view";
import { loadCatalog, type CatalogGroup } from "@/lib/net/elements";
import { loadLaunches, type Launch } from "@/lib/net/launches";
import { nextPass, prepareElements, projectSky, upcomingPasses, type PassWindow, type PreparedSat, type SkyDot } from "@/lib/net/propagate";
import type { LinkModel } from "@/components/t3x/use-link";

const GROUPS: { id: CatalogGroup; label: string }[] = [
  { id: "stations", label: "ISS" },
  { id: "gps-ops", label: "GPS" },
  { id: "galileo", label: "Galileo" },
  { id: "glo-ops", label: "GLONASS" },
  { id: "weather", label: "Weather" },
  { id: "visual", label: "Bright" },
  { id: "starlink", label: "Starlink" },
  { id: "iridium-NEXT", label: "Iridium" },
  { id: "oneweb", label: "OneWeb" },
];

function compass(az: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(az / 45) % 8];
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function minutes(start: number, end: number): number {
  return Math.max(1, Math.round((end - start) / 60_000));
}

function plotPoint(az: number, el: number): [number, number] {
  const radius = ((90 - Math.max(0, Math.min(90, el))) / 90) * 78;
  const theta = (az * Math.PI) / 180;
  return [100 + radius * Math.sin(theta), 100 - radius * Math.cos(theta)];
}

function SkyPlot({ sky, onPick }: { sky: SkyDot[]; onPick: (name: string) => void }) {
  return (
    <svg viewBox="0 0 200 200" className="sky-plot" role="img" aria-label="Sky chart">
      <circle cx="100" cy="100" r="78" className="sky-ring" />
      <circle cx="100" cy="100" r="52" className="sky-ring" />
      <circle cx="100" cy="100" r="26" className="sky-ring" />
      <line x1="100" y1="22" x2="100" y2="178" className="sky-ring" />
      <line x1="22" y1="100" x2="178" y2="100" className="sky-ring" />
      <text x="100" y="14" textAnchor="middle" className="sky-letter">
        N
      </text>
      <text x="190" y="104" textAnchor="middle" className="sky-letter">
        E
      </text>
      <text x="100" y="196" textAnchor="middle" className="sky-letter">
        S
      </text>
      <text x="10" y="104" textAnchor="middle" className="sky-letter">
        W
      </text>
      {sky.slice(0, 48).map((row) => {
        const [x, y] = plotPoint(row.az, row.el);
        return (
          <circle
            key={row.name}
            cx={x}
            cy={y}
            r={row.el > 45 ? 3.4 : 2.3}
            className={row.el > 45 ? "sky-dot-hot" : "sky-dot"}
            onClick={() => onPick(row.name)}
          >
            <title>{`${row.name} ${Math.round(row.el)}°`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function remaining(at: number, now: number): string {
  const ms = at - now;
  if (ms <= 0) return "Launched";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function TrackerDesk({ model }: { model: LinkModel }) {
  const [group, setGroup] = useState<CatalogGroup>("stations");
  const [query, setQuery] = useState("");
  const [sky, setSky] = useState<SkyDot[]>([]);
  const [prepared, setPrepared] = useState<PreparedSat[]>([]);
  const [phase, setPhase] = useState<"load" | "live" | "error">("load");
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const [pass, setPass] = useState<PassWindow | null>(null);
  const [passNote, setPassNote] = useState("");
  const [mode, setMode] = useState<"up" | "passes" | "launches">("up");
  const [skyOpen, setSkyOpen] = useState(false);
  const [passes, setPasses] = useState<Array<PassWindow & { name: string }>>([]);
  const [passBusy, setPassBusy] = useState(false);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [launchError, setLaunchError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const observer =
    model.identity?.lat != null && model.identity.lon != null
      ? { lat: model.identity.lat, lon: model.identity.lon }
      : null;

  useEffect(() => {
    let cancel = false;
    setPhase("load");
    setError("");
    setSky([]);
    setPicked("");
    setPass(null);
    loadCatalog({ data: { group } })
      .then((catalog) => {
        if (cancel) return;
        setPrepared(prepareElements(catalog.elements));
        setPhase("live");
      })
      .catch((reason: unknown) => {
        if (cancel) return;
        setPhase("error");
        setError(reason instanceof Error ? reason.message : "The catalogue did not answer.");
      });
    return () => {
      cancel = true;
    };
  }, [group]);

  useEffect(() => {
    if (phase !== "live" || !observer || prepared.length === 0) return;
    let cancel = false;
    let timer = 0;
    const tick = async () => {
      try {
        const rows = await projectSky(prepared, observer, () => cancel);
        if (!cancel) setSky(rows);
      } catch (reason) {
        if (cancel) return;
        if (reason instanceof Error && reason.message === "cancelled") return;
        setError(reason instanceof Error ? reason.message : "Could not place these satellites.");
      }
      if (!cancel) timer = window.setTimeout(() => void tick(), 20_000);
    };
    void tick();
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [phase, prepared, observer?.lat, observer?.lon]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sky.slice(0, 12);
    return prepared
      .filter((row) => row.name.toLowerCase().includes(q))
      .slice(0, 12)
      .map((row) => sky.find((item) => item.name === row.name) || { name: row.name, az: 0, el: -90, rangeKm: 0 });
  }, [prepared, query, sky]);

  function choose(name: string) {
    setPicked(name);
    setPass(null);
    setPassNote("");
    if (!observer) {
      setPassNote("Location is not in yet.");
      return;
    }
    const sat = prepared.find((row) => row.name === name);
    if (!sat) return;
    const found = nextPass(sat, observer);
    if (!found) {
      setPassNote("No pass above 10° in the next 18 hours.");
      return;
    }
    setPass(found);
  }

  useEffect(() => {
    if (mode !== "passes" || phase !== "live" || !observer) return;
    let cancel = false;
    setPassBusy(true);
    setPasses([]);
    const rank = new Map(sky.map((row) => [row.name, row.el]));
    const ordered = [...prepared].sort((a, b) => (rank.get(b.name) ?? -90) - (rank.get(a.name) ?? -90));
    upcomingPasses(ordered, observer, () => cancel)
      .then((rows) => {
        if (!cancel) setPasses(rows);
      })
      .catch((reason: unknown) => {
        if (cancel) return;
        if (reason instanceof Error && reason.message === "cancelled") return;
        setPassNote(reason instanceof Error ? reason.message : "Could not build the pass list.");
      })
      .finally(() => {
        if (!cancel) setPassBusy(false);
      });
    return () => {
      cancel = true;
    };
    // Sky is only used to rank the list at the start of this search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, group, prepared, observer?.lat, observer?.lon]);

  useEffect(() => {
    if (mode !== "launches") return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    if (launches.length > 0) return () => window.clearInterval(timer);
    let cancel = false;
    loadLaunches()
      .then((rows) => {
        if (!cancel) setLaunches(rows);
      })
      .catch((reason: unknown) => {
        if (!cancel) setLaunchError(reason instanceof Error ? reason.message : "The launch list did not answer.");
      });
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [mode, launches.length]);

  async function openSky() {
    const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (ask) {
      try {
        const result = await ask();
        if (result !== "granted") {
          setError("Allow motion so the sky can follow the phone.");
          return;
        }
      } catch {
        setError("Allow motion so the sky can follow the phone.");
        return;
      }
    }
    setSkyOpen(true);
  }

  const nextUp = launches.find((row) => row.upcoming && row.at >= now) || launches.find((row) => row.upcoming);

  return (
    <section className="card grid gap-3">
      <p className="kicker">Tracker</p>
      <h2 className="text-2xl font-semibold">{mode === "launches" ? "Launches" : mode === "passes" ? "Next passes" : "What is overhead"}</h2>
      <div className="tab-wrap">
        {(
          [
            ["up", "Overhead"],
            ["passes", "Passes"],
            ["launches", "Launches"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="tab" aria-pressed={mode === id} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      {mode === "launches" ? (
        <div className="grid gap-3">
          {launchError ? <p className="text-base text-mark">{launchError}</p> : null}
          {!launchError && launches.length === 0 ? <p className="text-base text-fg">Reading the launch list…</p> : null}
          {nextUp ? (
            <article className="launch-hero">
              <p className="kicker">Upcoming</p>
              <p className="text-base font-semibold">{nextUp.status}</p>
              <p className="stat-value">{remaining(nextUp.at, now)}</p>
              <p className="text-lg font-semibold" style={{ overflowWrap: "anywhere" }}>
                {nextUp.name}
              </p>
              <p className="text-base text-fg">
                {new Date(nextUp.at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {nextUp.rocket ? ` · ${nextUp.rocket}` : ""}
              </p>
              {nextUp.provider ? <p className="text-base text-fg">{nextUp.provider}</p> : null}
              {nextUp.pad ? <p className="text-base text-fg">{nextUp.pad}</p> : null}
              {nextUp.mission ? <p className="text-base text-fg">{nextUp.mission.slice(0, 180)}</p> : null}
            </article>
          ) : null}
          {launches.some((row) => row.upcoming && row.id !== nextUp?.id) ? <p className="kicker">Also coming up</p> : null}
          <ul className="grid gap-3">
            {launches
              .filter((row) => row.upcoming && row.id !== nextUp?.id)
              .map((row) => (
                <li key={row.id} className="pass-card">
                  <p className="text-lg font-semibold">{remaining(row.at, now)}</p>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold" style={{ overflowWrap: "anywhere" }}>
                      {row.name}
                    </p>
                    <p className="text-base text-fg">{row.pad || row.rocket}</p>
                  </div>
                </li>
              ))}
          </ul>
          <p className="kicker">Previous</p>
          <ul className="grid gap-3">
            {launches
              .filter((row) => !row.upcoming)
              .map((row) => (
                <li key={row.id} className="pass-card">
                  <p className="text-lg font-semibold">Done</p>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold" style={{ overflowWrap: "anywhere" }}>
                      {row.name}
                    </p>
                    <p className="text-base text-fg">
                      {new Date(row.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {row.pad ? ` · ${row.pad}` : ""}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="text-base text-fg">
            {observer ? `${sky.length} above the horizon.` : "Waiting for a location."} Public orbit data for this minute.
          </p>
          <div className="tab-wrap">
            {GROUPS.map((item) => (
              <button key={item.id} type="button" className="tab" aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {mode === "up" ? (
            <>
              <SkyPlot sky={sky} onPick={choose} />
              <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a name" autoComplete="off" />
              <button type="button" className="btn btn-accent w-full text-lg" onClick={() => void openSky()} disabled={sky.length === 0}>
                AR
              </button>
            </>
          ) : null}
          {phase === "load" ? <p className="text-base text-fg">Reading the catalogue…</p> : null}
          {error ? <p className="text-base text-mark">{error}</p> : null}
          {mode === "passes" ? (
            <div className="grid gap-2">
              {passBusy ? <p className="text-base text-fg">Finding passes…</p> : null}
              {prepared.length > 200 ? <p className="text-base text-fg">The 40 highest in this group.</p> : null}
              {passes.map((row) => (
                <article key={`${row.name}-${row.start}`} className="pass-card">
                  <p className="stat-value">{row.start <= Date.now() + 60_000 ? "Up" : clock(row.start)}</p>
                  <div>
                    <p className="text-lg font-semibold">{row.name}</p>
                    <p className="text-base text-fg">
                      {minutes(row.start, row.end)} min · {Math.round(row.maxEl)}° · {compass(row.riseAz)}
                    </p>
                  </div>
                </article>
              ))}
              {!passBusy && passes.length === 0 ? <p className="text-base text-fg">No pass above 10° in this window.</p> : null}
            </div>
          ) : (
            <ul className="grid gap-2">
              {visible.map((row) => (
                <li key={row.name}>
                  <button type="button" className="btn btn-ghost w-full justify-between" onClick={() => choose(row.name)}>
                    <span className="min-w-0 text-left" style={{ overflowWrap: "anywhere" }}>
                      {row.name}
                    </span>
                    <span className="shrink-0 tabular-nums">{row.el > 0 ? `${Math.round(row.el)}° ${compass(row.az)}` : "Below"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mode === "up" && phase === "live" && visible.length === 0 && !error ? <p className="text-base text-fg">Nothing in this list matches.</p> : null}
          {mode === "up" && picked ? <p className="text-lg font-semibold">{picked}</p> : null}
          {mode === "up" && pass ? (
            <div className="grid gap-1 text-base text-fg">
              <p>{pass.start <= Date.now() + 60_000 ? "Up now" : `Rises ${clock(pass.start)} · ${compass(pass.riseAz)}`}</p>
              <p>
                Highest {clock(pass.peak)} · {Math.round(pass.maxEl)}° · {minutes(pass.start, pass.end)} min
              </p>
              <p>
                Sets {clock(pass.end)} · {compass(pass.setAz)}
              </p>
            </div>
          ) : null}
          {passNote ? <p className="text-base text-fg">{passNote}</p> : null}
        </>
      )}
      {skyOpen ? <SkyView sky={sky} onClose={() => setSkyOpen(false)} /> : null}
    </section>
  );
}
