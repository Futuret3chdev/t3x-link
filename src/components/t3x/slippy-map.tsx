import { useEffect, useMemo, useRef, useState } from "react";

export type MapDot = {
  id?: string;
  lon: number;
  lat: number;
  tone: "gold" | "cobalt" | "ivory" | "mark";
  label: string;
};

const TONE_COLOR: Record<MapDot["tone"], string> = {
  gold: "#d4b15a",
  cobalt: "#2f7bff",
  ivory: "#f4efe6",
  mark: "#d4544a",
};

function world(lon: number, lat: number, zoom: number) {
  const size = 256 * 2 ** zoom;
  const x = ((lon + 180) / 360) * size;
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * size;
  return { x, y, size };
}

function unproject(x: number, y: number, zoom: number) {
  const size = 256 * 2 ** zoom;
  const lon = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lon, lat };
}

export function SlippyMap({
  lon,
  lat,
  zoom,
  tick = 0,
  dots,
  selected = "",
  onPick,
  className,
}: {
  lon: number;
  lat: number;
  zoom: number;
  tick?: number;
  dots: MapDot[];
  selected?: string;
  onPick?: (id: string) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ lon, lat, zoom });
  const [size, setSize] = useState({ w: 320, h: 288 });
  const [tip, setTip] = useState("");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ lon, lat, x: 0, y: 0, pinch: 0, mode: "undecided" as "undecided" | "pan" | "scroll" });

  useEffect(() => {
    setView({ lon, lat, zoom });
  }, [lat, lon, zoom, tick]);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setSize({ w: Math.max(1, node.clientWidth), h: Math.max(1, node.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const tiles = useMemo(() => {
    const z = view.zoom;
    const origin = world(view.lon, view.lat, z);
    const left = origin.x - size.w / 2;
    const top = origin.y - size.h / 2;
    const n = 2 ** z;
    const x0 = Math.floor(left / 256) - 1;
    const y0 = Math.floor(top / 256) - 1;
    const x1 = Math.floor((left + size.w) / 256) + 1;
    const y1 = Math.floor((top + size.h) / 256) + 1;
    const items: { key: string; src: string; left: number; top: number }[] = [];
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (y < 0 || y >= n) continue;
        const wrapped = ((x % n) + n) % n;
        items.push({
          key: `${z}/${wrapped}/${y}/${x}`,
          src: `https://tile.openstreetmap.org/${z}/${wrapped}/${y}.png`,
          left: x * 256 - left,
          top: y * 256 - top,
        });
      }
    }
    return items;
  }, [size.h, size.w, view.lat, view.lon, view.zoom]);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    node.width = Math.floor(size.w * ratio);
    node.height = Math.floor(size.h * ratio);
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const origin = world(view.lon, view.lat, view.zoom);
    const ordered = [...dots].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
    for (const dot of ordered) {
      const point = world(dot.lon, dot.lat, view.zoom);
      const x = size.w / 2 + (point.x - origin.x);
      const y = size.h / 2 + (point.y - origin.y);
      if (x < -20 || y < -20 || x > size.w + 20 || y > size.h + 20) continue;
      const chosen = Boolean(dot.id && dot.id === selected);
      const radius = dot.tone === "cobalt" ? 7 : chosen ? 11 : 8;
      ctx.beginPath();
      ctx.fillStyle = TONE_COLOR[dot.tone];
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#07080d";
      ctx.stroke();
      if (dot.tone !== "cobalt" && dot.id && dot.id === selected) {
        ctx.font = "700 14px sans-serif";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#07080d";
        ctx.strokeText(dot.label, x + 12, y - 8);
        ctx.fillStyle = "#f4efe6";
        ctx.fillText(dot.label, x + 12, y - 8);
      }
    }
  }, [dots, selected, size.h, size.w, view.lat, view.lon, view.zoom]);

  function zoomBy(delta: number) {
    setView((current) => ({ ...current, zoom: Math.max(2, Math.min(16, current.zoom + delta)) }));
  }

  function nearest(clientX: number, clientY: number): { id: string; label: string } | null {
    const node = box.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const origin = world(view.lon, view.lat, view.zoom);
    let best: { id: string; label: string } | null = null;
    let bestD = 36;
    for (const dot of dots) {
      const point = world(dot.lon, dot.lat, view.zoom);
      const x = size.w / 2 + (point.x - origin.x);
      const y = size.h / 2 + (point.y - origin.y);
      const distance = Math.hypot(clientX - rect.left - x, clientY - rect.top - y);
      if (distance < bestD) {
        bestD = distance;
        best = { id: dot.id || "", label: dot.label };
      }
    }
    return best;
  }

  function onPointerDown(event: React.PointerEvent) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = [...pointers.current.values()];
    gesture.current = {
      lon: view.lon,
      lat: view.lat,
      x: event.clientX,
      y: event.clientY,
      pinch: pair.length >= 2 ? Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) : 0,
      mode: "undecided",
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = [...pointers.current.values()];
    if (pair.length >= 2 && gesture.current.pinch > 0) {
      const next = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      const ratio = next / gesture.current.pinch;
      if (ratio > 1.25) {
        gesture.current.pinch = next;
        zoomBy(1);
      } else if (ratio < 0.8) {
        gesture.current.pinch = next;
        zoomBy(-1);
      }
      return;
    }
    const dx = event.clientX - gesture.current.x;
    const dy = event.clientY - gesture.current.y;
    if (gesture.current.mode === "undecided") {
      if (Math.hypot(dx, dy) < 10) return;
      gesture.current.mode = Math.abs(dy) > Math.abs(dx) ? "scroll" : "pan";
      if (gesture.current.mode === "pan") box.current?.setPointerCapture(event.pointerId);
    }
    if (gesture.current.mode !== "pan") return;
    const origin = world(gesture.current.lon, gesture.current.lat, view.zoom);
    const moved = unproject(
      origin.x - (event.clientX - gesture.current.x),
      origin.y - (event.clientY - gesture.current.y),
      view.zoom,
    );
    setView((current) => ({ ...current, lon: moved.lon, lat: moved.lat }));
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = gesture.current;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    pointers.current.delete(event.pointerId);
    if (moved < 8) {
      const hit = nearest(event.clientX, event.clientY);
      setTip(hit?.label || "");
      if (hit?.id) onPick?.(hit.id);
    }
  }

  return (
    <div
      ref={box}
      className={`desk-map ${className || ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          alt=""
          src={tile.src}
          draggable={false}
          className="map-tile"
          style={{ left: tile.left, top: tile.top }}
        />
      ))}
      <canvas ref={canvas} className="map-dots" />
      <div className="map-tools">
        <button type="button" className="map-zoom" onClick={() => zoomBy(1)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="map-zoom" onClick={() => zoomBy(-1)} aria-label="Zoom out">
          −
        </button>
      </div>
      {tip ? <p className="map-tip">{tip}</p> : null}
      <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap
      </a>
    </div>
  );
}
