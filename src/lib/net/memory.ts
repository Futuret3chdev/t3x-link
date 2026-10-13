import type { BenchResult, FieldNote, JournalEntry } from "@/lib/net/types";

const NOTES = "t3x-link-notes";
const JOURNAL = "t3x-link-journal";
const BENCH = "t3x-link-bench";
const SKY = "t3x-link-sky";

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
