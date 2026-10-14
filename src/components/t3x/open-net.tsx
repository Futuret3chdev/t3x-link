import { useEffect, useState } from "react";
import { QrCode, Trash2, Wifi } from "lucide-react";
import { wifiUri } from "@/lib/net/format";
import { readNets, removeNet, saveNet, subscribeMemory, type OpenNet } from "@/lib/net/memory";
import { joinOpenWifi, openHotspotSettings, readHotspotName } from "@/lib/net/wifi-join";

export function addMyHotspot(onNamed: (ssid: string) => void): string {
  const ssid = readHotspotName();
  if (ssid) {
    saveNet({ id: crypto.randomUUID(), at: Date.now(), name: ssid, note: "Personal Hotspot", known: true });
    onNamed(ssid);
    return `Added “${ssid}”, the hotspot already on this phone.`;
  }
  const already = readNets().some((row) => row.known === false);
  if (!already) {
    saveNet({
      id: crypto.randomUUID(),
      at: Date.now(),
      name: "Personal Hotspot",
      note: "The one already turned on in Settings.",
      known: false,
    });
  }
  return openHotspotSettings();
}

export function OpenNetDesk({ onNamed }: { onNamed: (ssid: string) => void }) {
  const [nets, setNets] = useState<OpenNet[]>([]);
  const [qr, setQr] = useState("");
  const [active, setActive] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sync = () => setNets(readNets());
    sync();
    return subscribeMemory(sync);
  }, []);

  function addHotspot() {
    setMessage(addMyHotspot(onNamed));
  }

  async function card(net: OpenNet) {
    setMessage("");
    setActive(net.id);
    onNamed(net.name);
    try {
      const mod = await import("qrcode");
      const url = await mod.toDataURL(wifiUri({ ssid: net.name, password: "", security: "nopass", hidden: false }), {
        margin: 1,
        width: 280,
        color: { dark: "#07080d", light: "#f4efe6" },
      });
      setQr(url);
    } catch {
      setQr("");
      setMessage("Could not draw the code. Use Connect instead.");
    }
  }

  return (
    <section className="card grid gap-3">
      <p className="kicker">Your network</p>
      <h2 className="text-2xl font-semibold">Your hotspot</h2>
      <p className="text-base text-fg">Uses the Personal Hotspot already on this phone. It does not ask you to make up a name.</p>
      <button type="button" className="btn btn-accent w-full text-lg" onClick={addHotspot}>
        <Wifi aria-hidden="true" size={18} />
        Add my hotspot
      </button>
      {message ? <p className="text-base text-fg">{message}</p> : null}
      {nets.length > 0 ? (
        <ul className="grid gap-3">
          {nets.map((net) => (
            <li key={net.id} className="grid gap-2 rounded-xl border border-line p-3">
              <p className="text-lg font-semibold">{net.name}</p>
              {net.note ? <p className="text-base text-fg">{net.note}</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {net.known ? (
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    onClick={() => {
                      onNamed(net.name);
                      void joinOpenWifi(net.name).then(setMessage).catch((reason) => {
                        setMessage(reason instanceof Error ? reason.message : "Could not start the join.");
                      });
                    }}
                  >
                    Connect
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost w-full" onClick={() => setMessage(openHotspotSettings())}>
                  Hotspot settings
                </button>
                {net.known ? (
                  <button type="button" className="btn btn-ghost w-full" onClick={() => void card(net)}>
                    <QrCode aria-hidden="true" size={16} />
                    Join code
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost w-full" onClick={() => removeNet(net.id)}>
                  <Trash2 aria-hidden="true" size={16} />
                  Remove
                </button>
              </div>
              {active === net.id && qr ? <img src={qr} alt={`Join code for ${net.name}`} className="mx-auto w-44 rounded-lg" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
