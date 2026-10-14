import { useEffect, useRef, useState } from "react";
import land from "@/lib/net/land.json";

export type GlobeSpot = { name: string; lat: number; lon: number; free: boolean };

const RINGS = land as [number, number][][];

export const MAJOR_WIFI = [
  { name: "Sydney", lat: -33.87, lon: 151.21 },
  { name: "Melbourne", lat: -37.81, lon: 144.96 },
  { name: "Brisbane", lat: -27.47, lon: 153.03 },
  { name: "Perth", lat: -31.95, lon: 115.86 },
  { name: "Auckland", lat: -36.85, lon: 174.76 },
  { name: "Tokyo", lat: 35.68, lon: 139.65 },
  { name: "Seoul", lat: 37.57, lon: 126.98 },
  { name: "Singapore", lat: 1.35, lon: 103.82 },
  { name: "Hong Kong", lat: 22.32, lon: 114.17 },
  { name: "Bangkok", lat: 13.76, lon: 100.5 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Shanghai", lat: 31.23, lon: 121.47 },
  { name: "Jakarta", lat: -6.21, lon: 106.85 },
  { name: "Dubai", lat: 25.2, lon: 55.27 },
  { name: "London", lat: 51.51, lon: -0.13 },
  { name: "Paris", lat: 48.86, lon: 2.35 },
  { name: "Berlin", lat: 52.52, lon: 13.41 },
  { name: "Madrid", lat: 40.42, lon: -3.7 },
  { name: "Rome", lat: 41.9, lon: 12.5 },
  { name: "Amsterdam", lat: 52.37, lon: 4.9 },
  { name: "Istanbul", lat: 41.01, lon: 28.98 },
  { name: "Cairo", lat: 30.04, lon: 31.24 },
  { name: "Lagos", lat: 6.52, lon: 3.38 },
  { name: "Nairobi", lat: -1.29, lon: 36.82 },
  { name: "Johannesburg", lat: -26.2, lon: 28.05 },
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Los Angeles", lat: 34.05, lon: -118.24 },
  { name: "Chicago", lat: 41.88, lon: -87.63 },
  { name: "Toronto", lat: 43.65, lon: -79.38 },
  { name: "Mexico City", lat: 19.43, lon: -99.13 },
  { name: "São Paulo", lat: -23.55, lon: -46.63 },
  { name: "Buenos Aires", lat: -34.6, lon: -58.38 },
  { name: "Santiago", lat: -33.45, lon: -70.67 },
] as const;

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
    const radius = Math.min(width, height) * 0.42;
    ctx.beginPath();
    ctx.fillStyle = "#1a4f86";
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
      ctx.fillStyle = "#d9c7a2";
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.strokeStyle = "#f4efe6";
    ctx.lineWidth = 1.5;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (const city of MAJOR_WIFI) {
      const point = project(city.lat, city.lon, rot);
      if (point.z <= 0.05) continue;
      const x = cx + point.x * radius;
      const y = cy - point.y * radius;
      ctx.beginPath();
      ctx.fillStyle = "#e0b03a";
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "700 13px sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#07080d";
      ctx.strokeText(city.name, x + 6, y - 6);
      ctx.fillStyle = "#f4efe6";
      ctx.fillText(city.name, x + 6, y - 6);
    }
    for (const spot of spots) {
      const point = project(spot.lat, spot.lon, rot);
      if (point.z <= 0.05) continue;
      ctx.beginPath();
      ctx.fillStyle = "#2f7bff";
      ctx.arc(cx + point.x * radius, cy - point.y * radius, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [rot, spots]);

  return (
    <div
      ref={box}
      className="desk-map h-80 w-full sm:h-96"
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
