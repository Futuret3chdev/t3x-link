import { useEffect, useMemo, useState } from "react";
import { Bluetooth, LocateFixed, MapPin, Search, Share2, Wifi } from "lucide-react";
import { SlippyMap, type MapDot } from "@/components/t3x/slippy-map";
import { FleetGlobe } from "@/components/t3x/fleet-globe";
import { formatDistance, wifiUri } from "@/lib/net/format";
import { saveNote } from "@/lib/net/memory";
import { pickBluetooth } from "@/lib/net/phone";
import { geocodePlace, searchHotspots } from "@/lib/net/places";
import type { FieldKind, Hotspot } from "@/lib/net/types";
import { joinOpenWifi } from "@/lib/net/wifi-join";
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
    id: spot.id,
    lon: spot.lon,
    lat: spot.lat,
    tone: "gold",
    label: spot.name.length > 22 ? `${spot.name.slice(0, 20)}…` : spot.name,
  }));
  if (center) dots.push({ id: "here", lon: center.lon, lat: center.lat, tone: "cobalt", label: "You" });
  return dots;
}

export type ScanFix = { lat: number; lon: number; acc: number; id: number };

export function HotspotDesk({
  model,
  active,
  fix,
  onNamed,
}: {
  model: LinkModel;
  active: boolean;
  fix: ScanFix | null;
  onNamed: (ssid: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [center, setCenter] = useState<Place | null>(null);
  const [radius, setRadius] = useState(1500);
  const [filter, setFilter] = useState<Filter>("all");
  const [spots, setSpots] = useState<Hotspot[]>([]);
  const [busy, setBusy] = useState<"locate" | "search" | "scan" | "ble" | null>(null);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");
  const [bleName, setBleName] = useState("");
  const [joinNote, setJoinNote] = useState("");
  const [joinQr, setJoinQr] = useState("");
  const [status, setStatus] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [shared, setShared] = useState("");
  const [viewMode, setViewMode] = useState<"map" | "globe">("map");
  const [look, setLook] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const [pin, setPin] = useState(0);
  const [pickedId, setPickedId] = useState("");
  const [spotPage, setSpotPage] = useState(0);
  const [joinName, setJoinName] = useState("");

  const visible = useMemo(() => {
    return spots
      .filter((spot) => {
        if (filter === "free") return spot.free;
        if (filter === "library") return spot.kind === "library";
        if (filter === "cafe") return spot.kind === "cafe" || spot.kind === "cowork";
        return true;
      })
      .sort((a, b) => Number(b.free) - Number(a.free) || a.distanceM - b.distanceM);
  }, [filter, spots]);

  const dots = useMemo(() => markers(center, visible), [center, visible]);
  const spotPages = Math.max(1, Math.ceil(visible.length / 4));
  const spotSafe = Math.min(spotPage, spotPages - 1);
  const nearestOpen = visible.find((spot) => spot.free && spot.ssid);
  const picked = visible.find((spot) => spot.id === pickedId) || null;

  useEffect(() => {
    setSpotPage(0);
  }, [filter, spots]);

  function showOnMap(spot: Hotspot) {
    setLook({ lat: spot.lat, lon: spot.lon, zoom: 16 });
    setPin((value) => value + 1);
    setViewMode("map");
    document.getElementById("place-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function connect(spot: Hotspot) {
    setJoinNote("");
    setJoinQr("");
    setError("");
    const name = (spot.ssid || joinName).trim();
    try {
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        const mod = await import("qrcode");
        const url = await mod.toDataURL(wifiUri({ ssid: name, password: "", security: "nopass", hidden: false }), {
          margin: 1,
          width: 320,
          color: { dark: "#07080d", light: "#f4efe6" },
        });
        setJoinQr(url);
        setJoinNote("Point the Camera at this code and tap Join.");
        return;
      }
      setJoinNote(await joinOpenWifi(name));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the join.");
    }
  }

  async function scan(lat: number, lon: number, label: string, nextRadius = radius, widen = true) {
    setCenter({ lat, lon, label });
    setLook(null);
    setPickedId("");
    setPin((value) => value + 1);
    setBusy("scan");
    setError("");
    setShared("");
    setRadius(nextRadius);
    setStatus("Scanning mapped places…");
    try {
      const rows = await searchHotspots({ data: { lat, lon, radius: nextRadius } });
      const merged = [...rows].sort((a, b) => a.distanceM - b.distanceM);
      setSpots(merged);
      const named = merged.find((row) => row.free && row.ssid) || merged.find((row) => row.ssid);
      if (named?.ssid) onNamed(named.ssid);
      if (widen && merged.length < 2 && nextRadius < 4000) {
        setStatus("Almost nothing that close. Opening the scan to 4 km…");
        await scan(lat, lon, label, 4000, false);
        return;
      }
      setStatus(merged.length === 0 ? "No mapped places in this scan." : `${merged.length} places`);
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
    setStatus("Reading your location…");
    setRadius(nextRadius);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAccuracy(Math.round(pos.coords.accuracy));
        void scan(pos.coords.latitude, pos.coords.longitude, "Your position", nextRadius);
      },
      () => {
        setBusy(null);
        setStatus("");
        setError("Location is blocked. Allow location for this site, then tap Scan again.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    if (!fix) return;
    setAccuracy(fix.acc);
    void scan(fix.lat, fix.lon, "Your position", 1500);
    // The tap already asked for location. This only looks up places.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix?.id]);

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

  async function shareScan() {
    const lines = visible.slice(0, 12).map((spot) => {
      const bits = [spot.name, formatDistance(spot.distanceM), spot.kindLabel];
      if (spot.ssid) bits.push(spot.ssid);
      if (spot.address) bits.push(spot.address);
      return bits.join(" · ");
    });
    const text = ["T3x Link scan", center?.label || "", ...lines].filter(Boolean).join("\n");
    setError("");
    setShared(text);
    const file = new File([text], "t3x-scan.txt", { type: "text/plain" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "T3x Link scan" });
        setStatus("Scan shared.");
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "T3x Link scan", text });
        setStatus("Scan shared.");
        return;
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      if (/abort|cancel/i.test(message)) return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied. Paste it into a message.");
    } catch {
      setStatus("Select the scan below and copy it.");
    }
  }

  return (
    <div className="grid gap-4">
      <section className="card">
        <p className="kicker">Public hotspots</p>
        <h2 className="mt-2 text-2xl font-semibold">Scan around this phone</h2>
        <p className="mt-2 text-base text-fg">
          Scan reads your location, then lists mapped libraries, cafés, universities, hostels, hotels, and community rooms. It cannot read Wi-Fi names. Those only appear if the map published them.
        </p>
        <button type="button" className="btn btn-primary mt-4 w-full text-lg" onClick={() => locate(1500)} disabled={busy !== null}>
          <LocateFixed aria-hidden="true" size={18} />
          {busy === "locate" || busy === "scan" ? "Scanning…" : "Scan"}
        </button>
        {accuracy != null ? <p className="mt-2 text-base text-fg">Location locked to about {accuracy} m.</p> : null}
        {status ? <p className="mt-1 text-base font-semibold text-fg">{status}</p> : null}
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
        <div className="tab-wrap mt-3">
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
          <div className="tab-wrap">
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
          {joinNote ? <p className="text-base text-fg">{joinNote}</p> : null}
          {nearestOpen ? (
            <button type="button" className="btn btn-primary w-full" onClick={() => void connect(nearestOpen)}>
              <Wifi aria-hidden="true" size={16} />
              Connect {nearestOpen.ssid}
            </button>
          ) : null}
          {busy === "scan" || busy === "locate" ? <p className="text-base text-fg">{status || "Scanning…"}</p> : null}
          {visible.length > 0 ? (
            <button type="button" className="btn btn-ghost w-full" onClick={() => void shareScan()}>
              <Share2 aria-hidden="true" size={16} />
              Share this scan
            </button>
          ) : null}
          {shared ? (
            <p className="whitespace-pre-wrap text-base text-fg" style={{ overflowWrap: "anywhere" }}>
              {shared}
            </p>
          ) : null}
          {center && !busy && !error && visible.length === 0 ? (
            <p className="text-base text-fg">
              Nothing tagged around {center.label}. Widen the radius, or this part of the map has no internet places yet.
            </p>
          ) : null}

          <ul className="grid gap-3">
            {visible.slice(spotSafe * 4, spotSafe * 4 + 4).map((spot) => (
              <li key={spot.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{spot.name}</p>
                    <p className="mt-1 text-base text-fg">
                      {spot.kindLabel}
                      {spot.free ? " · Tagged free" : ""}
                      {spot.ssid ? ` · ${spot.ssid}` : ""}
                      {spot.access ? ` · ${spot.access}` : ""}
                      {" · "}
                      {formatDistance(spot.distanceM)}
                    </p>
                    {spot.address ? <p className="plain-text mt-1 text-base">{spot.address}</p> : null}
                    {spot.hours ? <p className="mt-1 text-base text-fg">{spot.hours}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {spot.free && spot.ssid ? (
                      <button type="button" className="btn btn-primary" onClick={() => void connect(spot)}>
                        <Wifi aria-hidden="true" size={16} />
                        Connect
                      </button>
                    ) : null}
                    <button type="button" className="btn btn-ghost" onClick={() => showOnMap(spot)}>
                      <MapPin aria-hidden="true" size={16} />
                      On our map
                    </button>
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
          {visible.length > 4 ? (
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="btn btn-ghost" disabled={spotSafe === 0} onClick={() => setSpotPage((page) => Math.max(0, page - 1))}>
                Back
              </button>
              <p className="text-base text-fg">
                {spotSafe + 1} / {spotPages}
              </p>
              <button type="button" className="btn btn-ghost" disabled={spotSafe + 1 >= spotPages} onClick={() => setSpotPage((page) => page + 1)}>
                Next
              </button>
            </div>
          ) : null}
        </div>
        <div id="place-map" className="order-1 grid gap-2 lg:sticky lg:top-4 lg:order-2">
          <div className="tab-wrap">
            <button type="button" className="tab" aria-pressed={viewMode === "map"} onClick={() => setViewMode("map")}>
              Map
            </button>
            <button type="button" className="tab" aria-pressed={viewMode === "globe"} onClick={() => setViewMode("globe")}>
              Globe
            </button>
            <button
              type="button"
              className="tab"
              onClick={() => {
                setFilter("free");
                setViewMode("globe");
              }}
            >
              Major wifi
            </button>
          </div>
          {viewMode === "globe" ? (
            <>
              <FleetGlobe observer={center ? { lat: center.lat, lon: center.lon } : null} />
            </>
          ) : (
            <>
            <SlippyMap
              lon={look?.lon ?? center?.lon ?? 144.9631}
              lat={look?.lat ?? center?.lat ?? -37.8136}
              zoom={look?.zoom ?? (center ? (radius > 2500 ? 13 : 15) : 11)}
              tick={pin}
              dots={active ? dots : []}
              selected={pickedId}
              onPick={(id) => {
                if (id === "here") return;
                setPickedId(id);
                const spot = spots.find((row) => row.id === id);
                setJoinName(spot?.ssid || spot?.name || "");
                if (spot) showOnMap(spot);
              }}
              className="h-72 w-full rounded-card border border-line sm:h-80 lg:h-[32rem]"
            />
            {picked ? (
              <div className="card grid gap-2">
                <p className="text-lg font-semibold">{picked.name}</p>
                <p className="text-base text-fg">
                  {picked.kindLabel}
                  {picked.ssid ? ` · ${picked.ssid}` : ""} · {formatDistance(picked.distanceM)}
                </p>
                {picked.ssid ? null : (
                  <input
                    className="field"
                    value={joinName}
                    onChange={(event) => setJoinName(event.target.value)}
                    placeholder="Network name"
                    autoComplete="off"
                  />
                )}
                <button
                  type="button"
                  className="btn btn-primary w-full text-lg"
                  disabled={!(picked.ssid || joinName).trim()}
                  onClick={() => void connect(picked)}
                >
                  <Wifi aria-hidden="true" size={16} />
                  Connect
                </button>
                {joinQr ? <img src={joinQr} alt="Join code for the camera" className="mx-auto w-44 rounded-lg" /> : null}
                {joinNote ? <p className="text-base text-fg">{joinNote}</p> : null}
              </div>
            ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
