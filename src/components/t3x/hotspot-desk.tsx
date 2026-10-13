import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { ExternalLink, LocateFixed, MapPin, Search } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { cssColor, formatDistance } from "@/lib/net/format";
import { saveNote } from "@/lib/net/memory";
import { geocodePlace, searchHotspots } from "@/lib/net/places";
import type { FieldKind, Hotspot } from "@/lib/net/types";
import type { LinkModel } from "@/components/t3x/use-link";

const CITIES = [
  { name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Melbourne", lat: -37.8136, lon: 144.9631 },
  { name: "Brisbane", lat: -27.4698, lon: 153.0251 },
  { name: "Auckland", lat: -36.8509, lon: 174.7645 },
  { name: "London", lat: 51.5074, lon: -0.1278 },
  { name: "New York", lat: 40.7128, lon: -74.006 },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
];

const RADII = [800, 1500, 3000, 5000];

type Filter = "all" | "free" | "library" | "cafe";

function noteKind(kind: Hotspot["kind"]): FieldKind {
  return kind === "wifi" ? "hotspot" : "place";
}

export function HotspotDesk({ model, active }: { model: LinkModel; active: boolean }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [query, setQuery] = useState("");
  const [center, setCenter] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [radius, setRadius] = useState(1500);
  const [filter, setFilter] = useState<Filter>("all");
  const [spots, setSpots] = useState<Hotspot[]>([]);
  const [busy, setBusy] = useState<"locate" | "search" | "scan" | null>(null);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const visible = useMemo(() => {
    return spots.filter((spot) => {
      if (filter === "free") return spot.free;
      if (filter === "library") return spot.kind === "library";
      if (filter === "cafe") return spot.kind === "cafe" || spot.kind === "cowork";
      return true;
    });
  }, [filter, spots]);

  useEffect(() => {
    if (!active || mapRef.current || !mapEl.current) return;
    const frame = mapEl.current;
    let cancel = false;
    void import("leaflet").then((L) => {
      if (cancel) return;
      const map = L.map(frame, { zoomControl: true }).setView([-33.8688, 151.2093], 3);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      window.setTimeout(() => map.invalidateSize(), 60);
      setMapReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    mapRef.current?.invalidateSize();
  }, [active, visible.length, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!mapReady || !map || !layer || !center) return;
    let cancel = false;
    void import("leaflet").then((L) => {
      if (cancel) return;
      const cobalt = cssColor("--color-primary", "#2f7bff");
      const gold = cssColor("--color-accent", "#d4b15a");
      const ink = cssColor("--color-bg", "#07080d");
      const ivory = cssColor("--color-fg", "#f4efe6");
      layer.clearLayers();
      L.circleMarker([center.lat, center.lon], {
        radius: 8,
        color: cobalt,
        weight: 2,
        fillColor: cobalt,
        fillOpacity: 0.95,
      })
        .bindTooltip("Search point")
        .addTo(layer);
      for (const spot of visible) {
        L.circleMarker([spot.lat, spot.lon], {
          radius: 7,
          color: spot.free ? gold : ivory,
          weight: 2,
          fillColor: spot.free ? gold : ink,
          fillOpacity: 0.95,
        })
          .bindTooltip(spot.name)
          .addTo(layer);
      }
      map.setView([center.lat, center.lon], radius > 2500 ? 13 : 15);
      map.invalidateSize();
    });
    return () => {
      cancel = true;
    };
  }, [center, mapReady, radius, visible]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  async function scan(lat: number, lon: number, label: string, nextRadius = radius) {
    setCenter({ lat, lon, label });
    setBusy("scan");
    setError("");
    try {
      const rows = await searchHotspots({ data: { lat, lon, radius: nextRadius } });
      setSpots(rows);
    } catch (reason) {
      setSpots([]);
      setError(reason instanceof Error ? reason.message : "Hotspot search failed.");
    } finally {
      setBusy(null);
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("This browser has no location service.");
      return;
    }
    setBusy("locate");
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void scan(pos.coords.latitude, pos.coords.longitude, "Your position");
      },
      () => {
        setBusy(null);
        setError("Location was blocked. Search a city, or use the public-address estimate.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
    );
  }

  async function searchPlace(event: React.FormEvent) {
    event.preventDefault();
    setBusy("search");
    setError("");
    try {
      const hit = await geocodePlace({ data: { q: query } });
      if (!hit) {
        setError("No place matched that name.");
        setBusy(null);
        return;
      }
      await scan(hit.lat, hit.lon, hit.label);
    } catch (reason) {
      setBusy(null);
      setError(reason instanceof Error ? reason.message : "Place search failed.");
    }
  }

  function remember(spot: Hotspot) {
    saveNote({
      id: crypto.randomUUID(),
      at: Date.now(),
      name: spot.name,
      kind: noteKind(spot.kind),
      free: spot.free,
      detail: [spot.kindLabel, formatDistance(spot.distanceM), spot.address].filter(Boolean).join(" · "),
    });
    setSavedId(spot.id);
  }

  return (
    <div className="grid gap-4">
      <section className="card">
        <p className="kicker">Public hotspots</p>
        <h2 className="mt-2 text-2xl font-semibold">Mapped places with a reason to have internet</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          OpenStreetMap places, not a live Wi-Fi scan. “Free” only when the map says the fee is none.
        </p>
        <form onSubmit={(event) => void searchPlace(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="place-query">
            City or address
          </label>
          <input
            id="place-query"
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="City, suburb, or address"
          />
          <button type="submit" className="btn btn-primary" disabled={busy !== null || query.trim().length < 2}>
            <Search aria-hidden="true" size={16} />
            {busy === "search" ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={locate} disabled={busy !== null}>
            <LocateFixed aria-hidden="true" size={16} />
            {busy === "locate" ? "Locating…" : "Use my location"}
          </button>
          {model.identity?.lat != null && model.identity.lon != null ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy !== null}
              onClick={() =>
                void scan(model.identity!.lat!, model.identity!.lon!, "Near the public address")
              }
            >
              <MapPin aria-hidden="true" size={16} />
              Near public address
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {CITIES.map((city) => (
            <button
              key={city.name}
              type="button"
              className="tab bg-surface-2"
              onClick={() => void scan(city.lat, city.lon, city.name)}
              disabled={busy !== null}
            >
              {city.name}
            </button>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 grid gap-3 lg:order-1">
          <div className="flex flex-wrap items-center gap-2">
            {RADII.map((value) => (
              <button
                key={value}
                type="button"
                className="tab"
                aria-pressed={radius === value}
                onClick={() => {
                  setRadius(value);
                  if (center) void scan(center.lat, center.lon, center.label, value);
                }}
              >
                {value >= 1000 ? `${value / 1000} km` : `${value} m`}
              </button>
            ))}
            {(["all", "free", "library", "cafe"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="tab"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All" : value === "free" ? "Tagged free" : value === "library" ? "Libraries" : "Café & cowork"}
              </button>
            ))}
          </div>

          {error ? <p className="text-sm text-mark">{error}</p> : null}
          {busy === "scan" ? <p className="text-sm text-muted">Searching mapped places…</p> : null}
          {center && !busy && !error && visible.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing tagged around {center.label}. Widen the radius, or this part of the map has no internet places yet.
            </p>
          ) : null}

          <ul className="grid gap-3">
            {visible.map((spot) => (
              <li key={spot.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{spot.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      {spot.kindLabel}
                      {spot.free ? " · Tagged free" : ""}
                      {spot.access ? ` · ${spot.access}` : ""}
                      {" · "}
                      {formatDistance(spot.distanceM)}
                    </p>
                    {spot.address ? <p className="mt-1 text-sm">{spot.address}</p> : null}
                    {spot.hours ? <p className="mt-1 text-sm text-muted">{spot.hours}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      className="btn btn-ghost"
                      href={`https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lon}#map=18/${spot.lat}/${spot.lon}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink aria-hidden="true" size={16} />
                      Map
                    </a>
                    <button type="button" className="btn btn-accent" onClick={() => remember(spot)}>
                      {savedId === spot.id ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
                {spot.website ? (
                  <a className="mt-2 inline-block text-sm text-primary underline-offset-2 hover:underline" href={spot.website}>
                    {spot.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div ref={mapEl} className="order-1 h-56 overflow-hidden rounded-card border border-line lg:sticky lg:top-4 lg:order-2 lg:h-[32rem]" />
      </div>
    </div>
  );
}
