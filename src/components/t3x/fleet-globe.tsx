import { useEffect, useRef, useState } from "react";
import land from "@/lib/net/land.json";
import { loadCatalog, type CatalogGroup } from "@/lib/net/elements";
import { groundPoint, prepareElements, type PreparedSat } from "@/lib/net/propagate";

const RINGS = land as [number, number][][];

const LAYERS: { id: CatalogGroup; color: string; big?: boolean }[] = [
  { id: "starlink", color: "#d4b15a" },
  { id: "oneweb", color: "#67e8f9" },
  { id: "iridium-NEXT", color: "#c084fc" },
  { id: "gps-ops", color: "#5ec8ff" },
  { id: "galileo", color: "#7dffb3" },
  { id: "glo-ops", color: "#ff7ad1" },
  { id: "weather", color: "#ffb45e" },
  { id: "visual", color: "#f4efe6" },
  { id: "stations", color: "#ffffff", big: true },
];

type FleetDot = { name: string; lat: number; lon: number; altKm: number; color: string; big: boolean };
type Row = { sat: PreparedSat; color: string; big: boolean };

function project(lat: number, lon: number, rot: number) {
  const phi = (lat * Math.PI) / 180;
  const lambda = ((lon - rot) * Math.PI) / 180;
  return {
    x: Math.cos(phi) * Math.sin(lambda),
    y: Math.sin(phi),
    z: Math.cos(phi) * Math.cos(lambda),
  };
}

function place(rows: Row[], date: Date): FleetDot[] {
  const dots: FleetDot[] = [];
  for (const row of rows) {
    const point = groundPoint(row.sat, date);
    if (!point || !Number.isFinite(point.lat)) continue;
    dots.push({ ...point, color: row.color, big: row.big });
  }
  return dots;
}

export function FleetGlobe({ observer }: { observer: { lat: number; lon: number } | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const rows = useRef<Row[]>([]);
  const [dots, setDots] = useState<FleetDot[]>([]);
  const [rot, setRot] = useState(145);
  const [zoom, setZoom] = useState(1);
  const [picked, setPicked] = useState<FleetDot | null>(null);
  const [note, setNote] = useState("Reading orbits…");
  const drag = useRef<{ x: number; rot: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);

  function scaleBy(delta: number) {
    setZoom((value) => Math.max(1, Math.min(4, Math.round((value + delta) * 20) / 20)));
  }

  useEffect(() => {
    let stop = false;
    async function load() {
      const next: Row[] = [];
      for (const layer of LAYERS) {
        try {
          const catalog = await loadCatalog({ data: { group: layer.id } });
          if (stop) return;
          for (const sat of prepareElements(catalog.elements)) {
            next.push({ sat, color: layer.color, big: Boolean(layer.big) });
          }
          rows.current = next.slice();
          setDots(place(rows.current, new Date()));
          setNote("");
        } catch {
          if (!stop && rows.current.length === 0) setNote("The orbit list did not answer.");
        }
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (rows.current.length) setDots(place(rows.current, new Date()));
    }, 5000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const node = canvas.current;
    const frame = box.current;
    if (!node || !frame) return;
    const width = Math.max(1, frame.clientWidth);
    const height = Math.max(1, frame.clientHeight);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    node.width = Math.floor(width * ratio);
    node.height = Math.floor(height * ratio);
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.36 * zoom;
    ctx.beginPath();
    ctx.fillStyle = "#163e72";
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    for (const ring of RINGS) {
      const pts: { x: number; y: number }[] = [];
      for (let index = 0; index < ring.length; index += 1) {
        const here = ring[index];
        const next = ring[(index + 1) % ring.length];
        const a = project(here[1], here[0], rot);
        const b = project(next[1], next[0], rot);
        if (a.z > 0) pts.push(a);
        if ((a.z > 0) !== (b.z > 0)) {
          const t = a.z / (a.z - b.z);
          pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      if (pts.length < 3) continue;
      ctx.beginPath();
      pts.forEach((point, index) => {
        const x = cx + point.x * radius;
        const y = cy - point.y * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "#c4a574";
      ctx.fill();
    }
    ctx.restore();
    const front = dots
      .map((dot) => {
        const point = project(dot.lat, dot.lon, rot);
        const lift = 1 + Math.min(Math.max(dot.altKm, 0), 2000) / 9000;
        return { dot, point, lift };
      })
      .filter((row) => row.point.z > 0.02)
      .sort((a, b) => a.point.z - b.point.z);
    for (const row of front) {
      const x = cx + row.point.x * radius * row.lift;
      const y = cy - row.point.y * radius * row.lift;
      ctx.beginPath();
      ctx.fillStyle = row.dot.color;
      ctx.arc(x, y, row.dot.big ? 5 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (observer) {
      const you = project(observer.lat, observer.lon, rot);
      if (you.z > 0.02) {
        ctx.beginPath();
        ctx.fillStyle = "#ff4d4d";
        ctx.arc(cx + you.x * radius, cy - you.y * radius, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#f4efe6";
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.strokeStyle = "rgba(244,239,230,0.7)";
    ctx.lineWidth = 1.5;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }, [dots, observer, rot, zoom]);

  function pickAt(clientX: number, clientY: number) {
    const frame = box.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const radius = Math.min(rect.width, rect.height) * 0.36 * zoom;
    let best: FleetDot | null = null;
    let bestD = 22;
    for (const dot of dots) {
      const point = project(dot.lat, dot.lon, rot);
      if (point.z <= 0.02) continue;
      const lift = 1 + Math.min(Math.max(dot.altKm, 0), 2000) / 9000;
      const x = cx + point.x * radius * lift;
      const y = cy - point.y * radius * lift;
      const distance = Math.hypot(clientX - rect.left - x, clientY - rect.top - y);
      if (distance < bestD) {
        bestD = distance;
        best = dot;
      }
    }
    setPicked(best);
  }

  return (
    <div className="grid gap-2">
      <div
        ref={box}
        className="desk-map h-80 w-full sm:h-[28rem]"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const pair = [...pointers.current.values()];
          pinch.current = pair.length >= 2 ? Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) : 0;
          drag.current = { x: event.clientX, rot, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const pair = [...pointers.current.values()];
          if (pair.length >= 2 && pinch.current > 0) {
            const next = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
            const ratio = next / pinch.current;
            if (ratio > 1.08 || ratio < 0.92) {
              pinch.current = next;
              scaleBy(ratio > 1 ? 0.15 : -0.15);
            }
            if (drag.current) drag.current.moved = true;
            return;
          }
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          if (Math.abs(dx) > 6) drag.current.moved = true;
          setRot(drag.current.rot + dx * 0.45);
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          const moved = drag.current?.moved;
          if (pointers.current.size === 0) drag.current = null;
          if (!moved) pickAt(event.clientX, event.clientY);
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          drag.current = null;
        }}
      >
        <canvas ref={canvas} className="h-full w-full" />
        <div className="map-tools">
          <button type="button" className="map-zoom" onClick={() => scaleBy(0.35)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="map-zoom" onClick={() => scaleBy(-0.35)} aria-label="Zoom out">
            −
          </button>
        </div>
      </div>
      <p className="text-base text-fg">{note || `${dots.length.toLocaleString()} satellites. Drag to turn. Pinch or use + to zoom.`}</p>
      {picked ? (
        <article className="card grid gap-1">
          <p className="text-lg font-semibold">{picked.name}</p>
          <p className="text-base text-fg">{Math.round(picked.altKm)} km up</p>
          <p className="text-base text-fg">
            {picked.lat.toFixed(2)}°, {picked.lon.toFixed(2)}°
          </p>
        </article>
      ) : null}
    </div>
  );
}
