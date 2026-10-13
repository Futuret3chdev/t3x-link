import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { readBenchHistory, readSky, subscribeMemory, writeSky } from "@/lib/net/memory";
import { leoNote } from "@/lib/net/speed";
import type { LinkModel } from "@/components/t3x/use-link";

const SECTORS = 24;
const BANDS = 3;
const EDGES = [0.12, 0.278, 0.5, 0.722];

function point(radius: number, theta: number): [number, number] {
  const x = 100 + radius * Math.sin(theta);
  const y = 100 - radius * Math.cos(theta);
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

function wedge(r0: number, r1: number, t0: number, t1: number): string {
  const large = t1 - t0 > Math.PI ? 1 : 0;
  const [x0, y0] = point(r1, t0);
  const [x1, y1] = point(r1, t1);
  const [x2, y2] = point(r0, t1);
  const [x3, y3] = point(r0, t0);
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

export function StarlinkDesk({ model }: { model: LinkModel }) {
  const [mask, setMask] = useState("0".repeat(72));
  const [ping, setPing] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const clear = useMemo(() => [...mask].filter((bit) => bit === "0").length, [mask]);
  const score = Math.round((clear / 72) * 100);
  const tone = score >= 85 ? "Mostly clear" : score >= 60 ? "Partial" : "Blocked";
  const note = leoNote(ping, Boolean(model.identity?.starlink));

  useEffect(() => {
    setMask(readSky());
    const sync = () => setPing(readBenchHistory()[0]?.pingMs ?? null);
    sync();
    return subscribeMemory(sync);
  }, []);

  function toggle(index: number) {
    const next = mask.split("");
    next[index] = next[index] === "1" ? "0" : "1";
    const value = next.join("");
    setMask(value);
    writeSky(value);
  }

  function reset() {
    const value = "0".repeat(72);
    setMask(value);
    writeSky(value);
  }

  async function copyDish() {
    try {
      await navigator.clipboard.writeText("192.168.100.1");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const cells = [];
  for (let band = 0; band < BANDS; band += 1) {
    for (let sector = 0; sector < SECTORS; sector += 1) {
      const index = band * SECTORS + sector;
      const t0 = (sector / SECTORS) * Math.PI * 2;
      const t1 = ((sector + 1) / SECTORS) * Math.PI * 2;
      cells.push({
        index,
        blocked: mask[index] === "1",
        d: wedge(EDGES[band] * 86, EDGES[band + 1] * 86, t0, t1),
      });
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="card">
        <p className="kicker">Sky window</p>
        <h2 className="mt-2 text-2xl font-semibold">
          {score}% clear · {tone}
        </h2>
        <p className="mt-2 text-sm text-muted">
          North is up. Tap a wedge to mark a roof, tree, or wall. The gold ring is 25° above the
          horizon — Starlink wants the sky inside it open. The dish steers itself; you do not aim at
          one satellite.
        </p>
        <svg viewBox="0 0 200 200" className="mx-auto mt-4 aspect-square w-full max-w-sm" role="group" aria-label={`Sky clearance ${score} percent`}>
          <circle cx="100" cy="100" r="92" fill="var(--color-bg)" stroke="var(--color-line)" />
          {cells.map((cell) => (
            <path
              key={cell.index}
              d={cell.d}
              role="button"
              tabIndex={-1}
              fill={cell.blocked ? "var(--color-mark)" : "transparent"}
              fillOpacity={cell.blocked ? 0.78 : 1}
              stroke="var(--color-line)"
              strokeWidth="0.4"
              onClick={() => toggle(cell.index)}
            >
              <title>{cell.blocked ? "Blocked wedge" : "Clear wedge"}</title>
            </path>
          ))}
          <circle cx="100" cy="100" r={0.722 * 86} fill="none" stroke="var(--color-accent)" strokeWidth="1.4" />
          <circle cx="100" cy="100" r="2.2" fill="var(--color-fg)" />
          <text x="100" y="14" textAnchor="middle" fill="var(--color-muted)" fontSize="8" fontWeight="600">
            N
          </text>
        </svg>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={reset}>
            Clear marks
          </button>
          <a className="btn btn-primary" href="https://www.starlink.com/map" target="_blank" rel="noreferrer">
            Check address on Starlink
          </a>
        </div>
      </section>

      <div className="grid content-start gap-3">
        <article className="card accent-rail">
          <p className="kicker">This network</p>
          <p className="mt-2 text-lg font-semibold">
            {model.identity?.starlink
              ? "Provider reads as Starlink."
              : model.identity
                ? "This public address is not Starlink."
                : "Still reading the provider."}
          </p>
          {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
          {!ping ? (
            <p className="mt-2 text-sm text-muted">Run the bench to compare latency with a LEO link.</p>
          ) : null}
        </article>
        <article className="card">
          <p className="kicker">Dish admin</p>
          <p className="mt-2 text-sm text-muted">
            On the Starlink Wi-Fi the dish is at 192.168.100.1. A secure page cannot read it for you —
            the dish does not allow that.
          </p>
          <button type="button" className="btn btn-ghost mt-3" onClick={() => void copyDish()}>
            <Copy aria-hidden="true" size={16} />
            {copied ? "Copied" : "Copy 192.168.100.1"}
          </button>
        </article>
        <article className="card">
          <p className="kicker">Before you mount</p>
          <ul className="mt-2 grid gap-2 text-sm text-muted">
            <li>Keep most of the sky inside the gold ring clear.</li>
            <li>Metal roofs and deep eaves block more than glass.</li>
            <li>This sketch is your taps, not a camera scan.</li>
            <li>Only Starlink’s map can confirm service at an address.</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
