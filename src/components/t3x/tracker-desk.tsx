import { useEffect, useMemo, useState } from "react";
import { loadCatalog, type CatalogGroup } from "@/lib/net/elements";
import { nextPass, prepareElements, projectSky, type PassWindow, type PreparedSat, type SkyDot } from "@/lib/net/propagate";
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
      .map((row) => sky.find((item) => item.name === row.name) || { name: row.name, az: 0, el: -90 });
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

  return (
    <section className="card grid gap-3">
      <p className="kicker">Tracker</p>
      <h2 className="text-2xl font-semibold">What is overhead</h2>
      <p className="text-base text-fg">
        {observer ? `${sky.length} above the horizon.` : "Waiting for a location."} Positions are from public orbit data, for this minute.
      </p>
      <div className="scroll-row">
        {GROUPS.map((item) => (
          <button key={item.id} type="button" className="tab" aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a name" autoComplete="off" />
      {phase === "load" ? <p className="text-base text-fg">Reading the catalogue…</p> : null}
      {error ? <p className="text-base text-mark">{error}</p> : null}
      <ul className="grid gap-2">
        {visible.map((row) => (
          <li key={row.name}>
            <button type="button" className="btn btn-ghost w-full justify-between" onClick={() => choose(row.name)}>
              <span className="min-w-0 text-left" style={{ overflowWrap: "anywhere" }}>
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums">
                {row.el > 0 ? `${Math.round(row.el)}° ${compass(row.az)}` : "Below"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {phase === "live" && visible.length === 0 && !error ? <p className="text-base text-fg">Nothing in this list matches.</p> : null}
      {picked ? <p className="text-lg font-semibold">{picked}</p> : null}
      {pass ? (
        <div className="grid gap-1 text-base text-fg">
          <p>{pass.start <= Date.now() + 60_000 ? "Up now" : `Rises ${clock(pass.start)} · ${compass(pass.riseAz)}`}</p>
          <p>
            Highest {clock(pass.peak)} · {Math.round(pass.maxEl)}°
          </p>
          <p>
            Sets {clock(pass.end)} · {compass(pass.setAz)}
          </p>
        </div>
      ) : null}
      {passNote ? <p className="text-base text-fg">{passNote}</p> : null}
    </section>
  );
}
