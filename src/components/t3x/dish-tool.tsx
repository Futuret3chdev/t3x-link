import { useMemo, useState } from "react";
import { formatMbps, formatMs } from "@/lib/net/format";

const DISH = [
  { id: "gen2", label: "Gen 2" },
  { id: "gen3", label: "Gen 3" },
  { id: "mini", label: "Mini" },
] as const;

const SKY = [
  { id: "clear", label: "Clear sky" },
  { id: "trees", label: "Some trees" },
  { id: "blocked", label: "Blocked" },
] as const;

const CABLE = [
  { id: "15", label: "15 m" },
  { id: "30", label: "30 m" },
  { id: "45", label: "45 m" },
] as const;

const BAND = [
  { id: "eth", label: "Ethernet" },
  { id: "5", label: "5 GHz" },
  { id: "24", label: "2.4 GHz" },
] as const;

export function DishTool({ ping, down }: { ping: number | null; down: number | null }) {
  const [dish, setDish] = useState<(typeof DISH)[number]["id"]>("gen3");
  const [sky, setSky] = useState<(typeof SKY)[number]["id"]>("clear");
  const [cable, setCable] = useState<(typeof CABLE)[number]["id"]>("15");
  const [band, setBand] = useState<(typeof BAND)[number]["id"]>("5");

  const estimate = useMemo(() => {
    let pingAdd = dish === "mini" ? 8 : 0;
    let speed = 1;
    if (sky === "trees") {
      pingAdd += 15;
      speed *= 0.75;
    }
    if (sky === "blocked") {
      pingAdd += 45;
      speed *= 0.4;
    }
    if (cable === "30") speed *= 0.95;
    if (cable === "45") {
      speed *= 0.8;
      pingAdd += 5;
    }
    if (band === "5") speed *= 0.9;
    if (band === "24") speed *= 0.45;
    const nextPing = ping == null ? null : Math.round(ping + pingAdd);
    const nextDown = down == null ? null : Math.max(0.1, down * speed);
    let advice = "These settings are not holding a clear link back.";
    if (sky === "blocked") advice = "Raise the dish until more sky is clear.";
    else if (sky === "trees") advice = "Some trees are enough to cut the speed.";
    else if (cable === "45") advice = "A 45 m cable can drop power and reboot the dish.";
    else if (band === "24") advice = "2.4 GHz is the slow path. Ethernet or 5 GHz is faster.";
    return { nextPing, nextDown, advice };
  }, [band, cable, dish, down, ping, sky]);

  return (
    <div className="grid gap-3">
      <h2 className="text-2xl font-semibold">Starlink setup</h2>
      <p className="text-base text-fg">Starts from the speed measured on this phone, then adjusts for the dish, sky, cable, and Wi-Fi.</p>
      <div className="tab-wrap">
        {DISH.map((item) => (
          <button key={item.id} type="button" className="tab" aria-pressed={dish === item.id} onClick={() => setDish(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="tab-wrap">
        {SKY.map((item) => (
          <button key={item.id} type="button" className="tab" aria-pressed={sky === item.id} onClick={() => setSky(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="tab-wrap">
        {CABLE.map((item) => (
          <button key={item.id} type="button" className="tab" aria-pressed={cable === item.id} onClick={() => setCable(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="tab-wrap">
        {BAND.map((item) => (
          <button key={item.id} type="button" className="tab" aria-pressed={band === item.id} onClick={() => setBand(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <article>
          <p className="stat-label">Measured</p>
          <p className="text-lg font-semibold">{formatMs(ping)}</p>
          <p className="text-base text-fg">{formatMbps(down)}</p>
        </article>
        <article>
          <p className="stat-label">With this setup</p>
          <p className="text-lg font-semibold">{formatMs(estimate.nextPing)}</p>
          <p className="text-base text-fg">{formatMbps(estimate.nextDown)}</p>
        </article>
      </div>
      <p className="text-base text-fg">{estimate.advice}</p>
    </div>
  );
}
