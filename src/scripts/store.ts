// localStorage-backed store for favorite channels and watch history.
// Channels are cached as full objects so /favorites and /history can render
// without re-fetching from the iptv-org API.

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo: string;
  /** Comma-separated category display names. */
  categories: string;
  /** Country display name. */
  country: string;
  countryCode: string;
  flag: string;
  languages: string;
  network: string;
}

export interface HistoryEntry {
  channel: Channel;
  watchedAt: number; // ms timestamp
}

const FAV_KEY = 'wtv-favorites';
const HIST_KEY = 'wtv-history';
const MAX_FAVORITES = 300;
const MAX_HISTORY = 50;

export const STORE_EVENT = 'wtv:store-changed';

type ChangeKind = 'favorites' | 'history';

function emit(kind: ChangeKind) {
  document.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: { kind } }));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Quota exceeded or storage disabled — silently degrade.
    console.warn('Storage write failed:', err);
  }
}

// ----- Favorites -----

export function getFavorites(): Channel[] {
  return readJson<Channel[]>(FAV_KEY, []);
}

export function isFavorite(id: string): boolean {
  return getFavorites().some((c) => c.id === id);
}

export function toggleFavorite(channel: Channel): boolean {
  const favs = getFavorites();
  const idx = favs.findIndex((c) => c.id === channel.id);
  if (idx >= 0) {
    favs.splice(idx, 1);
    writeJson(FAV_KEY, favs);
    emit('favorites');
    return false;
  }
  favs.unshift(channel);
  if (favs.length > MAX_FAVORITES) favs.length = MAX_FAVORITES;
  writeJson(FAV_KEY, favs);
  emit('favorites');
  return true;
}

export function removeFavorite(id: string) {
  const favs = getFavorites().filter((c) => c.id !== id);
  writeJson(FAV_KEY, favs);
  emit('favorites');
}

// ----- History -----

export function getHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(HIST_KEY, []);
}

export function addToHistory(channel: Channel) {
  const hist = getHistory();
  const filtered = hist.filter((e) => e.channel.id !== channel.id);
  filtered.unshift({ channel, watchedAt: Date.now() });
  if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY;
  writeJson(HIST_KEY, filtered);
  emit('history');
}

export function clearHistory() {
  writeJson(HIST_KEY, []);
  emit('history');
}
