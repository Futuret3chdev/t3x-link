import { useCallback, useEffect, useRef, useState } from "react";
import { loadStarlinkCatalog, type StarlinkCatalog } from "@/lib/net/elements";
import {
  prepareElements,
  projectConstellation,
  type ConstellationFrame,
  type Observer,
  type PreparedSat,
  type SkyDot,
} from "@/lib/net/propagate";

type Phase = "loading" | "live" | "error";

export type ConstellationModel = {
  phase: Phase;
  error: string;
  source: string;
  summary: {
    total: number;
    above: number;
    inWindow: number;
    at: number;
    highest: ConstellationFrame["highest"];
  };
  sky: SkyDot[];
  bindMap: (push: (frame: ConstellationFrame) => void) => void;
};

let memory: StarlinkCatalog | null = null;

async function loadElements(): Promise<StarlinkCatalog> {
  if (memory) return memory;
  memory = await loadStarlinkCatalog();
  return memory;
}

export function useConstellation(observer: Observer | null): ConstellationModel {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [summary, setSummary] = useState<ConstellationModel["summary"]>({
    total: 0,
    above: 0,
    inWindow: 0,
    at: 0,
    highest: null,
  });
  const [sky, setSky] = useState<SkyDot[]>([]);
  const prepared = useRef<PreparedSat[] | null>(null);
  const pushRef = useRef<(frame: ConstellationFrame) => void>(() => {});
  const observerRef = useRef(observer);
  observerRef.current = observer;
  const bindMap = useCallback((push: (frame: ConstellationFrame) => void) => {
    pushRef.current = push;
  }, []);

  useEffect(() => {
    let cancel = false;
    loadElements()
      .then((catalog) => {
        if (cancel) return;
        prepared.current = prepareElements(catalog.elements);
        setSource(catalog.source);
        setPhase("live");
      })
      .catch((reason: unknown) => {
        if (cancel) return;
        setPhase("error");
        setError(reason instanceof Error ? reason.message : "Orbit catalogue failed.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const lat = observer ? Math.round(observer.lat * 50) / 50 : null;
  const lon = observer ? Math.round(observer.lon * 50) / 50 : null;

  useEffect(() => {
    if (phase !== "live" || !prepared.current) return;
    let cancel = false;
    let timer = 0;
    const tick = async () => {
      const recs = prepared.current;
      if (!recs || cancel) return;
      try {
        const frame = await projectConstellation(recs, observerRef.current, () => cancel);
        if (cancel) return;
        setSummary({
          total: frame.total,
          above: frame.above,
          inWindow: frame.inWindow,
          at: frame.at,
          highest: frame.highest,
        });
        setSky(frame.sky);
        pushRef.current(frame);
      } catch (reason) {
        if (cancel) return;
        if (reason instanceof Error && reason.message === "cancelled") return;
        setError(reason instanceof Error ? reason.message : "Could not place the fleet.");
      }
      if (!cancel) timer = window.setTimeout(() => void tick(), 7000);
    };
    void tick();
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [phase, lat, lon]);

  return { phase, error, source, summary, sky, bindMap };
}
