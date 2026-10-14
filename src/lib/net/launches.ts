import { createServerFn } from "@tanstack/react-start";

const UA = "T3xLink/1.0 (Futuret3ch; https://github.com/Futuret3chdev/t3x-link)";

export type Launch = {
  id: string;
  name: string;
  at: number;
  status: string;
  rocket: string;
  provider: string;
  pad: string;
  mission: string;
  upcoming: boolean;
};

const TTL = 20 * 60 * 1000;
let cached: { at: number; rows: Launch[] } | null = null;
let pending: Promise<Launch[]> | null = null;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapRow(row: Record<string, unknown>, upcoming: boolean): Launch | null {
  const at = Date.parse(text(row.net));
  if (!Number.isFinite(at)) return null;
  const status = row.status as { name?: string } | undefined;
  const provider = row.launch_service_provider as { name?: string } | undefined;
  const rocket = row.rocket as { configuration?: { name?: string } } | undefined;
  const pad = row.pad as { name?: string; location?: { name?: string } } | undefined;
  const mission = row.mission as { name?: string; description?: string } | undefined;
  return {
    id: text(row.id) || `${at}`,
    name: text(row.name) || "Launch",
    at,
    status: status?.name || (upcoming ? "Upcoming" : "Past"),
    rocket: rocket?.configuration?.name || "",
    provider: provider?.name || "",
    pad: [pad?.name, pad?.location?.name].filter(Boolean).join(" · "),
    mission: mission?.description || mission?.name || "",
    upcoming,
  };
}

async function pull(kind: "upcoming" | "previous"): Promise<Launch[]> {
  const res = await fetch(`https://ll.thespacedevs.com/2.2.0/launch/${kind}/?limit=12&mode=detailed`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 429) throw new Error("The launch list is busy. Try again in a few minutes.");
  if (!res.ok) throw new Error("The launch list did not answer.");
  const body = (await res.json()) as { results?: Record<string, unknown>[] };
  return (body.results || []).map((row) => mapRow(row, kind === "upcoming")).filter((row): row is Launch => Boolean(row));
}

async function load(): Promise<Launch[]> {
  const upcoming = await pull("upcoming");
  let previous: Launch[] = [];
  try {
    previous = await pull("previous");
  } catch {
    previous = [];
  }
  return [...upcoming, ...previous.filter((row) => !upcoming.some((item) => item.id === row.id))];
}

export const loadLaunches = createServerFn({ method: "GET" }).handler(async (): Promise<Launch[]> => {
  if (cached && Date.now() - cached.at < TTL) return cached.rows;
  if (!pending) {
    pending = load()
      .then((rows) => {
        cached = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
});
