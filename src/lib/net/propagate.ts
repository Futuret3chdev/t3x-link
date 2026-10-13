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

export type SkyDot = { name: string; az: number; el: number };

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
            sky.push({ name: sat.name, az, el });
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
