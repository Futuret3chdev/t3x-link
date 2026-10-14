export type PhoneFacts = {
  cores: number | null;
  memoryGb: number | null;
  language: string;
  screen: string;
  battery: number | null;
  charging: boolean | null;
  touch: boolean;
  bluetooth: boolean;
};

export type PathSample = {
  pingMs: number;
  downMbps: number;
};

type BatteryManager = {
  level: number;
  charging: boolean;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function readPhone(): Promise<PhoneFacts> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    bluetooth?: unknown;
  };
  let battery: number | null = null;
  let charging: boolean | null = null;
  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery;
  if (getBattery) {
    try {
      const cell = await getBattery();
      battery = Math.round(cell.level * 100);
      charging = cell.charging;
    } catch {
      battery = null;
    }
  }
  return {
    cores: typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    language: navigator.language || "",
    screen: `${window.screen.width}×${window.screen.height}`,
    battery,
    charging,
    touch: navigator.maxTouchPoints > 0,
    bluetooth: "bluetooth" in navigator,
  };
}

export async function samplePath(signal: AbortSignal): Promise<PathSample> {
  const samples: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const start = performance.now();
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=0&r=${Math.random()}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) throw new Error("The path sample did not answer.");
    await res.arrayBuffer();
    samples.push(performance.now() - start);
  }
  const pingMs = median(samples.slice(1));
  const bytes = 200_000;
  const start = performance.now();
  const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Math.random()}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error("The short download did not answer.");
  const body = await res.arrayBuffer();
  const seconds = (performance.now() - start) / 1000;
  const downMbps = seconds > 0 ? (body.byteLength * 8) / seconds / 1_000_000 : 0;
  return { pingMs, downMbps };
}

export async function pickBluetooth(): Promise<string> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice: (options: { acceptAllDevices: boolean }) => Promise<{ name?: string }>;
    };
  };
  if (!nav.bluetooth) throw new Error("This browser has no Bluetooth chooser. iPhone Safari does not.");
  const device = await nav.bluetooth.requestDevice({ acceptAllDevices: true });
  return device.name?.trim() || "Unnamed device";
}
