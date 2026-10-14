import { useEffect, useRef, useState } from "react";
import type { SkyDot } from "@/lib/net/propagate";

function wrap(az: number, heading: number): number {
  let rel = az - heading;
  while (rel > 180) rel -= 360;
  while (rel < -180) rel += 360;
  return rel;
}

export function SkyView({ sky, onClose }: { sky: SkyDot[]; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [heading, setHeading] = useState(0);
  const [lookEl, setLookEl] = useState(15);
  const [note, setNote] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let dead = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((media) => {
        if (dead) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().catch(() => undefined);
        }
      })
      .catch(() => setNote("Camera is blocked. Move the phone and the labels still follow the compass."));

    const onOrient = (event: DeviceOrientationEvent) => {
      const ios = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const head =
        typeof ios.webkitCompassHeading === "number"
          ? ios.webkitCompassHeading
          : event.alpha == null
            ? null
            : (360 - event.alpha + 360) % 360;
      if (head != null) setHeading(head);
      if (event.beta != null) setLookEl(Math.max(-5, Math.min(85, 90 - event.beta)));
    };
    window.addEventListener("deviceorientationabsolute", onOrient, true);
    window.addEventListener("deviceorientation", onOrient, true);
    return () => {
      dead = true;
      window.removeEventListener("deviceorientationabsolute", onOrient, true);
      window.removeEventListener("deviceorientation", onOrient, true);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const spots = sky
    .map((row) => ({ row, rel: wrap(row.az, heading), relEl: row.el - lookEl }))
    .filter((item) => Math.abs(item.rel) < 48 && Math.abs(item.relEl) < 38)
    .slice(0, 8);

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-label="AR sky">
      <video ref={video} className="intro-video" playsInline muted autoPlay />
      <div className="sky-cross" aria-hidden="true" />
      <p className="sky-head">{Math.round(heading)}°</p>
      {spots.map(({ row, rel, relEl }) => (
        <div key={row.name} className="sky-tag" style={{ left: `${50 + (rel / 48) * 42}%`, top: `${50 - (relEl / 38) * 42}%` }}>
          <span className="sky-pip" />
          <p className="font-semibold">{row.name}</p>
          <p>
            {Math.round(row.el)}° · {Math.round(row.rangeKm)} km
          </p>
        </div>
      ))}
      <button type="button" className="btn btn-primary intro-skip" onClick={onClose}>
        Close
      </button>
      <p className="sky-readout">
        Heading {Math.round(heading)}° · tilt {Math.round(lookEl)}° · {spots.length} in view
        {note ? ` · ${note}` : " · Move the phone in a figure-8 once if the compass feels off."}
      </p>
    </div>
  );
}
