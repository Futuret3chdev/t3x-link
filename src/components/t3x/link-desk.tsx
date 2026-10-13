import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { formatMbps, formatMs } from "@/lib/net/format";
import type { LinkModel } from "@/components/t3x/use-link";

function placeLine(model: LinkModel): string {
  const id = model.identity;
  if (!id) return "";
  return [id.city, id.country].filter(Boolean).join(", ");
}

export function LinkDesk({ model }: { model: LinkModel }) {
  const [copied, setCopied] = useState(false);
  const { link, identity, nat, reading, error, zone } = model;
  const place = placeLine(model);

  const verdict = !link
    ? "Reading this network…"
    : !link.online
      ? "This device is offline."
      : identity?.starlink
        ? "The public address belongs to SpaceX Starlink."
        : identity?.holder
          ? `On the network via ${identity.holder}${place ? ` · ${place}` : ""}.`
          : "On the network. The provider name has not come back yet.";

  async function copyReport() {
    const lines = [
      "T3x Link report · Futuret3ch",
      `Online: ${link?.online ? "yes" : "no"}`,
      `Transport: ${link?.typeLabel ?? "—"}`,
      `Browser class: ${link?.effectiveLabel ?? "—"}`,
      `Downlink hint: ${formatMbps(link?.downlink ?? null)}`,
      `Round-trip hint: ${formatMs(link?.rtt ?? null)}`,
      `Data saver: ${link?.saveData ? "on" : "off"}`,
      `Public address: ${identity?.ip ?? "—"}`,
      `Provider: ${identity?.holder || "—"}`,
      `ASN: ${identity?.asn ?? "—"}`,
      `Place: ${place || "—"}`,
      `Device zone: ${zone || "—"}`,
      `Starlink: ${identity?.starlink ? "yes" : "no"}`,
      `Local candidates: ${nat?.local.join(", ") || "—"}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="card accent-rail" aria-live="polite">
        <p className="kicker">This link</p>
        <h2 className="mt-2 text-2xl font-semibold">{verdict}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Websites cannot list nearby Wi-Fi names. T3x reads the link this browser will admit, then
          looks up the public address you are actually using.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="card">
          <p className="stat-label">Transport</p>
          <p className="stat-value mt-2">{link?.typeLabel ?? "—"}</p>
          <p className="mt-1 text-sm text-muted">{link?.effectiveLabel ?? "Waiting"}</p>
        </article>
        <article className="card">
          <p className="stat-label">Downlink hint</p>
          <p className="stat-value mt-2">{formatMbps(link?.downlink ?? null)}</p>
          <p className="mt-1 text-sm text-muted">Browser estimate, often capped</p>
        </article>
        <article className="card">
          <p className="stat-label">Round trip hint</p>
          <p className="stat-value mt-2">{formatMs(link?.rtt ?? null)}</p>
          <p className="mt-1 text-sm text-muted">Not a speed test</p>
        </article>
        <article className="card">
          <p className="stat-label">Data saver</p>
          <p className="stat-value mt-2">{link ? (link.saveData ? "On" : "Off") : "—"}</p>
          <p className="mt-1 text-sm text-muted">{link?.online ? "Path is up" : "Path is down"}</p>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="card">
          <p className="kicker">Public path</p>
          {error ? <p className="mt-3 text-sm text-mark">{error}</p> : null}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="stat-label">Address</dt>
              <dd className="mt-1 font-medium tabular-nums">{identity?.ip || (reading ? "Reading…" : "—")}</dd>
            </div>
            <div>
              <dt className="stat-label">ASN</dt>
              <dd className="mt-1 font-medium tabular-nums">{identity?.asn ?? (reading ? "…" : "—")}</dd>
            </div>
            <div className="col-span-2">
              <dt className="stat-label">Provider</dt>
              <dd className="mt-1 font-medium">{identity?.holder || (reading ? "Looking up the network…" : "—")}</dd>
            </div>
            <div>
              <dt className="stat-label">Place</dt>
              <dd className="mt-1 font-medium">{place || "—"}</dd>
            </div>
            <div>
              <dt className="stat-label">Device zone</dt>
              <dd className="mt-1 font-medium">{zone || "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">
            Place is approximate, from the public address — not GPS.
            {identity?.starlink ? " Starlink confirmed by the network holder." : ""}
          </p>
        </article>

        <article className="card">
          <p className="kicker">On this device</p>
          <dl className="mt-3 grid gap-3 text-sm">
            <div>
              <dt className="stat-label">Local candidates</dt>
              <dd className="mt-1 font-medium break-all">
                {nat ? nat.local.join(", ") || "None shared" : "Listening…"}
              </dd>
            </div>
            <div>
              <dt className="stat-label">Reflexive address</dt>
              <dd className="mt-1 font-medium break-all tabular-nums">
                {nat ? nat.reflexive.join(", ") || "None yet" : "Listening…"}
              </dd>
            </div>
            <div>
              <dt className="stat-label">Relay</dt>
              <dd className="mt-1 font-medium">{nat ? (nat.relay ? "A relay candidate appeared" : "No relay") : "…"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">
            {nat?.hiddenLocal
              ? "The browser hid the LAN address behind an mDNS name. That is normal."
              : "Browsers do not scan other devices on the LAN. This only lists candidates this page was allowed to see."}
          </p>
        </article>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => model.refresh()} disabled={reading}>
          <RefreshCw aria-hidden="true" size={16} />
          {reading ? "Reading…" : "Refresh"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void copyReport()}>
          <Copy aria-hidden="true" size={16} />
          {copied ? "Copied" : "Copy report"}
        </button>
      </div>
    </div>
  );
}
