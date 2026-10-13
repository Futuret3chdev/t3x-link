import { regionName } from "@/lib/net/format";
import type { NetIdentity } from "@/lib/net/types";

type RipeGeoloc = {
  data?: {
    located_resources?: Array<{
      locations?: Array<{
        country?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
      }>;
    }>;
  };
};

type RipePrefix = {
  data?: {
    asns?: Array<{ asn?: number; holder?: string }>;
  };
};

function prettyHolder(holder: string): string {
  const parts = holder.split(" - ");
  const legal = (parts.length > 1 ? parts.slice(1).join(" - ") : holder).replace(/,\s*[A-Z]{2}$/, "").trim();
  return legal || holder;
}

function isStarlink(holder: string, asn: number | null): boolean {
  if (asn === 14593) return true;
  return /starlink|spacex|space exploration/i.test(holder);
}

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function readIdentity(signal?: AbortSignal): Promise<NetIdentity> {
  const probe = await fetch(`https://speed.cloudflare.com/__down?bytes=0&r=${Math.random()}`, {
    cache: "no-store",
    signal,
  });
  if (!probe.ok) throw new Error("The path probe did not answer.");
  const ip = probe.headers.get("cf-meta-ip")?.trim() || "";
  if (!ip) throw new Error("This browser did not reveal a public address.");

  const hintedCity = probe.headers.get("cf-meta-city")?.trim() || "";
  const hintedCountry = probe.headers.get("cf-meta-country")?.trim() || "";
  const hintedAsn = Number(probe.headers.get("cf-meta-asn") || "");
  const hintedLat = Number(probe.headers.get("cf-meta-latitude") || "");
  const hintedLon = Number(probe.headers.get("cf-meta-longitude") || "");

  const [geo, prefix] = await Promise.all([
    readJson<RipeGeoloc>(
      `https://stat.ripe.net/data/geoloc/data.json?resource=${encodeURIComponent(ip)}`,
      signal,
    ),
    readJson<RipePrefix>(
      `https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(ip)}`,
      signal,
    ),
  ]);

  const location = geo?.data?.located_resources?.[0]?.locations?.[0];
  const asnRow = prefix?.data?.asns?.[0];
  const rawHolder = asnRow?.holder?.trim() || "";
  const asn = asnRow?.asn ?? (Number.isFinite(hintedAsn) ? hintedAsn : null);
  const holder = prettyHolder(rawHolder);
  const countryCode = (location?.country || hintedCountry || "").toUpperCase();
  const lat = location?.latitude ?? (Number.isFinite(hintedLat) ? hintedLat : null);
  const lon = location?.longitude ?? (Number.isFinite(hintedLon) ? hintedLon : null);

  return {
    ip,
    asn,
    holder,
    city: location?.city || hintedCity,
    country: regionName(countryCode),
    countryCode,
    lat: typeof lat === "number" && Number.isFinite(lat) ? lat : null,
    lon: typeof lon === "number" && Number.isFinite(lon) ? lon : null,
    starlink: isStarlink(rawHolder, asn),
  };
}
