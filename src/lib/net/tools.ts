import { createServerFn } from "@tanstack/react-start";

const UA = "T3xLink/1.0 (Futuret3ch; https://github.com/Futuret3chdev/t3x-link)";

export type ToolKind = "dns" | "mx" | "rdap" | "https";

export type ToolReport = { title: string; lines: string[] };

function hostOf(value: string): string | null {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "");
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || !host.includes(".")) return null;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return null;
  if (/^(127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return null;
  return host;
}

async function dns(host: string, type: "A" | "AAAA" | "MX"): Promise<string[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`;
  const res = await fetch(url, {
    headers: { Accept: "application/dns-json", "User-Agent": UA },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error("DNS did not answer.");
  const body = (await res.json()) as { Answer?: { data?: string }[]; Status?: number };
  const lines = (body.Answer || []).map((row) => (row.data || "").replace(/\.$/, "")).filter(Boolean);
  return lines.length ? lines.slice(0, 8) : ["No records."];
}

export const runTool = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = input as { kind?: unknown; host?: unknown };
    const kind = String(raw?.kind || "");
    const host = hostOf(String(raw?.host || ""));
    if (kind !== "dns" && kind !== "mx" && kind !== "rdap" && kind !== "https") throw new Error("Pick a tool.");
    if (!host) throw new Error("Type a public host name, like example.com.");
    return { kind: kind as ToolKind, host };
  })
  .handler(async ({ data }): Promise<ToolReport> => {
    const { kind, host } = data;
    if (kind === "dns") {
      const v4 = await dns(host, "A");
      const v6 = await dns(host, "AAAA");
      return { title: host, lines: [`A`, ...v4, `AAAA`, ...v6] };
    }
    if (kind === "mx") {
      return { title: `${host} mail`, lines: await dns(host, "MX") };
    }
    if (kind === "rdap") {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(host)}`, {
        headers: { Accept: "application/rdap+json, application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 404) return { title: host, lines: ["No public registration record."] };
      if (!res.ok) throw new Error("Registration lookup did not answer.");
      const body = (await res.json()) as {
        status?: string[];
        events?: { eventAction?: string; eventDate?: string }[];
        entities?: { roles?: string[]; vcardArray?: unknown[] }[];
      };
      const expiry = body.events?.find((event) => event.eventAction === "expiration")?.eventDate;
      const registrar = body.entities?.find((entity) => entity.roles?.includes("registrar"));
      const vcard = (registrar?.vcardArray as unknown[] | undefined)?.[1];
      let name = "Registrar not listed";
      if (Array.isArray(vcard)) {
        for (const row of vcard) {
          if (Array.isArray(row) && row[0] === "fn" && typeof row[3] === "string") name = row[3];
        }
      }
      return {
        title: host,
        lines: [name, expiry ? `Expires ${expiry.slice(0, 10)}` : "No expiry listed", ...(body.status || []).slice(0, 4)],
      };
    }
    const started = Date.now();
    const res = await fetch(`https://${host}/`, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(8_000),
    });
    const ms = Date.now() - started;
    const server = res.headers.get("server");
    return {
      title: host,
      lines: [`HTTPS ${res.status} in ${ms} ms`, server ? `Server ${server}` : "No server name", "Checked from the T3x server, not this phone."],
    };
  });
