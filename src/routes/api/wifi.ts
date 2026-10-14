import { createFileRoute } from "@tanstack/react-router";
import { cleanSsid, openWifiProfile } from "@/lib/net/wifi-profile";

export const Route = createFileRoute("/api/wifi")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ssid = cleanSsid(new URL(request.url).searchParams.get("ssid") || "");
        if (!ssid) return new Response("Network name is missing or not usable.", { status: 400 });
        return new Response(openWifiProfile(ssid), {
          headers: {
            "Content-Type": "application/x-apple-aspen-config",
            "Content-Disposition": 'attachment; filename="t3x-open.mobileconfig"',
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
