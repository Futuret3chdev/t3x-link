import { cleanSsid } from "@/lib/net/wifi-profile";

export async function joinOpenWifi(ssid: string): Promise<string> {
  const name = cleanSsid(ssid);
  if (!name) throw new Error("That network name is not usable.");
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const android = /Android/i.test(navigator.userAgent);
  const target = `/api/wifi?ssid=${encodeURIComponent(name)}`;
  if (ios) {
    window.location.assign(target);
    return "Profile is opening. In Settings, tap Profile Downloaded, then Install. The phone joins that open network.";
  }
  try {
    await navigator.clipboard.writeText(name);
  } catch {
    /* settings can still open */
  }
  if (android) {
    window.location.assign("intent:#Intent;action=android.settings.WIFI_SETTINGS;end");
    return `“${name}” is copied. Pick that open network in Wi-Fi. Android does not let a website join for you.`;
  }
  window.location.assign(target);
  return "The open-network profile is downloading. Install it on the phone that should join.";
}

export function openHotspotSettings(name: string): string {
  const android = /Android/i.test(navigator.userAgent);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (android) {
    window.location.assign("intent:#Intent;action=android.settings.TETHER_SETTINGS;end");
    return `Hotspot settings should open. Set the name to “${name}” and leave the security open.`;
  }
  if (ios) {
    return `On this iPhone open Settings, tap Personal Hotspot, turn it on, and set the name to “${name}”. A website cannot switch the hotspot on.`;
  }
  return `Turn on your hotspot and set the name to “${name}”.`;
}
