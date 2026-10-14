import { useState } from "react";
import { LocateFixed, Wifi } from "lucide-react";
import mark from "@/assets/t3x-mark.jpg";
import { BenchDesk } from "@/components/t3x/bench-desk";
import { FieldDesk } from "@/components/t3x/field-desk";
import { HotspotDesk, type ScanFix } from "@/components/t3x/hotspot-desk";
import { LinkDesk } from "@/components/t3x/link-desk";
import { StarlinkDesk } from "@/components/t3x/starlink-desk";
import { useLink } from "@/components/t3x/use-link";
import { joinOpenWifi } from "@/lib/net/wifi-join";

const TABS = [
  { id: "link", label: "Link" },
  { id: "hotspots", label: "Hotspots" },
  { id: "starlink", label: "Starlink" },
  { id: "bench", label: "Bench" },
  { id: "field", label: "Field notes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Command() {
  const model = useLink();
  const [tab, setTab] = useState<TabId>("hotspots");
  const [fix, setFix] = useState<ScanFix | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [network, setNetwork] = useState("");
  const [joinNote, setJoinNote] = useState("");
  const online = model.link?.online !== false;

  function scanNow() {
    setTab("hotspots");
    setScanNote("");
    if (!navigator.geolocation) {
      setScanNote("This phone has no location service.");
      return;
    }
    setScanning(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setScanning(false);
        setFix({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy),
          id: Date.now(),
        });
      },
      () => {
        setScanning(false);
        setScanNote("Location is blocked. Allow location for this site, then tap Scan again.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function connect() {
    setJoinNote("");
    if (!network.trim()) {
      setJoinNote("Type the open network name, then tap Connect.");
      return;
    }
    try {
      setJoinNote(await joinOpenWifi(network));
    } catch (reason) {
      setJoinNote(reason instanceof Error ? reason.message : "Could not start the join.");
    }
  }

  return (
    <div className="shell bg-bg text-fg">
      <div className="rule" />
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
        <img
          src={mark}
          alt="T3x medallion"
          className="size-14 shrink-0 rounded-full object-cover ring-2 ring-accent"
        />
        <div className="min-w-0 flex-1">
          <p className="kicker">Futuret3ch</p>
          <h1 className="font-brand text-xl tracking-wide sm:text-2xl">
            <span className="text-primary">T</span>
            <span className="text-mark">3</span>
            <span className="text-primary">x</span>
            <span> Link</span>
          </h1>
        </div>
        <p className="flex shrink-0 items-center gap-2 text-base font-semibold">
          <span className="live-dot" data-off={online ? "false" : "true"} />
          {model.link
            ? model.link.online
              ? model.path
                ? `${Math.round(model.path.pingMs)} ms`
                : model.link.effectiveType === "unknown"
                  ? "Online"
                  : model.link.effectiveLabel
              : "Offline"
            : "Checking"}
        </p>
      </header>

      <main className="page-pad mx-auto grid max-w-6xl gap-5 px-4 sm:px-6">
        <section className="card grid gap-3">
          <p className="kicker">Do this</p>
          <button type="button" className="btn btn-primary w-full text-lg" onClick={scanNow} disabled={scanning}>
            <LocateFixed aria-hidden="true" size={18} />
            {scanning ? "Scanning…" : "Scan"}
          </button>
          {scanNote ? <p className="text-base text-fg">{scanNote}</p> : null}
          {fix ? <p className="text-base text-fg">Location locked to about {fix.acc} m.</p> : null}
          <label className="grid gap-1 text-base font-semibold" htmlFor="open-network">
            Open network name
            <input
              id="open-network"
              className="field"
              value={network}
              autoComplete="off"
              placeholder="Type the Wi-Fi name"
              onChange={(event) => setNetwork(event.target.value)}
            />
          </label>
          <button type="button" className="btn btn-accent w-full text-lg" onClick={() => void connect()}>
            <Wifi aria-hidden="true" size={18} />
            Connect
          </button>
          {joinNote ? <p className="text-base text-fg">{joinNote}</p> : null}
        </section>
        <div role="tablist" aria-label="Desks" className="scroll-row">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              className="tab"
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="panel-link" aria-labelledby="tab-link" hidden={tab !== "link"}>
          {tab === "link" ? <LinkDesk model={model} /> : null}
        </div>
        <div role="tabpanel" id="panel-hotspots" aria-labelledby="tab-hotspots" hidden={tab !== "hotspots"}>
          {tab === "hotspots" ? (
            <HotspotDesk model={model} active fix={fix} onNamed={(ssid) => setNetwork((current) => current || ssid)} />
          ) : null}
        </div>
        <div role="tabpanel" id="panel-starlink" aria-labelledby="tab-starlink" hidden={tab !== "starlink"}>
          {tab === "starlink" ? <StarlinkDesk model={model} /> : null}
        </div>
        <div role="tabpanel" id="panel-bench" aria-labelledby="tab-bench" hidden={tab !== "bench"}>
          {tab === "bench" ? <BenchDesk model={model} /> : null}
        </div>
        <div role="tabpanel" id="panel-field" aria-labelledby="tab-field" hidden={tab !== "field"}>
          {tab === "field" ? <FieldDesk /> : null}
        </div>
      </main>
    </div>
  );
}
