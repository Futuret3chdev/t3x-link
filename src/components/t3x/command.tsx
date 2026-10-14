import { useEffect, useRef, useState } from "react";
import mark from "@/assets/t3x-mark.jpg";
import { BenchDesk } from "@/components/t3x/bench-desk";
import { FieldDesk } from "@/components/t3x/field-desk";
import { HotspotDesk } from "@/components/t3x/hotspot-desk";
import { HubDesk } from "@/components/t3x/hub-desk";
import { LinkDesk } from "@/components/t3x/link-desk";
import { PlanetsDesk } from "@/components/t3x/planets-desk";
import { useLink } from "@/components/t3x/use-link";

const TABS = [
  { id: "hub", label: "Hub" },
  { id: "planets", label: "Planets" },
  { id: "link", label: "Link" },
  { id: "hotspots", label: "Places" },
  { id: "bench", label: "Bench" },
  { id: "field", label: "Notes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function OpenFilm({ onDone }: { onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    node.muted = true;
    void node.play().catch(() => undefined);
  }, []);

  function withSound() {
    const node = video.current;
    if (!node) return;
    node.pause();
    node.currentTime = 0;
    node.muted = false;
    node.volume = 1;
    setSound(true);
    void node.play().catch(() => undefined);
  }

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-label="T3x Link">
      <video
        ref={video}
        className="intro-video"
        src="/promo.mp4"
        playsInline
        autoPlay
        muted={!sound}
        onEnded={onDone}
      />
      <button type="button" className="btn btn-primary intro-skip" onClick={onDone}>
        Skip
      </button>
      {sound ? null : (
        <button type="button" className="btn btn-accent intro-sound" onClick={withSound}>
          Sound on
        </button>
      )}
    </div>
  );
}

export function Command() {
  const model = useLink();
  const [tab, setTab] = useState<TabId>("hub");
  const [intro, setIntro] = useState(false);
  const online = model.link?.online !== false;

  useEffect(() => {
    try {
      if (sessionStorage.getItem("t3x-intro") === "1") return;
    } catch {
      /* private mode */
    }
    setIntro(true);
  }, []);

  function closeIntro() {
    try {
      sessionStorage.setItem("t3x-intro", "1");
    } catch {
      /* private mode */
    }
    setIntro(false);
  }

  return (
    <div className="shell bg-bg text-fg">
      {intro ? <OpenFilm onDone={closeIntro} /> : null}
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
        <div role="tablist" aria-label="Desks" className="tab-wrap tab-bar">
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

        <div role="tabpanel" id="panel-hub" aria-labelledby="tab-hub" hidden={tab !== "hub"}>
          {tab === "hub" ? <HubDesk model={model} /> : null}
        </div>
        <div role="tabpanel" id="panel-link" aria-labelledby="tab-link" hidden={tab !== "link"}>
          {tab === "link" ? <LinkDesk model={model} /> : null}
        </div>
        <div role="tabpanel" id="panel-hotspots" aria-labelledby="tab-hotspots" hidden={tab !== "hotspots"}>
          {tab === "hotspots" ? (
            <HotspotDesk model={model} active fix={null} onNamed={() => undefined} />
          ) : null}
        </div>
        <div role="tabpanel" id="panel-planets" aria-labelledby="tab-planets" hidden={tab !== "planets"}>
          {tab === "planets" ? <PlanetsDesk model={model} /> : null}
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
