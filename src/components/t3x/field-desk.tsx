import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { wifiUri } from "@/lib/net/format";
import { readJournal, readNotes, removeNote, saveNote, subscribeMemory } from "@/lib/net/memory";
import type { FieldKind, FieldNote, JournalEntry } from "@/lib/net/types";

const KINDS: { id: FieldKind; label: string }[] = [
  { id: "wifi", label: "Wi-Fi" },
  { id: "hotspot", label: "Hotspot" },
  { id: "starlink", label: "Starlink" },
  { id: "cell", label: "Cellular" },
  { id: "place", label: "Place" },
];

function When({ at }: { at: number }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const diff = Date.now() - at;
    const mins = Math.round(diff / 60000);
    if (mins < 1) setLabel("just now");
    else if (mins < 60) setLabel(`${mins} min ago`);
    else setLabel(new Date(at).toLocaleString());
  }, [at]);
  return <time dateTime={new Date(at).toISOString()}>{label}</time>;
}

export function FieldDesk() {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FieldKind>("wifi");
  const [free, setFree] = useState(false);
  const [detail, setDetail] = useState("");
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [security, setSecurity] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [hidden, setHidden] = useState(false);
  const [qr, setQr] = useState("");
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    const sync = () => {
      setNotes(readNotes());
      setJournal(readJournal());
    };
    sync();
    return subscribeMemory(sync);
  }, []);

  function addNote(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveNote({
      id: crypto.randomUUID(),
      at: Date.now(),
      name: trimmed,
      kind,
      free,
      detail: detail.trim(),
    });
    setName("");
    setDetail("");
    setFree(false);
  }

  async function makeCard(event: React.FormEvent) {
    event.preventDefault();
    if (!ssid.trim()) return;
    setShareError("");
    const uri = wifiUri({ ssid: ssid.trim(), password, security, hidden });
    try {
      const mod = await import("qrcode");
      const url = await mod.toDataURL(uri, {
        margin: 1,
        width: 280,
        color: { dark: "#07080d", light: "#f4efe6" },
      });
      setQr(url);
    } catch {
      setShareError("Could not draw the code. Copy the network string instead.");
      setQr("");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card">
        <p className="kicker">Field notes</p>
        <h2 className="mt-2 text-2xl font-semibold">Networks you want to remember</h2>
        <p className="mt-2 text-sm text-muted">
          Saved on this device only. Passwords are not stored — use the share card if you need to
          hand a guest the current network.
        </p>
        <form onSubmit={addNote} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            Name
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Cafe window, dish, office" />
          </label>
          <label className="grid gap-1 text-sm">
            Kind
            <select className="field" value={kind} onChange={(event) => setKind(event.target.value as FieldKind)}>
              {KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Note
            <input className="field" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Ask at the counter, closes at 4" />
          </label>
          <button
            type="button"
            className="btn btn-ghost justify-between"
            aria-pressed={free}
            onClick={() => setFree((value) => !value)}
          >
            Tagged free
            <span>{free ? "Yes" : "No"}</span>
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Save note
          </button>
        </form>
        <ul className="mt-4 grid gap-2">
          {notes.length === 0 ? <li className="text-sm text-muted">No saved networks yet.</li> : null}
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border border-line bg-bg px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{note.name}</p>
                  <p className="text-sm text-muted">
                    {KINDS.find((item) => item.id === note.kind)?.label}
                    {note.free ? " · Free" : ""}
                    {note.detail ? ` · ${note.detail}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    <When at={note.at} />
                  </p>
                </div>
                <button type="button" className="btn btn-ghost px-3" aria-label={`Remove ${note.name}`} onClick={() => removeNote(note.id)}>
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid content-start gap-4">
        <section className="card">
          <p className="kicker">Share a network</p>
          <p className="mt-2 text-sm text-muted">
            Builds a Wi-Fi join code for the screen in front of you. It is not saved.
          </p>
          <form onSubmit={(event) => void makeCard(event)} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              Network name
              <input className="field" value={ssid} onChange={(event) => setSsid(event.target.value)} autoComplete="off" />
            </label>
            <label className="grid gap-1 text-sm">
              Security
              <select
                className="field"
                value={security}
                onChange={(event) => setSecurity(event.target.value as "WPA" | "WEP" | "nopass")}
              >
                <option value="WPA">WPA / WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Open</option>
              </select>
            </label>
            {security !== "nopass" ? (
              <label className="grid gap-1 text-sm">
                Password
                <input
                  className="field"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
            ) : null}
            <button type="button" className="btn btn-ghost justify-between" aria-pressed={hidden} onClick={() => setHidden((value) => !value)}>
              Hidden network
              <span>{hidden ? "Yes" : "No"}</span>
            </button>
            <button type="submit" className="btn btn-accent" disabled={!ssid.trim()}>
              Make join code
            </button>
          </form>
          {shareError ? <p className="mt-3 text-sm text-mark">{shareError}</p> : null}
          {qr ? (
            <img src={qr} alt="Wi-Fi join code" className="mx-auto mt-4 w-full max-w-56 rounded-xl bg-fg p-2" />
          ) : null}
        </section>

        <section className="card">
          <p className="kicker">Link journal</p>
          <ul className="mt-3 grid gap-2">
            {journal.length === 0 ? <li className="text-sm text-muted">Changes to this link will show up here.</li> : null}
            {journal.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 text-sm">
                <span>{entry.summary}</span>
                <span className="text-muted">
                  <When at={entry.at} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
