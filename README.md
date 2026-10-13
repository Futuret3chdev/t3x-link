# T3x Link

Starlink and internet command desk by **Futuret3ch**.

T3x Link reads the connection this browser will actually admit, maps public places tagged with internet access, sketches Starlink sky clearance, and benches the path.

Browsers cannot list nearby Wi-Fi names. That limit is called out in the product instead of faked.

## Desks

- **Link** — online state, transport, browser speed hints, public address, provider, Starlink detection, local network candidates.
- **Hotspots** — OpenStreetMap places around you: libraries, community rooms, coworking, and tagged Wi-Fi. Filter anything marked free.
- **Starlink** — sky-window sketch (25° mask), provider check, dish address `192.168.100.1`.
- **Bench** — ping, jitter, download, and upload against Cloudflare.
- **Field notes** — networks saved on this device, a Wi-Fi join code that is not stored, and a link journal.

## Run

```bash
npm install
npm run dev
```
