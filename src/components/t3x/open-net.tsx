import { useEffect, useState } from "react";
import { QrCode, Trash2, Wifi } from "lucide-react";
import { wifiUri } from "@/lib/net/format";
import { readNets, removeNet, saveNet, subscribeMemory, type OpenNet } from "@/lib/net/memory";
import { joinOpenWifi, openHotspotSettings } from "@/lib/net/wifi-join";
import { cleanSsid } from "@/lib/net/wifi-profile";

export function OpenNetDesk({ onNamed }: { onNamed: (ssid: string) => void }) {
  const [nets, setNets] = useState<OpenNet[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState("");
  const [active, setActive] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sync = () => setNets(readNets());
    sync();
    return subscribeMemory(sync);
  }, []);

  function create(event: React.FormEvent) {
    event.preventDefault();
    const ssid = cleanSsid(name);
    if (!ssid) {
      setMessage("Use a name of 1 to 32 characters, with no line breaks.");
      return;
    }
    saveNet({ id: crypto.randomUUID(), at: Date.now(), name: ssid, note: note.trim() });
    onNamed(ssid);
    setName("");
    setNote("");
    setMessage(`“${ssid}” is saved on this phone. Set the same name in Personal Hotspot, then hand the join to other phones.`);
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
      <h2 className="text-2xl font-semibold">Create an open network</h2>
      <p className="text-base text-fg">
        Name the open network, then turn that name on in the phone’s hotspot. This page cannot start the radio. It keeps the name and the join card.
      </p>
      <form onSubmit={create} className="grid gap-3">
        <label className="grid gap-1 text-base font-semibold" htmlFor="own-network">
          Network name
          <input
            id="own-network"
            className="field"
            value={name}
            autoComplete="off"
            placeholder="T3x Open"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-base font-semibold" htmlFor="own-note">
          Note
          <input
            id="own-note"
            className="field"
            value={note}
            placeholder="Roof, guest, today"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-accent w-full text-lg">
          <Wifi aria-hidden="true" size={18} />
          Create open network
        </button>
      </form>
      {message ? <p className="text-base text-fg">{message}</p> : null}
      {nets.length > 0 ? (
        <ul className="grid gap-3">
          {nets.map((net) => (
            <li key={net.id} className="grid gap-2 rounded-xl border border-line p-3">
              <p className="text-lg font-semibold">{net.name}</p>
              {net.note ? <p className="text-base text-fg">{net.note}</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">
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
                <button type="button" className="btn btn-ghost w-full" onClick={() => setMessage(openHotspotSettings(net.name))}>
                  Hotspot settings
                </button>
                <button type="button" className="btn btn-ghost w-full" onClick={() => void card(net)}>
                  <QrCode aria-hidden="true" size={16} />
                  Join code
                </button>
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
