import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from "satellite.js";
import type { ElementSet } from "@/lib/net/elements";

export type PreparedSat = { name: string; satrec: ReturnType<typeof twoline2satrec> };

export type Observer = { lat: number; lon: number };

export type SkyDot = { name: string; az: number; el: number; rangeKm: number };

export type SatFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { name: string; el: number };
  }>;
};

export type ConstellationFrame = {
  at: number;
  total: number;
  above: number;
  inWindow: number;
  highest: { name: string; az: number; el: number } | null;
  sky: SkyDot[];
  features: SatFeatureCollection;
  observer: Observer | null;
};

export function prepareElements(elements: ElementSet[]): PreparedSat[] {
  const prepared: PreparedSat[] = [];
  for (const element of elements) {
    try {
      prepared.push({ name: element.name, satrec: twoline2satrec(element.line1, element.line2) });
    } catch {
      // Skip a broken line rather than dropping the whole fleet.
    }
  }
  return prepared;
}

export function lookAngles(sat: PreparedSat, observer: Observer, date: Date): { az: number; el: number; rangeKm: number } | null {
  try {
    const gmst = gstime(date);
    const pv = propagate(sat.satrec, date);
    if (!pv || !pv.position || typeof pv.position === "boolean") return null;
    const site = {
      longitude: degreesToRadians(observer.lon),
      latitude: degreesToRadians(observer.lat),
      height: 0.05,
    };
    const look = ecfToLookAngles(site, eciToEcf(pv.position, gmst));
    const toDeg = 180 / Math.PI;
    const geo = eciToGeodetic(pv.position, gmst);
    const height = geo.height;
    const sinE = Math.sin(look.elevation);
    const rangeKm = -6371 * sinE + Math.sqrt((6371 * sinE) ** 2 + height * height + 2 * 6371 * height);
    return { az: (look.azimuth * toDeg + 360) % 360, el: look.elevation * toDeg, rangeKm: Math.max(0, rangeKm) };
  } catch {
    return null;
  }
}

export async function projectSky(
  prepared: PreparedSat[],
  observer: Observer,
  cancelled: () => boolean,
): Promise<SkyDot[]> {
  const date = new Date();
  const sky: SkyDot[] = [];
  for (let index = 0; index < prepared.length; index += 900) {
    if (cancelled()) throw new Error("cancelled");
    const end = Math.min(prepared.length, index + 900);
    for (let cursor = index; cursor < end; cursor += 1) {
      const look = lookAngles(prepared[cursor], observer, date);
      if (!look || look.el <= 0) continue;
      sky.push({ name: prepared[cursor].name, az: look.az, el: look.el, rangeKm: look.rangeKm });
    }
    if (end < prepared.length) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  sky.sort((a, b) => b.el - a.el);
  return sky;
}

export type PassWindow = {
  start: number;
  peak: number;
  end: number;
  maxEl: number;
  riseAz: number;
  setAz: number;
};

export function nextPass(sat: PreparedSat, observer: Observer, from = Date.now(), step = 30_000, limit = 18 * 60 * 60 * 1000): PassWindow | null {
  const horizon = 10;
  let rise: { t: number; az: number } | null = null;
  let maxEl = -90;
  let peak = from;
  for (let offset = 0; offset <= limit; offset += step) {
    const at = from + offset;
    const look = lookAngles(sat, observer, new Date(at));
    if (!look) continue;
    if (look.el >= horizon) {
      if (!rise) rise = { t: at, az: look.az };
      if (look.el > maxEl) {
        maxEl = look.el;
        peak = at;
      }
    } else if (rise) {
      return { start: rise.t, peak, end: at, maxEl, riseAz: rise.az, setAz: look.az };
    }
  }
  return null;
}

export async function upcomingPasses(
  sats: PreparedSat[],
  observer: Observer,
  cancelled: () => boolean,
): Promise<Array<PassWindow & { name: string }>> {
  const found: Array<PassWindow & { name: string }> = [];
  const heavy = sats.length > 200;
  const step = heavy ? 120_000 : 60_000;
  const limit = (heavy ? 6 : 12) * 60 * 60 * 1000;
  const list = heavy ? sats.slice(0, 40) : sats;
  for (let index = 0; index < list.length; index += 1) {
    if (cancelled()) throw new Error("cancelled");
    const pass = nextPass(list[index], observer, Date.now(), step, limit);
    if (pass) found.push({ ...pass, name: list[index].name });
    if (index % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  found.sort((a, b) => a.start - b.start);
  return found.slice(0, 20);
}

export async function projectConstellation(
  prepared: PreparedSat[],
  observer: Observer | null,
  cancelled: () => boolean,
): Promise<ConstellationFrame> {
  const date = new Date();
  const gmst = gstime(date);
  const site = observer
    ? {
        longitude: degreesToRadians(observer.lon),
        latitude: degreesToRadians(observer.lat),
        height: 0.05,
      }
    : null;
  const features: SatFeatureCollection["features"] = [];
  const sky: SkyDot[] = [];
  let total = 0;
  let above = 0;
  let inWindow = 0;
  let highest: ConstellationFrame["highest"] = null;

  for (let index = 0; index < prepared.length; index += 900) {
    if (cancelled()) throw new Error("cancelled");
    const end = Math.min(prepared.length, index + 900);
    for (let cursor = index; cursor < end; cursor += 1) {
      const sat = prepared[cursor];
      try {
        const pv = propagate(sat.satrec, date);
        if (!pv.position || typeof pv.position === "boolean") continue;
        const position = pv.position;
        const geo = eciToGeodetic(position, gmst);
        if (geo.height < 200 || geo.height > 2000) continue;
        const lat = (geo.latitude * 180) / Math.PI;
        let lon = (geo.longitude * 180) / Math.PI;
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        let el = -90;
        if (site) {
          const look = ecfToLookAngles(site, eciToEcf(position, gmst));
          const toDeg = 180 / Math.PI;
          el = look.elevation * toDeg;
          if (el > 0) {
            const az = (look.azimuth * toDeg + 360) % 360;
            above += 1;
            if (el >= 25) inWindow += 1;
            const sinE = Math.sin(look.elevation);
            const rangeKm = -6371 * sinE + Math.sqrt((6371 * sinE) ** 2 + geo.height ** 2 + 2 * 6371 * geo.height);
            sky.push({ name: sat.name, az, el, rangeKm: Math.max(0, rangeKm) });
            if (!highest || el > highest.el) highest = { name: sat.name, az, el };
          }
        }
        total += 1;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: { name: sat.name, el: Math.round(el) },
        });
      } catch {
        // One bad element should not drop the rest of the fleet.
      }
    }
    if (end < prepared.length) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    at: date.getTime(),
    total,
    above,
    inWindow,
    highest,
    sky,
    features: { type: "FeatureCollection", features },
    observer,
  };
}
