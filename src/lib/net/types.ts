export type LinkReading = {
  online: boolean;
  type: string;
  typeLabel: string;
  effectiveType: string;
  effectiveLabel: string;
  downlink: number | null;
  rtt: number | null;
  saveData: boolean;
};

export type NetIdentity = {
  ip: string;
  asn: number | null;
  holder: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number | null;
  lon: number | null;
  starlink: boolean;
};

export type NatReport = {
  local: string[];
  reflexive: string[];
  relay: boolean;
  hiddenLocal: boolean;
};

export type BenchResult = {
  at: number;
  pingMs: number;
  jitterMs: number;
  downMbps: number;
  upMbps: number | null;
  samples: number[];
  loadedPingMs?: number | null;
  ttfbMs?: number | null;
  parallelMbps?: number | null;
  missed?: number;
};

export type HotspotKind = "library" | "cafe" | "cowork" | "community" | "wifi" | "place";

export type Hotspot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: HotspotKind;
  kindLabel: string;
  free: boolean;
  access: string;
  hours: string;
  address: string;
  website: string | null;
  distanceM: number;
  ssid: string;
};

export type PlaceHit = {
  label: string;
  lat: number;
  lon: number;
};

export type FieldKind = "wifi" | "hotspot" | "starlink" | "cell" | "place";

export type FieldNote = {
  id: string;
  at: number;
  name: string;
  kind: FieldKind;
  free: boolean;
  detail: string;
};

export type JournalEntry = {
  id: string;
  at: number;
  summary: string;
};
