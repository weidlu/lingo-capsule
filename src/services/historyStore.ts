import { invoke } from '@tauri-apps/api/core';
import { HistoryEntry, HistoryInsertPayload } from '../domain/correction';
import { canUseTauriCommands } from './tauriRuntime';

const historyKey = 'lingo-capsule.history.v1';

function readLocalHistory(): HistoryEntry[] {
  try {
    return JSON.parse(window.localStorage.getItem(historyKey) || '[]') as HistoryEntry[];
  } catch {
    return [];
  }
}

function writeLocalHistory(entries: HistoryEntry[]) {
  window.localStorage.setItem(historyKey, JSON.stringify(entries.slice(0, 100)));
}

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function insertHistoryEntry(payload: HistoryInsertPayload): Promise<HistoryEntry> {
  if (canUseTauriCommands()) {
    return invoke<HistoryEntry>('history_insert_entry', { payload });
  }

  const entry: HistoryEntry = {
    ...payload,
    id: createId(),
    createdAt: Date.now(),
  };
  writeLocalHistory([entry, ...readLocalHistory()]);
  return entry;
}

export async function acceptHistorySuggestion(id: string, suggestionId: string): Promise<HistoryEntry> {
  if (canUseTauriCommands()) {
    return invoke<HistoryEntry>('history_accept_suggestion', { id, suggestionId });
  }

  const entries = readLocalHistory();
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error('History entry not found.');
  }

  const suggestion = entry.suggestions.find((candidate) => candidate.id === suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found for history entry.');
  }

  const updated: HistoryEntry = {
    ...entry,
    acceptedSuggestionId: suggestion.id,
    acceptedRewrite: suggestion.rewrite,
    acceptedAt: Date.now(),
  };
  writeLocalHistory(entries.map((candidate) => (candidate.id === id ? updated : candidate)));
  return updated;
}

export async function listHistoryEntries(limit = 50): Promise<HistoryEntry[]> {
  if (canUseTauriCommands()) {
    return invoke<HistoryEntry[]>('history_list_entries', { limit });
  }

  return readLocalHistory().slice(0, limit);
}
