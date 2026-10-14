import { useMemo, useState } from "react";
import { Bluetooth, ExternalLink, LocateFixed, MapPin, Search } from "lucide-react";
import { SlippyMap, type MapDot } from "@/components/t3x/slippy-map";
import { formatDistance } from "@/lib/net/format";
import { saveNote } from "@/lib/net/memory";
import { pickBluetooth } from "@/lib/net/phone";
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

function markers(center: Place | null, spots: Hotspot[]): MapDot[] {
  const dots: MapDot[] = spots.map((spot) => ({
    lon: spot.lon,
    lat: spot.lat,
    tone: spot.free ? "gold" : "ivory",
    label: `${spot.name} · ${formatDistance(spot.distanceM)}`,
  }));
  if (center) dots.push({ lon: center.lon, lat: center.lat, tone: "cobalt", label: center.label });
  return dots;
}

export function HotspotDesk({ model, active }: { model: LinkModel; active: boolean }) {
  const [query, setQuery] = useState("");
  const [center, setCenter] = useState<Place | null>(null);
  const [radius, setRadius] = useState(1500);
  const [filter, setFilter] = useState<Filter>("all");
  const [spots, setSpots] = useState<Hotspot[]>([]);
  const [busy, setBusy] = useState<"locate" | "search" | "scan" | "ble" | null>(null);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");
  const [bleName, setBleName] = useState("");

  const visible = useMemo(() => {
    return spots.filter((spot) => {
      if (filter === "free") return spot.free;
      if (filter === "library") return spot.kind === "library";
      if (filter === "cafe") return spot.kind === "cafe" || spot.kind === "cowork";
      return true;
    });
  }, [filter, spots]);

  const dots = useMemo(() => markers(center, visible), [center, visible]);

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

  function locate(nextRadius = radius) {
    if (!navigator.geolocation) {
      setError("This browser has no location service.");
      return;
    }
    setBusy("locate");
    setError("");
    setRadius(nextRadius);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void scan(pos.coords.latitude, pos.coords.longitude, "Your position", nextRadius);
      },
      () => {
        setBusy(null);
        setError("Location was blocked. Search a city, or use the public-address estimate.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
    );
  }

  async function bluetooth() {
    setBusy("ble");
    setError("");
    try {
      const name = await pickBluetooth();
      setBleName(name);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Bluetooth chooser closed.";
      if (!/cancel|abort/i.test(message)) setError(message);
    } finally {
      setBusy(null);
    }
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
        <p className="mt-2 text-base text-fg">
          A phone cannot list nearby Wi-Fi names. This finds mapped libraries, cafés, coworking, and places tagged with internet, around you.
        </p>
        <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => locate(800)} disabled={busy !== null}>
          <LocateFixed aria-hidden="true" size={16} />
          {busy === "locate" ? "Detecting…" : "Detect nearby"}
        </button>
        <form onSubmit={(event) => void searchPlace(event)} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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
          <button type="submit" className="btn btn-ghost w-full sm:w-auto" disabled={busy !== null || query.trim().length < 2}>
            <Search aria-hidden="true" size={16} />
            {busy === "search" ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {model.identity?.lat != null && model.identity.lon != null ? (
            <button
              type="button"
              className="btn btn-ghost w-full"
              disabled={busy !== null}
              onClick={() => void scan(model.identity!.lat!, model.identity!.lon!, "Near the public address", 1500)}
            >
              <MapPin aria-hidden="true" size={16} />
              Near public address
            </button>
          ) : null}
          {model.phone?.bluetooth ? (
            <button type="button" className="btn btn-ghost w-full" onClick={() => void bluetooth()} disabled={busy !== null}>
              <Bluetooth aria-hidden="true" size={16} />
              {busy === "ble" ? "Waiting…" : "Bluetooth chooser"}
            </button>
          ) : null}
        </div>
        {bleName ? <p className="mt-2 text-base text-fg">Bluetooth device chosen: {bleName}</p> : null}
        <div className="scroll-row mt-3">
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
          <div className="scroll-row">
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
                    {spot.address ? <p className="plain-text mt-1 text-base">{spot.address}</p> : null}
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
        <SlippyMap
          lon={center?.lon ?? 144.9631}
          lat={center?.lat ?? -37.8136}
          zoom={center ? (radius > 2500 ? 12 : 14) : 3}
          dots={active ? dots : []}
          className="order-1 h-72 w-full rounded-card border border-line sm:h-80 lg:sticky lg:top-4 lg:order-2 lg:h-[32rem]"
        />
      </div>
    </div>
  );
}
