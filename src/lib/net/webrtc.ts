import type { NatReport } from "@/lib/net/types";

function empty(): NatReport {
  return { local: [], reflexive: [], relay: false, hiddenLocal: false };
}

export function probeNat(timeoutMs = 3500): Promise<NatReport> {
  if (typeof RTCPeerConnection === "undefined") return Promise.resolve(empty());

  return new Promise((resolve) => {
    const local = new Set<string>();
    const reflexive = new Set<string>();
    let relay = false;
    let settled = false;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        pc.close();
      } catch {
        /* already closed */
      }
      const locals = [...local];
      resolve({
        local: locals,
        reflexive: [...reflexive],
        relay,
        hiddenLocal: locals.some((item) => item.endsWith(".local")),
      });
    };

    const timer = window.setTimeout(finish, timeoutMs);
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        finish();
        return;
      }
      const parts = event.candidate.candidate.split(" ");
      const address = parts[4] || "";
      const kind = parts[7] || "";
      if (!address || address === "0.0.0.0") return;
      if (kind === "host") local.add(address);
      if (kind === "srflx") reflexive.add(address);
      if (kind === "relay") relay = true;
    };

    try {
      pc.createDataChannel("t3x");
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(finish);
    } catch {
      finish();
    }
  });
}
