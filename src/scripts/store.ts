// localStorage-backed store for favorites and listen history.
// Stations are cached as full objects so /favorites and /history can
// render without re-fetching from Radio Browser.

export interface Station {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  codec: string;
  bitrate: number;
  hls: number;
  country: string;
  language: string;
  votes: number;
}

export interface HistoryEntry {
  station: Station;
  playedAt: number; // ms timestamp
}

const FAV_KEY = 'br-favorites';
const HIST_KEY = 'br-history';
const MAX_FAVORITES = 200;
const MAX_HISTORY = 50;

export const STORE_EVENT = 'br:store-changed';

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

export function getFavorites(): Station[] {
  return readJson<Station[]>(FAV_KEY, []);
}

export function isFavorite(stationuuid: string): boolean {
  return getFavorites().some((s) => s.stationuuid === stationuuid);
}

export function toggleFavorite(station: Station): boolean {
  const favs = getFavorites();
  const idx = favs.findIndex((s) => s.stationuuid === station.stationuuid);
  if (idx >= 0) {
    favs.splice(idx, 1);
    writeJson(FAV_KEY, favs);
    emit('favorites');
    return false;
  }
  favs.unshift(station);
  if (favs.length > MAX_FAVORITES) favs.length = MAX_FAVORITES;
  writeJson(FAV_KEY, favs);
  emit('favorites');
  return true;
}

export function removeFavorite(stationuuid: string) {
  const favs = getFavorites().filter((s) => s.stationuuid !== stationuuid);
  writeJson(FAV_KEY, favs);
  emit('favorites');
}

// ----- History -----

export function getHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(HIST_KEY, []);
}

export function addToHistory(station: Station) {
  const hist = getHistory();
  // De-dupe: remove any previous entry for this station, then prepend fresh.
  const filtered = hist.filter((e) => e.station.stationuuid !== station.stationuuid);
  filtered.unshift({ station, playedAt: Date.now() });
  if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY;
  writeJson(HIST_KEY, filtered);
  emit('history');
}

export function clearHistory() {
  writeJson(HIST_KEY, []);
  emit('history');
}
