import { createServerFn } from "@tanstack/react-start";

const UA = "T3xLink/1.0 (Futuret3ch; https://github.com/Futuret3chdev/t3x-link)";

export type ElementSet = { name: string; line1: string; line2: string };

export type StarlinkCatalog = {
  source: string;
  fetchedAt: number;
  elements: ElementSet[];
};

const SOURCES: { source: string; url: string; timeout: number }[] = [
  {
    source: "CelesTrak",
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
    timeout: 4_000,
  },
  {
    source: "CelesTrak mirror",
    url: "https://raw.githubusercontent.com/satvisorcom/satvisor-data/master/celestrak/tle/starlink.tle",
    timeout: 20_000,
  },
  {
    source: "CelesTrak mirror",
    url: "https://cdn.jsdelivr.net/gh/satvisorcom/satvisor-data@master/celestrak/tle/starlink.tle",
    timeout: 20_000,
  },
];

const TTL = 2 * 60 * 60 * 1000;

let cached: { at: number; catalog: StarlinkCatalog } | null = null;
let pending: Promise<StarlinkCatalog> | null = null;

export function parseTle(text: string): ElementSet[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const elements: ElementSet[] = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line1 = lines[i + 1] ?? "";
    const line2 = lines[i + 2] ?? "";
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;
    const name = lines[i].startsWith("1 ") || lines[i].startsWith("2 ") ? `NORAD ${line1.slice(2, 7).trim()}` : lines[i];
    elements.push({ name: name.slice(0, 32), line1, line2 });
    i += 2;
  }
  return elements;
}

async function fetchCatalog(): Promise<StarlinkCatalog> {
  let last = "Orbit catalogue did not answer.";
  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { "User-Agent": UA, Accept: "text/plain" },
        signal: AbortSignal.timeout(source.timeout),
      });
      if (!res.ok) {
        last = `Orbit catalogue answered ${res.status}.`;
        continue;
      }
      const elements = parseTle(await res.text());
      if (elements.length < 100) {
        last = "Orbit catalogue came back almost empty.";
        continue;
      }
      return { source: source.source, fetchedAt: Date.now(), elements };
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

export const GROUPS = ["stations", "gps-ops", "glo-ops", "galileo", "weather", "visual", "starlink", "iridium-NEXT", "oneweb"] as const;

export type CatalogGroup = (typeof GROUPS)[number];

const groupCache = new Map<string, { at: number; catalog: StarlinkCatalog }>();
const groupPending = new Map<string, Promise<StarlinkCatalog>>();

async function fetchGroup(group: CatalogGroup): Promise<StarlinkCatalog> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/plain" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error("The orbit catalogue did not answer.");
  const elements = parseTle(await res.text());
  if (elements.length < 3) throw new Error("That catalogue came back empty.");
  return { source: "CelesTrak", fetchedAt: Date.now(), elements };
}

export const loadCatalog = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const group = String((input as { group?: unknown })?.group || "");
    if (!GROUPS.includes(group as CatalogGroup)) throw new Error("That group is not tracked.");
    return { group: group as CatalogGroup };
  })
  .handler(async ({ data }): Promise<StarlinkCatalog> => {
    const hit = groupCache.get(data.group);
    if (hit && Date.now() - hit.at < TTL) return hit.catalog;
    let pending = groupPending.get(data.group);
    if (!pending) {
      pending = fetchGroup(data.group)
        .then((catalog) => {
          groupCache.set(data.group, { at: Date.now(), catalog });
          return catalog;
        })
        .finally(() => {
          groupPending.delete(data.group);
        });
      groupPending.set(data.group, pending);
    }
    return pending;
  });

export const loadStarlinkCatalog = createServerFn({ method: "GET" }).handler(async (): Promise<StarlinkCatalog> => {
  if (cached && Date.now() - cached.at < TTL) return cached.catalog;
  if (!pending) {
    pending = fetchCatalog()
      .then((catalog) => {
        cached = { at: Date.now(), catalog };
        return catalog;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
});
