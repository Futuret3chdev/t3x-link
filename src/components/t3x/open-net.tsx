import { useEffect, useState } from "react";
import { QrCode, Trash2 } from "lucide-react";
import { wifiUri } from "@/lib/net/format";
import { readNets, removeNet, subscribeMemory, type OpenNet } from "@/lib/net/memory";
import { openHotspotSettings } from "@/lib/net/wifi-join";

export function OpenNetDesk({ onNamed }: { onNamed: (ssid: string) => void }) {
  const [nets, setNets] = useState<OpenNet[]>([]);
  const [qr, setQr] = useState("");
  const [active, setActive] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sync = () => setNets(readNets().filter((row) => row.known !== false));
    sync();
    return subscribeMemory(sync);
  }, []);

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
    <div className="grid gap-2">
      {message ? <p className="text-base text-fg">{message}</p> : null}
      {nets.length > 0 ? (
        <ul className="grid gap-2">
          {nets.map((net) => (
            <li key={net.id} className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-lg font-semibold" style={{ overflowWrap: "anywhere" }}>
                {net.name}
              </p>
              <span className="flex shrink-0 gap-2">
                {net.known ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void card(net)}>
                    <QrCode aria-hidden="true" size={16} />
                    Code
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost" onClick={() => removeNet(net.id)} aria-label={`Remove ${net.name}`}>
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {active && qr ? <img src={qr} alt="Join code" className="mx-auto w-44 rounded-lg" /> : null}
      <button type="button" className="btn btn-ghost w-full" onClick={() => setMessage(openHotspotSettings())}>
        Hotspot settings
      </button>
    </div>
  );
}
