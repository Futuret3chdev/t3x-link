import { useEffect, useMemo, useState } from "react";
import { SlippyMap, type MapDot } from "@/components/t3x/slippy-map";
import type { ConstellationFrame } from "@/lib/net/propagate";

export function ConstellationMap({ bind }: { bind: (push: (frame: ConstellationFrame) => void) => void }) {
  const [frame, setFrame] = useState<ConstellationFrame | null>(null);

  useEffect(() => {
    bind(setFrame);
  }, [bind]);

  const dots = useMemo<MapDot[]>(() => {
    if (!frame) return [];
    const marks: MapDot[] = frame.features.features.map((feature) => {
      const elevation = feature.properties.el;
      const tone = elevation >= 25 ? "gold" : elevation > 0 ? "cobalt" : "ivory";
      const detail = elevation > -80 ? ` · ${elevation}°` : "";
      return {
        lon: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1],
        tone,
        label: `${feature.properties.name}${detail}`,
      };
    });
    if (frame.observer) {
      marks.push({
        lon: frame.observer.lon,
        lat: frame.observer.lat,
        tone: "mark",
        label: "Measured from here",
      });
    }
    return marks;
  }, [frame]);

  const focus = frame?.observer ?? { lon: 134, lat: -25 };
  return (
    <SlippyMap
      lon={focus.lon}
      lat={focus.lat}
      zoom={frame?.observer ? 3 : 2}
      dots={dots}
      className="mt-3 h-72 w-full rounded-card border border-line sm:h-96"
    />
  );
}
