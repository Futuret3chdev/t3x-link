export function cleanSsid(value: string): string | null {
  const ssid = value.normalize("NFKC").trim();
  if (ssid.length < 1 || ssid.length > 32) return null;
  if (/[\u0000-\u001f\u007f]/.test(ssid)) return null;
  return ssid;
}

function xml(value: string): string {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  return value.replaceAll("&", amp).replaceAll("<", lt).replaceAll(">", gt).replaceAll('"', quot);
}

export function openWifiProfile(ssid: string): string {
  const name = cleanSsid(ssid);
  if (!name) throw new Error("That network name is not usable.");
  const networkId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const label = xml(name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>AutoJoin</key>
      <true/>
      <key>EncryptionType</key>
      <string>None</string>
      <key>HIDDEN_NETWORK</key>
      <false/>
      <key>SSID_STR</key>
      <string>${label}</string>
      <key>PayloadDisplayName</key>
      <string>T3x Link</string>
      <key>PayloadIdentifier</key>
      <string>au.futuret3ch.t3xlink.wifi</string>
      <key>PayloadType</key>
      <string>com.apple.wifi.managed</string>
      <key>PayloadUUID</key>
      <string>${networkId}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>T3x Link · ${label}</string>
  <key>PayloadDescription</key>
  <string>Join this open Wi-Fi network. Futuret3ch does not store the name.</string>
  <key>PayloadIdentifier</key>
  <string>au.futuret3ch.t3xlink</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${profileId}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}
