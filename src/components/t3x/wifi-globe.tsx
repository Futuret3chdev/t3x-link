import { useEffect, useRef, useState } from "react";

export type GlobeSpot = { name: string; lat: number; lon: number; free: boolean };

function project(lat: number, lon: number, rot: number) {
  const phi = (lat * Math.PI) / 180;
  const lambda = ((lon - rot) * Math.PI) / 180;
  return {
    x: Math.cos(phi) * Math.sin(lambda),
    y: Math.sin(phi),
    z: Math.cos(phi) * Math.cos(lambda),
  };
}

export function WifiGlobe({ spots }: { spots: GlobeSpot[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [rot, setRot] = useState(145);
  const drag = useRef<{ x: number; rot: number } | null>(null);

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
    const radius = Math.min(width, height) * 0.4;
    ctx.beginPath();
    ctx.fillStyle = "#14304c";
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(244,239,230,0.28)";
    ctx.lineWidth = 1;
    for (const lat of [-60, -30, 0, 30, 60]) {
      ctx.beginPath();
      let open = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        const point = project(lat, lon, rot);
        if (point.z <= 0) {
          open = false;
          continue;
        }
        const x = cx + point.x * radius;
        const y = cy - point.y * radius;
        if (!open) {
          ctx.moveTo(x, y);
          open = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath();
      let open = false;
      for (let lat = -80; lat <= 80; lat += 4) {
        const point = project(lat, lon, rot);
        if (point.z <= 0) {
          open = false;
          continue;
        }
        const x = cx + point.x * radius;
        const y = cy - point.y * radius;
        if (!open) {
          ctx.moveTo(x, y);
          open = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const ordered = [...spots].sort((a, b) => project(a.lat, a.lon, rot).z - project(b.lat, b.lon, rot).z);
    for (const spot of ordered) {
      const point = project(spot.lat, spot.lon, rot);
      if (point.z <= 0.02) continue;
      ctx.beginPath();
      ctx.fillStyle = spot.free ? "#d4b15a" : "#f4efe6";
      ctx.arc(cx + point.x * radius, cy - point.y * radius, spot.free ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [rot, spots]);

  return (
    <div
      ref={box}
      className="desk-map h-72 w-full sm:h-80"
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, rot };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        setRot(drag.current.rot + (event.clientX - drag.current.x) * 0.45);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <canvas ref={canvas} className="h-full w-full" />
    </div>
  );
}
