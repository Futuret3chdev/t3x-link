import { useEffect, useMemo, useState } from "react";
import { DishTool } from "@/components/t3x/dish-tool";
import { formatMbps, formatMs } from "@/lib/net/format";
import { loadCatalog } from "@/lib/net/elements";
import { dishGap, prepareElements, projectSky } from "@/lib/net/propagate";
import type { LinkModel } from "@/components/t3x/use-link";

const KITS = [
  ["setup", "Setup"],
  ["sky", "Obstruction"],
  ["cable", "Cable power"],
  ["rain", "Rain"],
  ["mount", "Mount"],
  ["power", "Battery"],
] as const;

type Kit = (typeof KITS)[number][0];

function Choice({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tab-wrap">
      {options.map((item) => (
        <button key={item.id} type="button" className="tab" aria-pressed={value === item.id} onClick={() => onChange(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function StarTools({ model }: { model: LinkModel }) {
  const [kit, setKit] = useState<Kit>("setup");
  const ping = model.path?.pingMs ?? null;
  const down = model.path?.downMbps ?? null;
  const [skyGap, setSkyGap] = useState<{ missingPct: number; inDish: number; low: number; empty: number } | null>(null);
  const [gapNote, setGapNote] = useState("");
  const [run, setRun] = useState("30");
  const [rain, setRain] = useState("light");
  const [tree, setTree] = useState("10");
  const [gap, setGap] = useState("15");
  const [pack, setPack] = useState("300");
  const [dish, setDish] = useState("gen3");

  useEffect(() => {
    if (kit !== "sky") return;
    const lat = model.identity?.lat;
    const lon = model.identity?.lon;
    if (lat == null || lon == null) {
      setSkyGap(null);
      setGapNote("Location is not in yet. Open Hub once, then come back.");
      return;
    }
    let cancel = false;
    setGapNote("Counting Starlink in the dish sky…");
    loadCatalog({ data: { group: "starlink" } })
      .then((catalog) => projectSky(prepareElements(catalog.elements), { lat, lon }, () => cancel))
      .then((sky) => {
        if (cancel) return;
        setSkyGap(dishGap(sky));
        setGapNote("");
      })
      .catch((reason: unknown) => {
        if (cancel) return;
        setSkyGap(null);
        setGapNote(reason instanceof Error ? reason.message : "The sky count did not finish.");
      });
    return () => {
      cancel = true;
    };
  }, [kit, model.identity?.lat, model.identity?.lon]);

  const cable = useMemo(() => {
    const metres = Number(run);
    const watts = dish === "mini" ? 30 : dish === "gen2" ? 60 : 80;
    const amps = watts / 48;
    const drop = amps * 0.168 * metres;
    const risk = drop > 8 ? "High reboot risk" : drop > 4 ? "Watch the power" : "Power is fine";
    return { drop: drop.toFixed(1), watts, risk };
  }, [dish, run]);

  const weather = useMemo(() => {
    const add = rain === "dry" ? 0 : rain === "light" ? 8 : rain === "heavy" ? 40 : 15;
    const speed = rain === "dry" ? 1 : rain === "light" ? 0.9 : rain === "heavy" ? 0.5 : 0.75;
    return {
      ping: ping == null ? null : Math.round(ping + add),
      down: down == null ? null : down * speed,
      note: rain === "heavy" ? "Heavy rain can fade the beam. It should recover when the cell passes." : "Light rain barely moves a clear link.",
    };
  }, [down, ping, rain]);

  const mount = useMemo(() => {
    const rise = Math.max(0, Number(tree) - 4);
    const angle = (Math.atan2(rise, Number(gap)) * 180) / Math.PI;
    const clear = angle < 25;
    return { angle: Math.round(angle), clear };
  }, [gap, tree]);

  const battery = useMemo(() => {
    const watts = dish === "mini" ? 30 : dish === "gen2" ? 60 : 80;
    const hours = (Number(pack) * 0.85) / watts;
    return { watts, hours: hours.toFixed(1) };
  }, [dish, pack]);

  return (
    <section className="card grid gap-3">
      <p className="kicker">Star-tools</p>
      <h2 className="text-2xl font-semibold">Kits</h2>
      <p className="text-base text-fg">Obstruction counts the real Starlink sky above 25°. The other kits estimate from the speed on this phone.</p>
      <div className="tab-wrap">
        {KITS.map(([id, label]) => (
          <button key={id} type="button" className="tab" aria-pressed={kit === id} onClick={() => setKit(id)}>
            {label}
          </button>
        ))}
      </div>
      {kit === "setup" ? <DishTool ping={ping} down={down} /> : null}
      {kit === "sky" ? (
        <div className="grid gap-2">
          {gapNote ? <p className="text-base text-fg">{gapNote}</p> : null}
          {skyGap ? (
            <>
              <p className="text-lg font-semibold">{skyGap.missingPct}% of the dish sky has no Starlink</p>
              <p className="text-base text-fg">{skyGap.inDish} above 25°. {skyGap.low} are up but too low for the dish.</p>
              <p className="text-base text-fg">{skyGap.empty} of 36 sky cells are empty. This is coverage, not trees.</p>
            </>
          ) : null}
        </div>
      ) : null}
      {kit === "cable" ? (
        <div className="grid gap-3">
          <Choice
            value={dish}
            onChange={setDish}
            options={[
              { id: "gen2", label: "Gen 2" },
              { id: "gen3", label: "Gen 3" },
              { id: "mini", label: "Mini" },
            ]}
          />
          <Choice
            value={run}
            onChange={setRun}
            options={[
              { id: "15", label: "15 m" },
              { id: "30", label: "30 m" },
              { id: "45", label: "45 m" },
              { id: "75", label: "75 m" },
            ]}
          />
          <p className="text-lg font-semibold">{cable.risk}</p>
          <p className="text-base text-fg">
            About {cable.watts} W. Voltage drop about {cable.drop} V on a 48 V run.
          </p>
        </div>
      ) : null}
      {kit === "rain" ? (
        <div className="grid gap-3">
          <Choice
            value={rain}
            onChange={setRain}
            options={[
              { id: "dry", label: "Dry" },
              { id: "light", label: "Light" },
              { id: "moderate", label: "Moderate" },
              { id: "heavy", label: "Heavy" },
            ]}
          />
          <p className="text-lg font-semibold">{formatMs(weather.ping)}</p>
          <p className="text-base text-fg">{formatMbps(weather.down)}</p>
          <p className="text-base text-fg">{weather.note}</p>
        </div>
      ) : null}
      {kit === "mount" ? (
        <div className="grid gap-3">
          <Choice
            value={tree}
            onChange={setTree}
            options={[
              { id: "6", label: "Tree 6 m" },
              { id: "10", label: "Tree 10 m" },
              { id: "15", label: "Tree 15 m" },
            ]}
          />
          <Choice
            value={gap}
            onChange={setGap}
            options={[
              { id: "5", label: "5 m away" },
              { id: "15", label: "15 m away" },
              { id: "30", label: "30 m away" },
            ]}
          />
          <p className="text-lg font-semibold">{mount.clear ? "Clears a 25° sky" : "The tree blocks the sky"}</p>
          <p className="text-base text-fg">The tree top sits about {mount.angle}° above a roof dish.</p>
        </div>
      ) : null}
      {kit === "power" ? (
        <div className="grid gap-3">
          <Choice
            value={dish}
            onChange={setDish}
            options={[
              { id: "gen2", label: "Gen 2" },
              { id: "gen3", label: "Gen 3" },
              { id: "mini", label: "Mini" },
            ]}
          />
          <Choice
            value={pack}
            onChange={setPack}
            options={[
              { id: "100", label: "100 Wh" },
              { id: "300", label: "300 Wh" },
              { id: "500", label: "500 Wh" },
              { id: "1000", label: "1 kWh" },
            ]}
          />
          <p className="text-lg font-semibold">{battery.hours} hours</p>
          <p className="text-base text-fg">About {battery.watts} W while the dish is on.</p>
        </div>
      ) : null}
    </section>
  );
}
