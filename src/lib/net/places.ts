import { createServerFn } from "@tanstack/react-start";
import { haversine } from "@/lib/net/format";
import { cleanSsid } from "@/lib/net/wifi-profile";
import type { Hotspot, PlaceHit } from "@/lib/net/types";

const UA = "T3xLink/1.0 (Futuret3ch; https://github.com/Futuret3chdev/t3x-link)";

type NominatimRow = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  type?: string;
  category?: string;
  extratags?: Record<string, string>;
};

const SEARCHES = ["library", "community centre", "coworking", "internet cafe", "cafe"];

function httpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function viewbox(lat: number, lon: number, radius: number): string {
  const dLat = radius / 111_320;
  const dLon = radius / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return `${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}`;
}

function kindOf(type: string, tags: Record<string, string>): { kind: Hotspot["kind"]; kindLabel: string } {
  if (type.includes("library")) return { kind: "library", kindLabel: "Library" };
  if (type.includes("cowork")) return { kind: "cowork", kindLabel: "Cowork" };
  if (type.includes("cafe")) return { kind: "cafe", kindLabel: "Café" };
  if (type.includes("community")) return { kind: "community", kindLabel: "Community" };
  if (tags.internet_access) return { kind: "wifi", kindLabel: "Mapped Wi-Fi" };
  return { kind: "place", kindLabel: "Place" };
}

function isUseful(type: string, tags: Record<string, string>): boolean {
  return /library|community|cowork|cafe|internet/.test(type) || Boolean(tags.internet_access);
}

async function nominatim(params: Record<string, string>): Promise<NominatimRow[]> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 429) throw new Error("Place search is busy. Try again in a moment.");
  if (!res.ok) throw new Error("Place search failed.");
  const rows = (await res.json()) as NominatimRow[];
  return Array.isArray(rows) ? rows : [];
}

export const searchHotspots = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = input as { lat?: unknown; lon?: unknown; radius?: unknown };
    const lat = Number(raw?.lat);
    const lon = Number(raw?.lon);
    const radius = Math.round(Number(raw?.radius));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Latitude is out of range.");
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("Longitude is out of range.");
    if (!Number.isFinite(radius) || radius < 300 || radius > 6000) throw new Error("Pick a radius between 300 m and 6 km.");
    return { lat, lon, radius };
  })
  .handler(async ({ data }): Promise<Hotspot[]> => {
    const { lat, lon, radius } = data;
    const box = viewbox(lat, lon, radius);
    const spots: Hotspot[] = [];
    const seen = new Set<string>();
    for (const q of SEARCHES) {
      const rows = await nominatim({
        format: "jsonv2",
        limit: "12",
        bounded: "1",
        extratags: "1",
        viewbox: box,
        q,
      });
      for (const row of rows) {
        const pointLat = Number(row.lat);
        const pointLon = Number(row.lon);
        if (!Number.isFinite(pointLat) || !Number.isFinite(pointLon)) continue;
        const id = `${row.osm_type || "n"}/${row.osm_id ?? spots.length}`;
        if (seen.has(id)) continue;
        const tags = row.extratags || {};
        const type = `${row.type || ""} ${row.category || ""}`.toLowerCase();
        if (!isUseful(type, tags)) continue;
        const distanceM = haversine(lat, lon, pointLat, pointLon);
        if (distanceM > radius * 1.08) continue;
        seen.add(id);
        const kind = kindOf(type, tags);
        const fee = `${tags["internet_access:fee"] || ""} ${tags.fee || ""}`.toLowerCase();
        const address = (row.display_name || "")
          .split(",")
          .slice(0, 3)
          .join(",")
          .replace(row.name || "", "")
          .replace(/^,\s*/, "")
          .trim();
        spots.push({
          id,
          name: row.name || kind.kindLabel,
          lat: pointLat,
          lon: pointLon,
          kind: kind.kind,
          kindLabel: kind.kindLabel,
          free: fee.includes("no") || fee.includes("none") || fee.includes("free"),
          access: tags.internet_access || "",
          hours: tags.opening_hours || "",
          address,
          website: httpUrl(tags.website || tags["contact:website"]),
          distanceM,
          ssid: cleanSsid(tags["internet_access:ssid"] || tags.ssid || "") || "",
        });
      }
    }
    spots.sort((a, b) => a.distanceM - b.distanceM);
    return spots;
  });

export const geocodePlace = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const q = String((input as { q?: unknown })?.q || "")
      .trim()
      .slice(0, 80);
    if (q.length < 2) throw new Error("Type at least 2 characters.");
    return { q };
  })
  .handler(async ({ data }): Promise<PlaceHit | null> => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(data.q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 429) throw new Error("Place search is busy. Use a city chip or try again shortly.");
    if (!res.ok) throw new Error("Place search failed.");
    const rows = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
    const hit = rows[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { label: hit.display_name || data.q, lat, lon };
  });
