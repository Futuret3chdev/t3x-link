import type { LinkReading } from "@/lib/net/types";

type NetworkConnection = EventTarget & {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  bluetooth: "Bluetooth",
  cellular: "Cellular",
  ethernet: "Ethernet",
  none: "None",
  wifi: "Wi-Fi",
  wimax: "WiMAX",
  other: "Other",
  unknown: "Not reported",
};

const EFFECTIVE_LABELS: Record<string, string> = {
  "slow-2g": "Slow 2G",
  "2g": "2G",
  "3g": "3G",
  "4g": "4G class",
};

function connection(): NetworkConnection | undefined {
  return (navigator as Navigator & { connection?: NetworkConnection }).connection;
}

export function readLink(): LinkReading {
  const link = connection();
  const type = link?.type || "unknown";
  const effectiveType = link?.effectiveType || "unknown";
  return {
    online: navigator.onLine,
    type,
    typeLabel: TYPE_LABELS[type] ?? "Not reported",
    effectiveType,
    effectiveLabel: EFFECTIVE_LABELS[effectiveType] ?? "Not reported",
    downlink: typeof link?.downlink === "number" ? link.downlink : null,
    rtt: typeof link?.rtt === "number" ? link.rtt : null,
    saveData: Boolean(link?.saveData),
  };
}

export function linkSignature(link: LinkReading): string {
  return `${link.online ? "up" : "down"}|${link.type}|${link.effectiveType}|${link.saveData ? "save" : "full"}`;
}

export function watchLink(onChange: () => void): () => void {
  const link = connection();
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  link?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
    link?.removeEventListener("change", onChange);
  };
}
