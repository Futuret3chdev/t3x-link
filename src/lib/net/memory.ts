import type { BenchResult, FieldNote, JournalEntry } from "@/lib/net/types";

const NOTES = "t3x-link-notes";
const JOURNAL = "t3x-link-journal";
const BENCH = "t3x-link-bench";
const SKY = "t3x-link-sky";
const PINGS = "t3x-link-pings";
const NETS = "t3x-open-nets";

export type PingMark = { at: number; pingMs: number };
export type OpenNet = { id: string; at: number; name: string; note: string };

const listeners = new Set<() => void>();
let lastSummary = "";
let lastAt = 0;

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  listeners.forEach((listener) => listener());
}

export function subscribeMemory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readNotes(): FieldNote[] {
  const notes = read<FieldNote[]>(NOTES, []);
  return Array.isArray(notes) ? notes : [];
}

export function saveNote(note: FieldNote) {
  write(NOTES, [note, ...readNotes()].slice(0, 40));
}

export function removeNote(id: string) {
  write(
    NOTES,
    readNotes().filter((note) => note.id !== id),
  );
}

export function readJournal(): JournalEntry[] {
  const rows = read<JournalEntry[]>(JOURNAL, []);
  return Array.isArray(rows) ? rows : [];
}

export function pushJournal(summary: string) {
  const now = Date.now();
  if (summary === lastSummary && now - lastAt < 8000) return;
  lastSummary = summary;
  lastAt = now;
  const entry: JournalEntry = { id: crypto.randomUUID(), at: now, summary };
  write(JOURNAL, [entry, ...readJournal()].slice(0, 40));
}

export function readBenchHistory(): BenchResult[] {
  const rows = read<BenchResult[]>(BENCH, []);
  return Array.isArray(rows) ? rows : [];
}

export function pushBench(result: BenchResult) {
  write(BENCH, [result, ...readBenchHistory()].slice(0, 6));
}

export function readSky(): string {
  const value = read<string>(SKY, "");
  return typeof value === "string" && value.length === 72 ? value : "0".repeat(72);
}

export function writeSky(mask: string) {
  write(SKY, mask);
}

export function readPings(): PingMark[] {
  const rows = read<PingMark[]>(PINGS, []);
  return Array.isArray(rows) ? rows.filter((row) => Number.isFinite(row.pingMs)) : [];
}

export function pushPing(pingMs: number) {
  if (!Number.isFinite(pingMs) || pingMs <= 0) return;
  const now = Date.now();
  const rows = readPings().filter((row) => now - row.at < 30 * 60 * 1000);
  const last = rows[rows.length - 1];
  if (last && now - last.at < 8000) return;
  write(PINGS, [...rows, { at: now, pingMs: Math.round(pingMs) }].slice(-12));
}

export function readNets(): OpenNet[] {
  const rows = read<OpenNet[]>(NETS, []);
  return Array.isArray(rows) ? rows.filter((row) => typeof row.name === "string" && row.name.length > 0) : [];
}

export function saveNet(net: OpenNet) {
  const rows = readNets().filter((row) => row.id !== net.id && row.name !== net.name);
  write(NETS, [net, ...rows].slice(0, 12));
}

export function removeNet(id: string) {
  write(NETS, readNets().filter((row) => row.id !== id));
}
