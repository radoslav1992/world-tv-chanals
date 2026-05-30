import Hls from 'hls.js';
import type { Channel } from './store';

const API_CHANNELS = '/api/channels';
const STORE_KEY = 'wtv-mosaic';
const CELL_COUNT = 4;

interface Cell {
  idx: number;
  root: HTMLElement;
  video: HTMLVideoElement;
  empty: HTMLElement;
  status: HTMLElement;
  bar: HTMLElement;
  name: HTMLElement;
  hls: Hls | null;
  channel: Channel | null;
}

class Mosaic {
  private cells: Cell[] = [];
  private activeAudio = -1;
  private pickerTarget = -1;

  private picker: HTMLElement;
  private pickerSearch: HTMLInputElement;
  private pickerResults: HTMLElement;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(grid: HTMLElement) {
    this.picker = document.querySelector<HTMLElement>('[data-picker]')!;
    this.pickerSearch = this.picker.querySelector<HTMLInputElement>('[data-picker-search]')!;
    this.pickerResults = this.picker.querySelector<HTMLElement>('[data-picker-results]')!;

    grid.querySelectorAll<HTMLElement>('[data-cell]').forEach((root) => {
      const idx = parseInt(root.dataset.cell || '0', 10);
      const cell: Cell = {
        idx,
        root,
        video: root.querySelector<HTMLVideoElement>('[data-cell-video]')!,
        empty: root.querySelector<HTMLElement>('[data-cell-empty]')!,
        status: root.querySelector<HTMLElement>('[data-cell-status]')!,
        bar: root.querySelector<HTMLElement>('[data-cell-bar]')!,
        name: root.querySelector<HTMLElement>('[data-cell-name]')!,
        hls: null,
        channel: null,
      };
      this.cells[idx] = cell;
      this.wireCell(cell);
    });

    this.picker.querySelector<HTMLButtonElement>('[data-picker-close]')!
      .addEventListener('click', () => this.closePicker());
    this.picker.addEventListener('click', (e) => { if (e.target === this.picker) this.closePicker(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.picker.hidden) this.closePicker();
    });
    this.pickerSearch.addEventListener('input', () => {
      if (this.searchDebounce) clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => this.search(this.pickerSearch.value.trim()), 300);
    });

    this.restore();
  }

  private wireCell(cell: Cell) {
    cell.empty.querySelector<HTMLButtonElement>('[data-cell-add]')!
      .addEventListener('click', () => this.openPicker(cell.idx));
    cell.bar.querySelector<HTMLButtonElement>('[data-cell-change]')!
      .addEventListener('click', () => this.openPicker(cell.idx));
    cell.bar.querySelector<HTMLButtonElement>('[data-cell-remove]')!
      .addEventListener('click', () => this.removeCell(cell.idx));
    cell.bar.querySelector<HTMLButtonElement>('[data-cell-mute]')!
      .addEventListener('click', () => this.toggleAudio(cell.idx));
    cell.bar.querySelector<HTMLButtonElement>('[data-cell-fs]')!
      .addEventListener('click', () => this.fullscreen(cell));
    cell.video.addEventListener('click', () => { if (cell.channel) this.toggleAudio(cell.idx); });
    cell.video.addEventListener('playing', () => { cell.status.hidden = true; });
    cell.video.addEventListener('error', () => this.setStatus(cell, 'Unavailable — try another channel'));
  }

  // ---------- Picker ----------

  private openPicker(idx: number) {
    this.pickerTarget = idx;
    this.picker.hidden = false;
    document.body.style.overflow = 'hidden';
    this.pickerSearch.value = '';
    this.search('');
    setTimeout(() => this.pickerSearch.focus(), 50);
  }

  private closePicker() {
    this.picker.hidden = true;
    document.body.style.overflow = '';
    this.pickerTarget = -1;
  }

  private async search(q: string) {
    this.pickerResults.innerHTML = '<div class="picker-loading"><div class="spinner"></div></div>';
    const params = new URLSearchParams({ limit: '36' });
    if (q) params.set('q', q);
    try {
      const res = await fetch(`${API_CHANNELS}?${params.toString()}`);
      const data = await res.json();
      this.renderResults(data.items || []);
    } catch {
      this.pickerResults.innerHTML = '<p class="empty">Could not load channels.</p>';
    }
  }

  private renderResults(items: Channel[]) {
    if (items.length === 0) {
      this.pickerResults.innerHTML = '<p class="empty">No channels found.</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const c of items) {
      const card = document.createElement('div');
      card.className = 'station';
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      const initial = c.name.charAt(0).toUpperCase();
      const logo = c.logo
        ? `<img src="${escapeAttr(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fallback',textContent:'${initial}'}))" />`
        : `<span class="fallback">${initial}</span>`;
      const cat = (c.categories.split(',')[0] || '').trim();
      card.innerHTML = `
        <div class="station-logo">${logo}</div>
        <div class="station-meta">
          <p class="station-name">${escapeHtml(c.name)}</p>
          <span class="station-tag-row">${cat ? `<span class="station-tag">${escapeHtml(cat)}</span>` : ''}${c.flag ? `<span class="station-flag">${c.flag}</span>` : ''}</span>
        </div>`;
      const choose = () => this.selectChannel(c);
      card.addEventListener('click', choose);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
      frag.appendChild(card);
    }
    this.pickerResults.innerHTML = '';
    this.pickerResults.appendChild(frag);
  }

  private selectChannel(c: Channel) {
    if (this.pickerTarget < 0) return;
    this.setCell(this.pickerTarget, c);
    this.closePicker();
    this.persist();
  }

  // ---------- Cell playback ----------

  private setCell(idx: number, c: Channel, assignAudio = true) {
    const cell = this.cells[idx];
    cell.channel = c;
    cell.empty.hidden = true;
    cell.bar.hidden = false;
    cell.name.textContent = c.name;
    this.setStatus(cell, 'Loading…');
    this.loadCellStream(cell, c.url);
    // The first channel a user adds gets the audio; others stay muted.
    // On restore (no user gesture) we keep everything muted to satisfy autoplay rules.
    if (assignAudio && this.activeAudio < 0) this.setAudio(idx);
    else this.applyAudio();
  }

  private loadCellStream(cell: Cell, url: string) {
    if (cell.hls) { cell.hls.destroy(); cell.hls = null; }
    cell.video.removeAttribute('src');
    cell.video.muted = true; // always start muted; audio is assigned separately

    if (cell.video.canPlayType('application/vnd.apple.mpegurl')) {
      cell.video.src = url;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      cell.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(cell.video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else this.setStatus(cell, 'Unavailable — try another channel');
      });
    } else {
      cell.video.src = url;
    }
    void cell.video.play().catch(() => {});
  }

  private removeCell(idx: number) {
    const cell = this.cells[idx];
    if (cell.hls) { cell.hls.destroy(); cell.hls = null; }
    cell.video.pause();
    cell.video.removeAttribute('src');
    cell.video.load();
    cell.channel = null;
    cell.bar.hidden = true;
    cell.status.hidden = true;
    cell.empty.hidden = false;
    if (this.activeAudio === idx) this.activeAudio = -1;
    this.persist();
  }

  private setStatus(cell: Cell, msg: string) {
    cell.status.hidden = false;
    cell.status.textContent = msg;
  }

  // ---------- Audio routing (one cell at a time) ----------

  private toggleAudio(idx: number) {
    if (this.activeAudio === idx) this.setAudio(-1);
    else this.setAudio(idx);
  }

  private setAudio(idx: number) {
    this.activeAudio = idx;
    this.applyAudio();
  }

  private applyAudio() {
    for (const cell of this.cells) {
      if (!cell) continue;
      const isActive = cell.idx === this.activeAudio && !!cell.channel;
      cell.video.muted = !isActive;
      if (isActive && cell.video.paused) void cell.video.play().catch(() => {});
      cell.root.classList.toggle('audio-active', isActive);
    }
  }

  private fullscreen(cell: Cell) {
    const anyVideo = cell.video as any;
    try {
      if (cell.root.requestFullscreen) void cell.root.requestFullscreen();
      else if (typeof anyVideo.webkitEnterFullscreen === 'function') anyVideo.webkitEnterFullscreen();
    } catch { /* ignore */ }
  }

  // ---------- Persistence ----------

  private persist() {
    const ids = this.cells.map((c) => (c && c.channel ? c.channel.id : null));
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  }

  private async restore() {
    let ids: (string | null)[];
    try {
      ids = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    } catch {
      return;
    }
    if (!Array.isArray(ids)) return;
    for (let i = 0; i < Math.min(ids.length, CELL_COUNT); i++) {
      const id = ids[i];
      if (!id) continue;
      try {
        const res = await fetch(`${API_CHANNELS}?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.items && data.items[0]) this.setCell(i, data.items[0], false);
      } catch { /* ignore */ }
    }
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string) {
  return escapeHtml(s);
}

const grid = document.querySelector<HTMLElement>('[data-mosaic]');
if (grid) {
  try {
    new Mosaic(grid);
  } catch (err) {
    console.error('Mosaic failed to start', err);
  }
}
