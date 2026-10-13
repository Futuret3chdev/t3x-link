import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Copy, LocateFixed, Navigation } from "lucide-react";
import { ConstellationMap } from "@/components/t3x/constellation-map";
import { useConstellation } from "@/components/t3x/use-constellation";
import { readBenchHistory, readSky, subscribeMemory, writeSky } from "@/lib/net/memory";
import { leoNote } from "@/lib/net/speed";
import type { Observer, SkyDot } from "@/lib/net/propagate";
import type { LinkModel } from "@/components/t3x/use-link";

const SECTORS = 24;
const BANDS = 3;
const EDGES = [0.12, 0.278, 0.5, 0.722];
const GOLD_R = 0.722 * 86;

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

function skyPoint(az: number, el: number): [number, number] | null {
  if (el <= 0 || el > 90) return null;
  const radius = Math.min(90, ((90 - el) / 65) * GOLD_R);
  return point(radius, (az * Math.PI) / 180);
}

function wedgeBlocked(mask: string, az: number, el: number): boolean {
  if (el < 25) return false;
  const radius = ((90 - el) / 65) * GOLD_R;
  const edges = EDGES.map((edge) => edge * 86);
  let band = -1;
  for (let index = 0; index < BANDS; index += 1) {
    if (radius >= edges[index] && radius < edges[index + 1]) band = index;
  }
  if (band < 0) return false;
  const sector = Math.min(SECTORS - 1, Math.floor(((az % 360) / 360) * SECTORS));
  return mask[band * SECTORS + sector] === "1";
}

function compassLabel(az: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(az / 45) % 8];
}

function roundPlace(lat: number, lon: number): Observer {
  return { lat: Math.round(lat * 50) / 50, lon: Math.round(lon * 50) / 50 };
}

export function StarlinkDesk({ model }: { model: LinkModel }) {
  const [mask, setMask] = useState("0".repeat(72));
  const [ping, setPing] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [observer, setObserver] = useState<Observer | null>(null);
  const [placeLabel, setPlaceLabel] = useState("");
  const [tracking, setTracking] = useState(false);
  const [facing, setFacing] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [compassNote, setCompassNote] = useState("");
  const [placeNote, setPlaceNote] = useState("");
  const picked = useRef(false);
  const headingRef = useRef<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const fleet = useConstellation(observer);
  const clear = useMemo(() => [...mask].filter((bit) => bit === "0").length, [mask]);
  const score = Math.round((clear / 72) * 100);
  const tone = score >= 85 ? "Mostly clear" : score >= 60 ? "Partial" : "Blocked";
  const note = leoNote(ping, Boolean(model.identity?.starlink));
  const covered = useMemo(
    () => fleet.sky.filter((sat) => wedgeBlocked(mask, sat.az, sat.el)).length,
    [fleet.sky, mask],
  );

  useEffect(() => {
    setMask(readSky());
    const sync = () => setPing(readBenchHistory()[0]?.pingMs ?? null);
    sync();
    return subscribeMemory(sync);
  }, []);

  useEffect(() => {
    if (picked.current || tracking) return;
    const lat = model.identity?.lat;
    const lon = model.identity?.lon;
    if (lat == null || lon == null) return;
    setObserver(roundPlace(lat, lon));
    setPlaceLabel("Rough fix from the public address");
  }, [model.identity, tracking]);

  useEffect(() => {
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  useEffect(() => {
    if (!facing) return;
    const onOrient = (event: DeviceOrientationEvent) => {
      const webkit = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      let next: number | null = null;
      if (typeof webkit === "number" && Number.isFinite(webkit)) next = webkit;
      else if (event.alpha != null && Number.isFinite(event.alpha)) next = (360 - event.alpha) % 360;
      if (next == null) return;
      const prev = headingRef.current ?? next;
      let delta = next - prev;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const value = (prev + delta * 0.3 + 360) % 360;
      headingRef.current = value;
      setHeading(value);
    };
    window.addEventListener("deviceorientationabsolute", onOrient, true);
    window.addEventListener("deviceorientation", onOrient, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrient, true);
      window.removeEventListener("deviceorientation", onOrient, true);
    };
  }, [facing]);

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

  function followLocation() {
    if (!navigator.geolocation) {
      setPlaceNote("This browser has no location service.");
      return;
    }
    picked.current = true;
    setPlaceNote("");
    setTracking(true);
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setObserver(roundPlace(pos.coords.latitude, pos.coords.longitude));
        setPlaceLabel("Following this phone");
        setPlaceNote("");
      },
      () => {
        setTracking(false);
        setPlaceNote("Location was blocked. The public-address estimate is still available.");
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 },
    );
  }

  function stopLocation() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setTracking(false);
    setPlaceLabel((label) => (label === "Following this phone" ? "Last phone fix" : label));
  }

  async function followPhone() {
    const ctor = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (typeof ctor.requestPermission === "function") {
        const result = await ctor.requestPermission();
        if (result !== "granted") {
          setCompassNote("Compass permission was denied. The sky stays north-up.");
          setFacing(false);
          return;
        }
      }
      setFacing(true);
      setCompassNote("");
    } catch {
      setCompassNote("This phone did not share a compass. The sky stays north-up.");
      setFacing(false);
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

  const spin = facing && heading != null ? `rotate(${(-heading).toFixed(1)} 100 100)` : undefined;
  const highest = fleet.summary.highest;

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="card stat-card stat-card-primary">
          <p className="stat-label">Catalogued</p>
          <p className="stat-value mt-2 text-primary">
            {fleet.summary.total ? fleet.summary.total.toLocaleString() : fleet.phase === "loading" ? "…" : "—"}
          </p>
          <p className="mt-1 text-base text-fg">{fleet.source || "Public orbits"}</p>
        </article>
        <article className="card stat-card stat-card-primary">
          <p className="stat-label">Above you</p>
          <p className="stat-value mt-2 text-primary">{observer ? fleet.summary.above.toLocaleString() : "—"}</p>
          <p className="mt-1 text-base text-fg">{placeLabel || "Needs a place"}</p>
        </article>
        <article className="card stat-card stat-card-accent">
          <p className="stat-label">Inside 25°</p>
          <p className="stat-value mt-2 text-accent">{observer ? fleet.summary.inWindow.toLocaleString() : "—"}</p>
          <p className="mt-1 text-base text-fg">{covered ? `${covered} behind your marks` : "Clear of your marks"}</p>
        </article>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card">
          <p className="kicker">Sky window</p>
          <h2 className="mt-2 text-2xl font-semibold">
            {score}% clear · {tone}
          </h2>
          <p className="mt-2 text-base text-fg">
            {facing
              ? "The top of the circle is where this phone is pointing. Turn and the sky turns with you."
              : "North is up. Turn the phone, or tap a wedge to mark a roof, tree, or wall."}{" "}
            The gold ring is 25° above the horizon. Gold dots are Starlink inside that ring. Blue dots are up, but too low for the dish. Red means your mark covers that one.
          </p>
          <svg viewBox="0 0 200 200" className="mx-auto mt-4 aspect-square w-full max-w-md" role="group" aria-label={`Sky clearance ${score} percent`}>
            {facing ? <polygon points="100,1.5 95.5,8 104.5,8" fill="var(--color-accent)" /> : null}
            <g transform={spin}>
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
              <circle cx="100" cy="100" r={GOLD_R} fill="none" stroke="var(--color-accent)" strokeWidth="1.6" />
              {fleet.sky.map((sat) => (
                <SkyMark key={`${sat.name}-${sat.az.toFixed(0)}`} sat={sat} blocked={wedgeBlocked(mask, sat.az, sat.el)} />
              ))}
              <circle cx="100" cy="100" r="2.4" fill="var(--color-fg)" />
              <text x="100" y="16" textAnchor="middle" fill="var(--color-fg)" fontSize="9" fontWeight="700">
                N
              </text>
            </g>
          </svg>
          <div className="mt-3 flex flex-wrap gap-3 text-base text-fg">
            <span className="inline-flex items-center gap-2"><i className="legend-dot legend-dot-accent" /> In the window</span>
            <span className="inline-flex items-center gap-2"><i className="legend-dot legend-dot-primary" /> Above horizon</span>
            <span className="inline-flex items-center gap-2"><i className="legend-dot legend-dot-mark" /> Behind a mark</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Clear marks
            </button>
            {facing ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setFacing(false);
                  setHeading(null);
                  headingRef.current = null;
                }}
              >
                <Compass aria-hidden="true" size={16} />
                North up
              </button>
            ) : (
              <button type="button" className="btn btn-accent" onClick={() => void followPhone()}>
                <Compass aria-hidden="true" size={16} />
                Follow the phone
              </button>
            )}
            <a className="btn btn-primary" href="https://www.starlink.com/map" target="_blank" rel="noreferrer">
              Check address on Starlink
            </a>
          </div>
          {compassNote ? <p className="mt-3 text-base text-mark">{compassNote}</p> : null}
        </section>

        <div className="grid content-start gap-3">
          <article className="card accent-rail">
            <p className="kicker">Overhead now</p>
            <p className="mt-2 text-xl font-semibold">
              {highest
                ? `${highest.name}`
                : observer
                  ? fleet.phase === "loading"
                    ? "Reading the catalogue…"
                    : "Nothing high enough yet."
                  : "Pick a place to measure elevation."}
            </p>
            {highest ? (
              <p className="mt-2 text-base text-fg">
                {Math.round(highest.el)}° up · {compassLabel(highest.az)} · {Math.round(highest.az)}°
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {tracking ? (
                <button type="button" className="btn btn-ghost" onClick={stopLocation}>
                  Stop following
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={followLocation}>
                  <LocateFixed aria-hidden="true" size={16} />
                  Follow my location
                </button>
              )}
              {model.identity?.lat != null && model.identity.lon != null ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    picked.current = true;
                    stopLocation();
                    setObserver(roundPlace(model.identity!.lat!, model.identity!.lon!));
                    setPlaceLabel("Rough fix from the public address");
                  }}
                >
                  <Navigation aria-hidden="true" size={16} />
                  Public address
                </button>
              ) : null}
            </div>
            {placeNote ? <p className="mt-3 text-base text-mark">{placeNote}</p> : null}
          </article>
          <article className="card">
            <p className="kicker">This network</p>
            <p className="mt-2 text-lg font-semibold">
              {model.identity?.starlink
                ? "Provider reads as Starlink."
                : model.identity
                  ? "This public address is not Starlink."
                  : "Still reading the provider."}
            </p>
            {note ? <p className="mt-2 text-base text-fg">{note}</p> : null}
            {!ping ? <p className="mt-2 text-base text-fg">Run the bench to compare latency with a LEO link.</p> : null}
          </article>
          <article className="card">
            <p className="kicker">Dish admin</p>
            <p className="mt-2 text-base text-fg">
              On the Starlink Wi-Fi the dish is at 192.168.100.1. A secure page cannot read it for you — the dish does not allow that.
            </p>
            <button type="button" className="btn btn-ghost mt-3" onClick={() => void copyDish()}>
              <Copy aria-hidden="true" size={16} />
              {copied ? "Copied" : "Copy 192.168.100.1"}
            </button>
          </article>
        </div>
      </div>

      <section className="card">
        <p className="kicker">The fleet</p>
        <h2 className="mt-2 text-2xl font-semibold">Where every catalogued Starlink is</h2>
        <p className="mt-2 text-base text-fg">
          {fleet.phase === "loading"
            ? "Fetching the public orbit catalogue…"
            : fleet.phase === "error"
              ? fleet.error
              : `${fleet.summary.total.toLocaleString()} objects placed for ${
                  fleet.summary.at
                    ? new Date(fleet.summary.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                    : "now"
                }. Gold is inside your 25° window, blue is above the horizon, ivory is the rest of the fleet. The red dot is the place we measured from.`}
        </p>
        <p className="mt-2 text-base text-fg">
          Positions come from public orbital elements ({fleet.source || "CelesTrak"}), stepped forward to this minute. Starlink moves its own satellites, so a dot can be off by a few kilometres. This is not a live feed from SpaceX.
        </p>
        {fleet.error && fleet.phase !== "error" ? <p className="mt-2 text-base text-mark">{fleet.error}</p> : null}
        <ConstellationMap bind={fleet.bindMap} />
      </section>

      <article className="card">
        <p className="kicker">Before you mount</p>
        <ul className="mt-2 grid gap-2 text-base text-fg">
          <li>Keep most of the sky inside the gold ring clear.</li>
          <li>Metal roofs and deep eaves block more than glass.</li>
          <li>The wedges are your taps, not a camera scan.</li>
          <li>Only Starlink’s map can confirm service at an address.</li>
        </ul>
      </article>
    </div>
  );
}

function SkyMark({ sat, blocked }: { sat: SkyDot; blocked: boolean }) {
  const spot = skyPoint(sat.az, sat.el);
  if (!spot) return null;
  const inWindow = sat.el >= 25;
  return (
    <circle
      cx={spot[0]}
      cy={spot[1]}
      r={inWindow ? 1.45 : 0.75}
      fill={blocked ? "var(--color-mark)" : inWindow ? "var(--color-accent)" : "var(--color-primary)"}
    >
      <title>{`${sat.name} · ${Math.round(sat.el)}°`}</title>
    </circle>
  );
}
