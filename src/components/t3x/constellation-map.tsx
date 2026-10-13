import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MlMap, Popup } from "maplibre-gl";
import { openDeskMap } from "@/components/t3x/desk-map";
import { cssColor } from "@/lib/net/format";
import type { ConstellationFrame } from "@/lib/net/propagate";

export function ConstellationMap({ bind }: { bind: (push: (frame: ConstellationFrame) => void) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    let dead = false;
    let destroy = () => {};
    let map: MlMap | null = null;
    let popup: Popup | null = null;
    let latest: ConstellationFrame | null = null;

    const apply = () => {
      if (!map || !latest || !map.getSource("sats")) return;
      (map.getSource("sats") as GeoJSONSource).setData(latest.features);
      const you = map.getSource("you") as GeoJSONSource | undefined;
      if (!you) return;
      if (!latest.observer) {
        you.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      you.setData({
        type: "Feature",
        geometry: { type: "Point", coordinates: [latest.observer.lon, latest.observer.lat] },
        properties: { name: "You" },
      });
    };

    bind((frame) => {
      latest = frame;
      apply();
    });

    void openDeskMap(node, { center: [12, 18], zoom: 1.25 }).then((handle) => {
      if (dead) {
        handle.destroy();
        return;
      }
      map = handle.map;
      destroy = handle.destroy;
      handle.map.on("load", () => {
        if (!map) return;
        const gold = cssColor("--color-accent", "#d4b15a");
        const cobalt = cssColor("--color-primary", "#2f7bff");
        const ivory = cssColor("--color-fg", "#f4efe6");
        const ink = cssColor("--color-bg", "#07080d");
        const mark = cssColor("--color-mark", "#d3122a");
        map.addSource("sats", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "sats",
          type: "circle",
          source: "sats",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              ["case", [">=", ["get", "el"], 25], 2.4, [">", ["get", "el"], 0], 1.8, 1.2],
              4,
              ["case", [">=", ["get", "el"], 25], 5, [">", ["get", "el"], 0], 3.5, 2.2],
            ],
            "circle-color": [
              "case",
              [">=", ["get", "el"], 25],
              gold,
              [">", ["get", "el"], 0],
              cobalt,
              ivory,
            ],
            "circle-opacity": ["case", [">=", ["get", "el"], 25], 0.95, [">", ["get", "el"], 0], 0.8, 0.45],
            "circle-stroke-width": 0.6,
            "circle-stroke-color": ink,
          },
        });
        map.addSource("you", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "you",
          type: "circle",
          source: "you",
          paint: {
            "circle-radius": 7,
            "circle-color": mark,
            "circle-stroke-width": 2,
            "circle-stroke-color": ivory,
          },
        });
        map.on("click", "sats", (event) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point" || !map) return;
          const name = String(feature.properties?.name || "Starlink");
          const elevation = Number(feature.properties?.el);
          const detail = Number.isFinite(elevation) && elevation > -80 ? ` · ${Math.round(elevation)}° up` : "";
          popup?.remove();
          popup = new handle.ml.Popup({ closeButton: false, offset: 10 })
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setText(`${name}${detail}`)
            .addTo(map);
        });
        apply();
      });
    });

    return () => {
      dead = true;
      popup?.remove();
      destroy();
    };
  }, [bind]);

  return (
    <div
      ref={frameRef}
      className="desk-map mt-3 h-72 w-full overflow-hidden rounded-card border border-line sm:h-96"
    />
  );
}
