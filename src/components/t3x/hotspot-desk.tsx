import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { ExternalLink, LocateFixed, MapPin, Search } from "lucide-react";
import { openDeskMap } from "@/components/t3x/desk-map";
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
type Place = { lat: number; lon: number; label: string };

function noteKind(kind: Hotspot["kind"]): FieldKind {
  return kind === "wifi" ? "hotspot" : "place";
}

function markers(center: Place | null, spots: Hotspot[]) {
  const features = [];
  if (center) {
    features.push({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [center.lon, center.lat] as [number, number] },
      properties: { name: "Search point", role: "center", free: 0 },
    });
  }
  for (const spot of spots) {
    features.push({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [spot.lon, spot.lat] as [number, number] },
      properties: { name: spot.name, role: "spot", free: spot.free ? 1 : 0 },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

export function HotspotDesk({ model, active }: { model: LinkModel; active: boolean }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [query, setQuery] = useState("");
  const [center, setCenter] = useState<Place | null>(null);
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
    if (!active || !mapEl.current) return;
    const frame = mapEl.current;
    let dead = false;
    let destroy = () => {};
    void openDeskMap(frame, { center: [151.2093, -33.8688], zoom: 2 }).then((handle) => {
      if (dead) {
        handle.destroy();
        return;
      }
      mapRef.current = handle.map;
      destroy = handle.destroy;
      handle.map.on("load", () => {
        const map = mapRef.current;
        if (!map) return;
        const cobalt = cssColor("--color-primary", "#2f7bff");
        const gold = cssColor("--color-accent", "#d4b15a");
        const ink = cssColor("--color-bg", "#07080d");
        const ivory = cssColor("--color-fg", "#f4efe6");
        map.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "places",
          type: "circle",
          source: "places",
          paint: {
            "circle-radius": ["case", ["==", ["get", "role"], "center"], 8, 7],
            "circle-color": [
              "case",
              ["==", ["get", "role"], "center"],
              cobalt,
              ["==", ["get", "free"], 1],
              gold,
              ink,
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": [
              "case",
              ["==", ["get", "role"], "center"],
              cobalt,
              ["==", ["get", "free"], 1],
              gold,
              ivory,
            ],
          },
        });
        map.on("click", "places", (event) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          new handle.ml.Popup({ closeButton: false, offset: 10 })
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setText(String(feature.properties?.name || "Place"))
            .addTo(map);
        });
        setMapReady(true);
      });
    });
    return () => {
      dead = true;
      mapRef.current = null;
      setMapReady(false);
      destroy();
    };
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.getSource("places")) return;
    (map.getSource("places") as GeoJSONSource).setData(markers(center, visible));
    if (!center) return;
    map.easeTo({
      center: [center.lon, center.lat],
      zoom: radius > 2500 ? 12 : 14,
      duration: 500,
    });
  }, [center, mapReady, radius, visible]);

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
        <p className="mt-2 max-w-2xl text-base text-fg">
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
              onClick={() => void scan(model.identity!.lat!, model.identity!.lon!, "Near the public address")}
            >
              <MapPin aria-hidden="true" size={16} />
              Near public address
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
          {CITIES.map((city) => (
            <button
              key={city.name}
              type="button"
              className="tab"
              onClick={() => void scan(city.lat, city.lon, city.name)}
              disabled={busy !== null}
            >
              {city.name}
            </button>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
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

          {error ? <p className="text-base text-mark">{error}</p> : null}
          {busy === "scan" ? <p className="text-base text-fg">Searching mapped places…</p> : null}
          {center && !busy && !error && visible.length === 0 ? (
            <p className="text-base text-fg">
              Nothing tagged around {center.label}. Widen the radius, or this part of the map has no internet places yet.
            </p>
          ) : null}

          <ul className="grid gap-3">
            {visible.map((spot) => (
              <li key={spot.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{spot.name}</p>
                    <p className="mt-1 text-base text-fg">
                      {spot.kindLabel}
                      {spot.free ? " · Tagged free" : ""}
                      {spot.access ? ` · ${spot.access}` : ""}
                      {" · "}
                      {formatDistance(spot.distanceM)}
                    </p>
                    {spot.address ? <p className="mt-1 text-base">{spot.address}</p> : null}
                    {spot.hours ? <p className="mt-1 text-base text-fg">{spot.hours}</p> : null}
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
                  <a className="mt-2 inline-block break-all text-base text-primary underline-offset-2 hover:underline" href={spot.website}>
                    {spot.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div
          ref={mapEl}
          className="desk-map order-1 h-72 w-full overflow-hidden rounded-card border border-line sm:h-80 lg:sticky lg:top-4 lg:order-2 lg:h-[32rem]"
        />
      </div>
    </div>
  );
}
