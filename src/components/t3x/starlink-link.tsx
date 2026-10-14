import { useEffect, useState } from "react";
import { leoNote } from "@/lib/net/speed";
import type { LinkModel } from "@/components/t3x/use-link";

const KEY = "t3x-starlink-kit";

type Kit = { name: string; place: string };

function readKit(): Kit {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "") as Kit;
    if (raw && typeof raw.name === "string") return { name: raw.name, place: raw.place || "" };
  } catch {
    /* empty */
  }
  return { name: "", place: "" };
}

export function StarlinkLink({ model }: { model: LinkModel }) {
  const [kit, setKit] = useState<Kit>({ name: "", place: "" });
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const live = Boolean(model.identity?.starlink);
  const ping = model.path?.pingMs ?? null;
  const note = leoNote(ping, live);

  useEffect(() => {
    const saved = readKit();
    setKit(saved);
    setName(saved.name);
    setPlace(saved.place);
  }, []);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const next = { name: name.trim().slice(0, 40), place: place.trim().slice(0, 60) };
    localStorage.setItem(KEY, JSON.stringify(next));
    setKit(next);
  }

  return (
    <section className="card grid gap-3">
      <p className="kicker">Starlink</p>
      <h2 className="text-2xl font-semibold">{live ? "This path is Starlink" : "This path is not Starlink"}</h2>
      <p className="text-base text-fg">
        {ping != null ? `Your ping is ${Math.round(ping)} ms.` : "Ping is still being measured."}{" "}
        {note || "A clear pass is usually under 80 ms. This is your real path, not a simulation."}
      </p>
      {kit.name ? (
        <p className="text-base text-fg">
          Saved on this phone: {kit.name}
          {kit.place ? ` · ${kit.place}` : ""}
        </p>
      ) : null}
      <form onSubmit={save} className="grid gap-3">
        <label className="grid gap-1 text-base font-semibold" htmlFor="kit-name">
          Kit name
          <input id="kit-name" className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Dish at home" autoComplete="off" />
        </label>
        <label className="grid gap-1 text-base font-semibold" htmlFor="kit-place">
          Service place
          <input id="kit-place" className="field" value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Suburb or site" autoComplete="off" />
        </label>
        <button type="submit" className="btn btn-accent w-full">
          Save on this phone
        </button>
      </form>
    </section>
  );
}
