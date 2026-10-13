export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 950) return `${Math.max(1, Math.round(meters))} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatMbps(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 100) return `${Math.round(value)} Mb/s`;
  if (value >= 10) return `${value.toFixed(1)} Mb/s`;
  return `${value.toFixed(2)} Mb/s`;
}

export function formatMs(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} ms`;
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLon = (lon2 - lon1) * p;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function regionName(code: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

export function wifiUri(input: {
  ssid: string;
  password: string;
  security: "WPA" | "WEP" | "nopass";
  hidden: boolean;
}): string {
  const esc = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");
  const ssid = esc(input.ssid);
  if (input.security === "nopass") return `WIFI:T:nopass;S:${ssid};H:${input.hidden};;`;
  return `WIFI:T:${input.security};S:${ssid};P:${esc(input.password)};H:${input.hidden};;`;
}

export function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
