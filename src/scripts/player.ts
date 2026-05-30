import Hls from 'hls.js';
import {
  type Channel,
  STORE_EVENT,
  addToHistory,
  getFavorites,
  getHistory,
  isFavorite,
  toggleFavorite,
} from './store';

const API_CHANNELS = '/api/channels';
const API_META = '/api/meta';
const STORAGE_KEY = 'wtv-last-channel';
const VOLUME_KEY = 'wtv-volume';
const VIEW_KEY = 'wtv-view';
const PAGE_LIMIT = 48;

type View = 'list' | 'grid';
type Mode = 'browse' | 'favorites' | 'history';
type PlayState = 'playing' | 'paused' | 'loading' | 'error';

interface Facet {
  id: string;
  name: string;
  count: number;
  flag?: string;
}

interface PageResult {
  items: Channel[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

class Player {
  private mode: Mode;
  private video: HTMLVideoElement;
  private hls: Hls | null = null;
  private usingNative = false;

  private items: Channel[] = [];
  private current: Channel | null = null;
  private state: PlayState = 'paused';

  // Pagination / query state (browse mode)
  private page = 1;
  private totalPages = 1;
  private total = 0;
  private q = '';
  private activeCategory = 'all';
  private activeCountry = 'all';
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  private pendingPlayId: string | null = null;

  // Local source for favorites/history
  private localAll: Channel[] = [];

  // HLS quality
  private levels: { height: number; bitrate: number }[] = [];

  // Refs
  private statusEl: HTMLElement;
  private stationsEl: HTMLElement;
  private searchEl: HTMLInputElement | null;
  private countEl: HTMLElement;
  private paginationEl: HTMLElement;
  private viewButtons: NodeListOf<HTMLButtonElement>;
  private view: View = 'grid';
  private cards = new Map<string, HTMLElement>();

  // Filter dropdowns (browse mode)
  private filterBar: HTMLElement | null = null;
  private categoryFacets: Facet[] = [];
  private countryFacets: Facet[] = [];
  private randomBtn: HTMLButtonElement | null = null;
  private resetBtn: HTMLButtonElement | null = null;

  // Stream load watchdog
  private loadTimer: ReturnType<typeof setTimeout> | null = null;

  // Sleep timer
  private sleepTimeout: ReturnType<typeof setTimeout> | null = null;
  private sleepEnd = 0;
  private sleepInterval: ReturnType<typeof setInterval> | null = null;

  // Mini bar
  private nowPlaying: HTMLElement;
  private npLogo: HTMLElement;
  private npName: HTMLElement;
  private npState: HTMLElement;
  private npToggle: HTMLButtonElement;
  private npExpand: HTMLButtonElement;
  private npPrev: HTMLButtonElement;
  private npNext: HTMLButtonElement;

  // Modal
  private modal: HTMLElement;
  private modalName: HTMLElement;
  private modalSub: HTMLElement;
  private modalState: HTMLElement;
  private modalTags: HTMLElement;
  private modalToggle: HTMLButtonElement;
  private modalPrev: HTMLButtonElement;
  private modalNext: HTMLButtonElement;
  private modalFullscreen: HTMLButtonElement;
  private modalPip: HTMLButtonElement | null;
  private modalCast: HTMLButtonElement | null;
  private modalVolume: HTMLInputElement;
  private modalClose: HTMLButtonElement;
  private modalFav: HTMLButtonElement;
  private tvLogo: HTMLElement;
  private tvOverlay: HTMLElement;
  private tvOverlayText: HTMLElement;
  private tvSpinner: HTMLElement | null;
  private tvRetry: HTMLButtonElement | null;
  private tvNext: HTMLButtonElement | null;
  private tvErrorActions: HTMLElement | null;
  private tvUnmute: HTMLButtonElement | null;
  private qualityToggle: HTMLButtonElement | null;
  private qualityLabel: HTMLElement | null;
  private qualityMenu: HTMLElement | null;

  constructor(root: HTMLElement) {
    this.mode = (root.dataset.mode as Mode) || 'browse';
    this.statusEl = root.querySelector<HTMLElement>('[data-status]')!;
    this.stationsEl = root.querySelector<HTMLElement>('[data-stations]')!;
    this.searchEl = root.querySelector<HTMLInputElement>('[data-search]');
    this.countEl = root.querySelector<HTMLElement>('[data-count]')!;
    this.paginationEl = root.querySelector<HTMLElement>('[data-pagination]')!;
    this.viewButtons = root.querySelectorAll<HTMLButtonElement>('.vt-btn');

    const savedView = localStorage.getItem(VIEW_KEY) as View | null;
    this.view = savedView === 'list' ? 'list' : 'grid';
    this.stationsEl.classList.add(`view-${this.view}`);
    this.viewButtons.forEach((b) => {
      b.classList.toggle('active', b.dataset.view === this.view);
      b.addEventListener('click', () => this.setView(b.dataset.view as View));
    });

    this.video = document.querySelector<HTMLVideoElement>('[data-video]')!;
    this.nowPlaying = document.querySelector<HTMLElement>('[data-now-playing]')!;
    this.npLogo = this.nowPlaying.querySelector<HTMLElement>('[data-np-logo]')!;
    this.npName = this.nowPlaying.querySelector<HTMLElement>('[data-np-name]')!;
    this.npState = this.nowPlaying.querySelector<HTMLElement>('[data-np-state]')!;
    this.npToggle = this.nowPlaying.querySelector<HTMLButtonElement>('[data-np-toggle]')!;
    this.npExpand = this.nowPlaying.querySelector<HTMLButtonElement>('[data-np-expand]')!;
    this.npPrev = this.nowPlaying.querySelector<HTMLButtonElement>('[data-np-prev]')!;
    this.npNext = this.nowPlaying.querySelector<HTMLButtonElement>('[data-np-next]')!;

    this.modal = document.querySelector<HTMLElement>('[data-modal]')!;
    this.modalName = this.modal.querySelector<HTMLElement>('[data-modal-name]')!;
    this.modalSub = this.modal.querySelector<HTMLElement>('[data-modal-sub]')!;
    this.modalState = this.modal.querySelector<HTMLElement>('[data-modal-state]')!;
    this.modalTags = this.modal.querySelector<HTMLElement>('[data-modal-tags]')!;
    this.modalToggle = this.modal.querySelector<HTMLButtonElement>('[data-modal-toggle]')!;
    this.modalPrev = this.modal.querySelector<HTMLButtonElement>('[data-modal-prev]')!;
    this.modalNext = this.modal.querySelector<HTMLButtonElement>('[data-modal-next]')!;
    this.modalFullscreen = this.modal.querySelector<HTMLButtonElement>('[data-modal-fullscreen]')!;
    this.modalPip = this.modal.querySelector<HTMLButtonElement>('[data-modal-pip]');
    this.modalCast = this.modal.querySelector<HTMLButtonElement>('[data-modal-cast]');
    this.modalVolume = this.modal.querySelector<HTMLInputElement>('[data-modal-volume]')!;
    this.modalClose = this.modal.querySelector<HTMLButtonElement>('[data-modal-close]')!;
    this.modalFav = this.modal.querySelector<HTMLButtonElement>('[data-modal-fav]')!;
    this.tvLogo = this.modal.querySelector<HTMLElement>('[data-tv-logo]')!;
    this.tvOverlay = this.modal.querySelector<HTMLElement>('[data-tv-overlay]')!;
    this.tvOverlayText = this.modal.querySelector<HTMLElement>('[data-tv-overlay-text]')!;
    this.tvSpinner = this.modal.querySelector<HTMLElement>('[data-tv-spinner]');
    this.tvRetry = this.modal.querySelector<HTMLButtonElement>('[data-tv-retry]');
    this.tvNext = this.modal.querySelector<HTMLButtonElement>('[data-tv-next]');
    this.tvErrorActions = this.modal.querySelector<HTMLElement>('[data-tv-error-actions]');
    this.tvUnmute = this.modal.querySelector<HTMLButtonElement>('[data-tv-unmute]');
    this.qualityToggle = this.modal.querySelector<HTMLButtonElement>('[data-quality-toggle]');
    this.qualityLabel = this.modal.querySelector<HTMLElement>('[data-quality-label]');
    this.qualityMenu = this.modal.querySelector<HTMLElement>('[data-quality-menu]');

    const savedVol = parseFloat(localStorage.getItem(VOLUME_KEY) || '0.9');
    this.video.volume = isNaN(savedVol) ? 0.9 : savedVol;
    this.modalVolume.value = String(this.video.volume);
    this.video.playsInline = true;

    this.video.addEventListener('playing', () => this.setState('playing'));
    this.video.addEventListener('pause', () => this.setState('paused'));
    this.video.addEventListener('waiting', () => this.setState('loading'));
    this.video.addEventListener('error', () => this.setState('error'));
    this.video.addEventListener('volumechange', () => {
      if (!this.video.muted && this.tvUnmute) this.tvUnmute.hidden = true;
    });

    this.npToggle.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    this.npPrev.addEventListener('click', (e) => { e.stopPropagation(); this.step(-1); });
    this.npNext.addEventListener('click', (e) => { e.stopPropagation(); this.step(1); });
    this.npExpand.addEventListener('click', (e) => { e.stopPropagation(); this.openModal(); });
    this.nowPlaying.addEventListener('click', (e) => {
      if (e.target === this.nowPlaying || (e.target as HTMLElement).closest('.np-info')) {
        this.openModal();
      }
    });
    this.modalToggle.addEventListener('click', () => this.toggle());
    this.modalPrev.addEventListener('click', () => this.step(-1));
    this.modalNext.addEventListener('click', () => this.step(1));
    this.modalFullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.modalClose.addEventListener('click', () => this.closeModal());
    this.modalFav.addEventListener('click', () => {
      if (this.current) toggleFavorite(this.current);
    });
    this.tvRetry?.addEventListener('click', () => this.retry());
    this.tvNext?.addEventListener('click', () => this.step(1));
    this.tvUnmute?.addEventListener('click', () => this.unmute());
    this.modalPip?.addEventListener('click', () => this.togglePip());
    this.modalCast?.addEventListener('click', () => this.castToDevice());
    this.qualityToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.qualityMenu) this.qualityMenu.hidden = !this.qualityMenu.hidden;
    });
    document.addEventListener('click', (e) => {
      if (this.qualityMenu && !this.qualityMenu.hidden && !(e.target as HTMLElement).closest('.quality-wrap')) {
        this.qualityMenu.hidden = true;
      }
    });

    const shareBtn = this.modal.querySelector<HTMLButtonElement>('[data-modal-share]');
    if (shareBtn) shareBtn.addEventListener('click', () => this.share());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('visible')) this.closeModal();
    });
    this.modalVolume.addEventListener('input', () => {
      const v = parseFloat(this.modalVolume.value);
      this.video.volume = v;
      this.video.muted = v === 0;
      localStorage.setItem(VOLUME_KEY, String(v));
    });

    if (this.searchEl) {
      this.searchEl.addEventListener('input', () => this.onSearchInput());
    }

    // Filter dropdowns + actions (browse mode)
    this.filterBar = document.querySelector<HTMLElement>('[data-filter-bar]');
    this.randomBtn = document.querySelector<HTMLButtonElement>('[data-random]');
    this.resetBtn = document.querySelector<HTMLButtonElement>('[data-filter-reset]');
    this.randomBtn?.addEventListener('click', () => this.playRandom());
    this.resetBtn?.addEventListener('click', () => this.resetFilters());
    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.filter-select')) this.closeAllFilterPanels();
    });

    // Sleep timer
    const sleepToggle = document.querySelector<HTMLButtonElement>('[data-sleep-toggle]');
    const sleepOptions = document.querySelector<HTMLElement>('[data-sleep-options]');
    if (sleepToggle && sleepOptions) {
      sleepToggle.addEventListener('click', () => { sleepOptions.hidden = !sleepOptions.hidden; });
      sleepOptions.querySelectorAll<HTMLButtonElement>('[data-sleep-min]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.setSleepTimer(parseInt(btn.dataset.sleepMin || '0', 10));
          sleepOptions.hidden = true;
        });
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === ' ' && !this.modal.classList.contains('visible')) { e.preventDefault(); this.toggle(); }
      if (e.key === 'ArrowLeft') this.step(-1);
      if (e.key === 'ArrowRight') this.step(1);
      if (e.key === 'm' || e.key === 'M') { this.video.muted = !this.video.muted; }
      if (e.key === 'f' || e.key === 'F') { if (this.current) this.toggleFullscreen(); }
    });

    document.addEventListener(STORE_EVENT, (e) => {
      const detail = (e as CustomEvent).detail as { kind: string };
      if (detail.kind === 'favorites') this.refreshFavStars();
      if (this.mode === 'favorites' && detail.kind === 'favorites') this.reloadLocal();
      if (this.mode === 'history' && detail.kind === 'history') this.reloadLocal();
    });

    this.detectCapabilities();
  }

  async init() {
    if (this.mode === 'browse') {
      this.applyInitialQuery();
      await this.loadMeta();
      await this.loadPage(1);
      if (this.pendingPlayId) {
        const id = this.pendingPlayId;
        this.pendingPlayId = null;
        await this.playById(id);
      }
    } else {
      this.reloadLocal();
    }
  }

  /** Read /?category=&country=&q=&play= from the URL so links deep-link into a filtered view. */
  private applyInitialQuery() {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category');
    const country = params.get('country');
    const q = params.get('q');
    const play = params.get('play');
    if (cat) this.activeCategory = cat;
    if (country) this.activeCountry = country.toUpperCase();
    if (q) {
      this.q = q.trim();
      if (this.searchEl) this.searchEl.value = this.q;
    }
    if (play) this.pendingPlayId = play;
  }

  // ---------- Browse mode (server pagination) ----------

  private async loadMeta() {
    try {
      const res = await fetch(API_META);
      if (res.ok) {
        const data = await res.json();
        this.categoryFacets = data.categories || [];
        this.countryFacets = data.countries || [];
      }
    } catch { /* ignore */ }
    if (this.filterBar) this.filterBar.style.display = '';
    this.setupFilterSelect('category');
    this.setupFilterSelect('country');
    this.updateResetVisibility();
  }

  private facetsFor(kind: 'category' | 'country'): Facet[] {
    return kind === 'category' ? this.categoryFacets : this.countryFacets;
  }
  private activeFor(kind: 'category' | 'country'): string {
    return kind === 'category' ? this.activeCategory : this.activeCountry;
  }
  private filterRoot(kind: 'category' | 'country'): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.filter-select[data-filter="${kind}"]`);
  }

  private setupFilterSelect(kind: 'category' | 'country') {
    const root = this.filterRoot(kind);
    if (!root) return;
    const trigger = root.querySelector<HTMLButtonElement>('[data-filter-trigger]')!;
    const panel = root.querySelector<HTMLElement>('[data-filter-panel]')!;
    const search = root.querySelector<HTMLInputElement>('[data-filter-search]')!;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = panel.hidden;
      this.closeAllFilterPanels();
      if (willOpen) {
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        search.value = '';
        this.renderFilterOptions(kind, '');
        setTimeout(() => search.focus(), 30);
      }
    });
    search.addEventListener('input', () => this.renderFilterOptions(kind, search.value.trim().toLowerCase()));
    search.addEventListener('click', (e) => e.stopPropagation());
    this.updateFilterLabel(kind);
  }

  private closeAllFilterPanels() {
    document.querySelectorAll<HTMLElement>('.filter-select [data-filter-panel]').forEach((p) => { p.hidden = true; });
    document.querySelectorAll<HTMLButtonElement>('.filter-select [data-filter-trigger]')
      .forEach((t) => t.setAttribute('aria-expanded', 'false'));
  }

  private renderFilterOptions(kind: 'category' | 'country', query: string) {
    const root = this.filterRoot(kind);
    if (!root) return;
    const options = root.querySelector<HTMLElement>('[data-filter-options]')!;
    const facets = this.facetsFor(kind);
    const active = this.activeFor(kind);
    const allLabel = kind === 'category' ? 'All categories' : 'All countries';
    const matches = query
      ? facets.filter((f) => f.name.toLowerCase().includes(query) || f.id.toLowerCase().includes(query))
      : facets;

    const opt = (value: string, label: string, count: number | null, isActive: boolean) =>
      `<button class="filter-opt${isActive ? ' active' : ''}" type="button" role="option" aria-selected="${isActive}" data-value="${escapeAttr(value)}">` +
      `<span class="filter-opt-label">${label}</span>` +
      `${count != null ? `<span class="filter-opt-count">${count.toLocaleString('en')}</span>` : ''}</button>`;

    let html = '';
    if (!query) html += opt('all', allLabel, null, active.toLowerCase() === 'all');
    html += matches
      .map((f) => {
        const flag = kind === 'country' && f.flag ? f.flag + ' ' : '';
        return opt(f.id, `${flag}${escapeHtml(f.name)}`, f.count, f.id.toLowerCase() === active.toLowerCase());
      })
      .join('');
    if (matches.length === 0 && query) html = '<p class="filter-empty">No matches</p>';
    options.innerHTML = html;
    options.querySelectorAll<HTMLButtonElement>('[data-value]').forEach((b) =>
      b.addEventListener('click', () => this.selectFilter(kind, b.dataset.value || 'all')),
    );
  }

  private selectFilter(kind: 'category' | 'country', value: string) {
    if (kind === 'category') this.activeCategory = value;
    else this.activeCountry = value;
    this.closeAllFilterPanels();
    this.updateFilterLabel(kind);
    this.updateResetVisibility();
    this.loadPage(1);
  }

  private updateFilterLabel(kind: 'category' | 'country') {
    const root = this.filterRoot(kind);
    if (!root) return;
    const label = root.querySelector<HTMLElement>('[data-filter-label]')!;
    const trigger = root.querySelector<HTMLButtonElement>('[data-filter-trigger]')!;
    const active = this.activeFor(kind);
    const allLabel = kind === 'category' ? 'All categories' : 'All countries';
    if (active.toLowerCase() === 'all') {
      label.textContent = allLabel;
      trigger.classList.remove('has-value');
      return;
    }
    const facet = this.facetsFor(kind).find((f) => f.id.toLowerCase() === active.toLowerCase());
    label.textContent = facet ? `${kind === 'country' && facet.flag ? facet.flag + ' ' : ''}${facet.name}` : active;
    trigger.classList.add('has-value');
  }

  private updateResetVisibility() {
    const any = this.activeCategory !== 'all' || this.activeCountry !== 'all' || !!this.q;
    if (this.resetBtn) this.resetBtn.hidden = !any;
  }

  private resetFilters() {
    this.activeCategory = 'all';
    this.activeCountry = 'all';
    this.q = '';
    if (this.searchEl) this.searchEl.value = '';
    this.updateFilterLabel('category');
    this.updateFilterLabel('country');
    this.updateResetVisibility();
    this.loadPage(1);
  }

  private async playRandom() {
    const params = new URLSearchParams({ random: '1' });
    if (this.q) params.set('q', this.q);
    if (this.activeCategory !== 'all') params.set('category', this.activeCategory);
    if (this.activeCountry !== 'all') params.set('country', this.activeCountry);
    try {
      const res = await fetch(`${API_CHANNELS}?${params.toString()}`);
      const data: PageResult = await res.json();
      if (data.items && data.items[0]) this.play(data.items[0]);
    } catch { /* ignore */ }
  }

  private onSearchInput() {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      if (this.mode === 'browse') {
        this.q = this.searchEl ? this.searchEl.value.trim() : '';
        this.updateResetVisibility();
        this.loadPage(1);
      } else {
        this.applyLocalFilter();
      }
    }, 300);
  }

  private async loadPage(page: number) {
    this.showLoading();
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    if (this.q) params.set('q', this.q);
    if (this.activeCategory !== 'all') params.set('category', this.activeCategory);
    if (this.activeCountry !== 'all') params.set('country', this.activeCountry);

    try {
      const res = await fetch(`${API_CHANNELS}?${params.toString()}`);
      if (!res.ok) throw new Error('API ' + res.status);
      const data: PageResult = await res.json();
      this.items = data.items;
      this.page = data.page;
      this.totalPages = data.totalPages;
      this.total = data.total;
      this.renderList();
      this.renderPagination();
      if (page > 1) window.scrollTo({ top: this.scrollAnchorTop(), behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      this.showError('We couldn’t load the channels.');
    }
  }

  private async playById(id: string) {
    try {
      const res = await fetch(`${API_CHANNELS}?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data: PageResult = await res.json();
      if (data.items && data.items[0]) this.play(data.items[0]);
    } catch { /* ignore */ }
  }

  private scrollAnchorTop(): number {
    const rect = this.stationsEl.getBoundingClientRect();
    return Math.max(0, window.scrollY + rect.top - 120);
  }

  // ---------- Favorites / history (local) ----------

  private reloadLocal() {
    this.localAll =
      this.mode === 'favorites'
        ? getFavorites()
        : getHistory().map((e) => e.channel);
    this.applyLocalFilter();
  }

  private applyLocalFilter() {
    const q = (this.searchEl?.value || '').trim().toLowerCase();
    this.items = q
      ? this.localAll.filter(
          (c) => c.name.toLowerCase().includes(q) || c.categories.toLowerCase().includes(q),
        )
      : this.localAll;
    this.total = this.items.length;
    this.totalPages = 1;
    this.page = 1;
    if (this.localAll.length === 0) {
      this.showEmpty();
      this.paginationEl.hidden = true;
      return;
    }
    this.renderList();
    this.paginationEl.hidden = true;
  }

  // ---------- Rendering ----------

  private showLoading() {
    this.statusEl.style.display = '';
    this.statusEl.innerHTML = '<div class="spinner"></div><p>Loading channels…</p>';
    const toolbar = document.querySelector<HTMLElement>('.player-toolbar');
    if (toolbar) toolbar.style.display = '';
  }

  private renderList() {
    this.statusEl.style.display = 'none';
    const toolbar = document.querySelector<HTMLElement>('.player-toolbar');
    if (toolbar) toolbar.style.display = '';

    this.stationsEl.innerHTML = '';
    this.cards.clear();
    this.updateCount();

    if (this.items.length === 0) {
      this.showEmpty();
      return;
    }

    const frag = document.createDocumentFragment();
    const lastId = localStorage.getItem(STORAGE_KEY);
    for (const c of this.items) {
      const card = this.makeCard(c);
      this.cards.set(c.id, card);
      frag.appendChild(card);
      if (c.id === lastId && !this.current) {
        this.current = c;
        this.showNowPlaying(c, 'paused');
      }
    }
    this.stationsEl.appendChild(frag);
    this.updateNavButtons();
    if (this.current && this.state === 'playing') this.updateActiveCard(this.current.id);
  }

  private renderPagination() {
    if (this.mode !== 'browse' || this.totalPages <= 1) {
      this.paginationEl.hidden = true;
      this.paginationEl.innerHTML = '';
      return;
    }
    this.paginationEl.hidden = false;
    const cur = this.page;
    const last = this.totalPages;
    const nums: (number | '…')[] = [];
    const push = (n: number) => { if (!nums.includes(n) && n >= 1 && n <= last) nums.push(n); };
    push(1);
    if (cur - 1 > 2) nums.push('…');
    for (let n = cur - 1; n <= cur + 1; n++) push(n);
    if (cur + 1 < last - 1) nums.push('…');
    push(last);

    const btn = (label: string, page: number | null, opts: { disabled?: boolean; active?: boolean } = {}) => {
      if (page === null) return `<span class="page-ellipsis">…</span>`;
      return `<button class="page-btn${opts.active ? ' active' : ''}" type="button" data-page="${page}"${opts.disabled ? ' disabled' : ''} aria-label="Page ${page}"${opts.active ? ' aria-current="page"' : ''}>${label}</button>`;
    };

    this.paginationEl.innerHTML =
      btn('‹ Prev', cur - 1, { disabled: cur <= 1 }) +
      nums.map((n) => (n === '…' ? btn('', null) : btn(String(n), n, { active: n === cur }))).join('') +
      btn('Next ›', cur + 1, { disabled: cur >= last });

    this.paginationEl.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((b) => {
      b.addEventListener('click', () => {
        const p = parseInt(b.dataset.page || '1', 10);
        if (p !== this.page) this.loadPage(p);
      });
    });
  }

  private updateCount() {
    if (this.mode === 'browse') {
      this.countEl.textContent = this.total > 0
        ? `${this.total.toLocaleString('en')} channels`
        : '';
    } else {
      const word = this.mode === 'favorites' ? 'favorites' : 'in history';
      this.countEl.textContent = `${this.items.length} ${word}`;
    }
  }

  private makeCard(c: Channel): HTMLElement {
    const card = document.createElement('div');
    card.className = 'station';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    const initial = c.name.charAt(0).toUpperCase();
    const logo = c.logo
      ? `<img src="${escapeAttr(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fallback',textContent:'${initial}'}))" />`
      : `<span class="fallback">${initial}</span>`;
    const fav = isFavorite(c.id);
    const cat = (c.categories.split(',')[0] || '').trim();
    const loc = c.flag ? `<span class="station-flag">${c.flag}</span>` : '';
    card.innerHTML = `
      <div class="station-logo">${logo}</div>
      <div class="station-meta">
        <p class="station-name">${escapeHtml(c.name)}</p>
        <span class="station-tag-row">${cat ? `<span class="station-tag">${escapeHtml(cat)}</span>` : ''}${loc}</span>
      </div>
      <button class="fav-btn ${fav ? 'active' : ''}" data-fav type="button" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${fav}">
        ${ICON_STAR}
      </button>
    `;
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-fav]')) return;
      this.play(c);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.play(c); }
    });
    card.querySelector<HTMLButtonElement>('[data-fav]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(c);
    });
    return card;
  }

  private setView(view: View) {
    if ((view !== 'list' && view !== 'grid') || view === this.view) return;
    this.view = view;
    localStorage.setItem(VIEW_KEY, view);
    this.stationsEl.classList.remove('view-list', 'view-grid');
    this.stationsEl.classList.add(`view-${view}`);
    this.viewButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  }

  private showEmpty() {
    const msg =
      this.mode === 'favorites'
        ? 'No favorite channels yet.<br>Tap the star on a channel to save it here.'
        : this.mode === 'history'
          ? 'Your history is empty.<br>Start watching to see channels here.'
          : 'No channels match your filters.';
    this.statusEl.style.display = '';
    this.statusEl.innerHTML = `<p class="empty">${msg}</p>${this.mode !== 'browse' ? '<a class="cta cta-secondary" href="/">Browse all channels</a>' : ''}`;
    this.stationsEl.innerHTML = '';
    this.cards.clear();
  }

  private showError(msg: string) {
    this.statusEl.style.display = '';
    this.statusEl.innerHTML = `<p>${escapeHtml(msg)}<br>Please try again or check your connection.</p>`;
    this.paginationEl.hidden = true;
  }

  // ---------- Playback ----------

  private destroyHls() {
    if (this.hls) { this.hls.destroy(); this.hls = null; }
  }

  // If a stream never produces a frame, surface an error instead of spinning forever.
  private startLoadWatchdog() {
    this.clearLoadWatchdog();
    this.loadTimer = setTimeout(() => {
      if (this.state === 'loading') this.setState('error');
    }, 14_000);
  }
  private clearLoadWatchdog() {
    if (this.loadTimer) { clearTimeout(this.loadTimer); this.loadTimer = null; }
  }

  private loadStream(url: string) {
    this.destroyHls();
    this.video.removeAttribute('src');
    this.resetQuality();
    this.startLoadWatchdog();
    this.video.muted = false;
    if (this.tvUnmute) this.tvUnmute.hidden = true;

    const canNative = this.video.canPlayType('application/vnd.apple.mpegurl');
    if (canNative) {
      this.usingNative = true;
      this.video.src = url;
    } else if (Hls.isSupported()) {
      this.usingNative = false;
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      this.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(this.video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => this.buildQualityMenu());
      hls.on(Hls.Events.LEVEL_SWITCHED, () => this.updateQualityLabel());
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          this.setState('error');
        }
      });
    } else {
      this.usingNative = true;
      this.video.src = url;
    }
    this.attemptPlay();
    this.updateCastButton();
  }

  /** Try to play with sound; if autoplay-with-sound is blocked, fall back to muted + show an unmute affordance. */
  private attemptPlay() {
    const p = this.video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        this.video.muted = true;
        this.video.play()
          .then(() => { if (this.tvUnmute) this.tvUnmute.hidden = false; })
          .catch(() => this.setState('error'));
      });
    }
  }

  private retry() {
    if (this.current) this.loadStream(this.current.url);
  }

  private unmute() {
    this.video.muted = false;
    if (this.video.volume === 0) {
      this.video.volume = 0.9;
      this.modalVolume.value = '0.9';
    }
    if (this.tvUnmute) this.tvUnmute.hidden = true;
    void this.video.play().catch(() => {});
  }

  private play(c: Channel) {
    if (this.current?.id === c.id && !this.video.paused) {
      this.video.pause();
      return;
    }
    this.current = c;
    this.showNowPlaying(c, 'loading');
    this.openModal();
    this.loadStream(c.url);
    this.updateActiveCard(c.id);
    localStorage.setItem(STORAGE_KEY, c.id);
    addToHistory(c);
    this.updateNavButtons();
  }

  private toggle() {
    if (!this.current) return;
    if (this.video.paused) {
      if (!this.video.currentSrc && !this.hls) { this.loadStream(this.current.url); return; }
      void this.video.play().catch(() => this.setState('error'));
    } else {
      this.video.pause();
    }
  }

  private step(delta: number) {
    if (this.items.length < 2) return;
    let idx = this.current ? this.items.findIndex((c) => c.id === this.current!.id) : -1;
    if (idx < 0) idx = 0;
    const len = this.items.length;
    this.play(this.items[(idx + delta + len) % len]);
  }

  private updateNavButtons() {
    const enabled = this.items.length > 1;
    this.npPrev.disabled = !enabled;
    this.npNext.disabled = !enabled;
    this.modalPrev.disabled = !enabled;
    this.modalNext.disabled = !enabled;
  }

  // ---------- Quality (HLS) ----------

  private resetQuality() {
    this.levels = [];
    if (this.qualityToggle) this.qualityToggle.hidden = true;
    if (this.qualityMenu) { this.qualityMenu.hidden = true; this.qualityMenu.innerHTML = ''; }
    if (this.qualityLabel) this.qualityLabel.textContent = 'Auto';
  }

  private buildQualityMenu() {
    if (!this.hls || !this.qualityToggle || !this.qualityMenu) return;
    this.levels = this.hls.levels.map((l) => ({ height: l.height, bitrate: l.bitrate }));
    if (this.levels.length < 2) { this.qualityToggle.hidden = true; return; }
    this.qualityToggle.hidden = false;

    const opt = (label: string, level: number, active: boolean) =>
      `<button class="quality-opt${active ? ' active' : ''}" type="button" data-level="${level}">${label}</button>`;

    const items = this.levels
      .map((l, i) => ({ i, h: l.height }))
      .sort((a, b) => b.h - a.h)
      .map(({ i, h }) => opt(h ? `${h}p` : `Level ${i + 1}`, i, this.hls!.currentLevel === i));

    this.qualityMenu.innerHTML = opt('Auto', -1, this.hls.autoLevelEnabled) + items.join('');
    this.qualityMenu.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => {
      b.addEventListener('click', () => {
        const level = parseInt(b.dataset.level || '-1', 10);
        if (this.hls) this.hls.currentLevel = level;
        this.qualityMenu!.hidden = true;
        this.qualityMenu!.querySelectorAll('.quality-opt').forEach((o) =>
          o.classList.toggle('active', (o as HTMLElement).dataset.level === String(level)),
        );
        this.updateQualityLabel();
      });
    });
    this.updateQualityLabel();
  }

  private updateQualityLabel() {
    if (!this.hls || !this.qualityLabel) return;
    if (this.hls.autoLevelEnabled || this.hls.currentLevel < 0) {
      this.qualityLabel.textContent = 'Auto';
    } else {
      const lvl = this.hls.levels[this.hls.currentLevel];
      this.qualityLabel.textContent = lvl?.height ? `${lvl.height}p` : 'Auto';
    }
  }

  // ---------- Capabilities: PiP, Cast/AirPlay ----------

  private detectCapabilities() {
    const pipOk =
      (document as any).pictureInPictureEnabled === true ||
      typeof (this.video as any).webkitSetPresentationMode === 'function';
    if (this.modalPip) this.modalPip.hidden = !pipOk;
    this.updateCastButton();
  }

  private hasAirPlay(): boolean {
    return typeof (this.video as any).webkitShowPlaybackTargetPicker === 'function';
  }

  private updateCastButton() {
    if (!this.modalCast) return;
    const remoteOk = 'remote' in this.video && this.usingNative;
    this.modalCast.hidden = !(this.hasAirPlay() || remoteOk);
  }

  private async togglePip() {
    try {
      const anyVideo = this.video as any;
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      } else if (typeof this.video.requestPictureInPicture === 'function') {
        await this.video.requestPictureInPicture();
      } else if (typeof anyVideo.webkitSetPresentationMode === 'function') {
        anyVideo.webkitSetPresentationMode(
          anyVideo.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture',
        );
      }
    } catch { /* ignore */ }
  }

  private castToDevice() {
    const anyVideo = this.video as any;
    if (this.hasAirPlay()) {
      anyVideo.webkitShowPlaybackTargetPicker();
    } else if ('remote' in this.video && (this.video as any).remote?.prompt) {
      (this.video as any).remote.prompt().catch(() => {});
    }
  }

  private async toggleFullscreen() {
    const screen = this.modal.querySelector<HTMLElement>('.tv-screen') || this.video;
    const anyVideo = this.video as any;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (screen.requestFullscreen) await screen.requestFullscreen();
      else if (typeof anyVideo.webkitEnterFullscreen === 'function') anyVideo.webkitEnterFullscreen();
    } catch { /* ignore */ }
  }

  private openModal() {
    if (!this.current) return;
    this.modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  private closeModal() {
    this.modal.classList.remove('visible');
    document.body.style.overflow = '';
  }

  private showNowPlaying(c: Channel, state: PlayState) {
    this.nowPlaying.classList.add('visible');
    const initial = c.name.charAt(0).toUpperCase();
    const logoHtml = c.logo
      ? `<img src="${escapeAttr(c.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fallback',textContent:'${initial}'}))" />`
      : `<span class="fallback">${initial}</span>`;
    this.npLogo.innerHTML = logoHtml;
    this.npName.textContent = c.name;
    this.tvLogo.innerHTML = c.logo ? '' : `<span class="fallback">${initial}</span>`;
    this.modalName.textContent = c.name;
    const sub = [c.flag ? `${c.flag} ${c.country}` : c.country, c.network].filter(Boolean).join(' · ');
    this.modalSub.textContent = sub;
    this.renderTags(c);
    this.refreshFavStars();
    this.setState(state);
  }

  private renderTags(c: Channel) {
    const tags = c.categories.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4);
    this.modalTags.innerHTML = tags
      .map((t) => `<span class="tag-chip">${escapeHtml(t.toUpperCase())}</span>`)
      .join('');
  }

  private async share() {
    if (!this.current) return;
    const text = `Watching ${this.current.name} on World TV Channels`;
    const url = `${window.location.origin}/?play=${encodeURIComponent(this.current.id)}`;
    const label = this.modal.querySelector<HTMLElement>('[data-share-label]');
    if (navigator.share) {
      try { await navigator.share({ title: text, url }); } catch { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        if (label) { label.textContent = 'Link copied!'; setTimeout(() => { label.textContent = 'Share'; }, 2000); }
      } catch { /* ignore */ }
    }
  }

  private refreshFavStars() {
    for (const [id, el] of this.cards) {
      const fav = isFavorite(id);
      const btn = el.querySelector<HTMLButtonElement>('[data-fav]');
      if (btn) {
        btn.classList.toggle('active', fav);
        btn.setAttribute('aria-pressed', String(fav));
        btn.setAttribute('aria-label', fav ? 'Remove from favorites' : 'Add to favorites');
      }
    }
    if (this.current) {
      const fav = isFavorite(this.current.id);
      this.modalFav.classList.toggle('active', fav);
      this.modalFav.setAttribute('aria-pressed', String(fav));
      this.modalFav.setAttribute('aria-label', fav ? 'Remove from favorites' : 'Add to favorites');
    }
  }

  private setState(state: PlayState) {
    this.state = state;
    if (state !== 'loading') this.clearLoadWatchdog();
    const label =
      state === 'playing' ? 'LIVE'
      : state === 'loading' ? 'Loading…'
      : state === 'error' ? 'Stream unavailable'
      : 'Paused';
    this.npState.innerHTML = `<span class="dot ${state}"></span>${label}`;
    this.modalState.innerHTML = `<span class="dot ${state}"></span>${label}`;
    const icon = state === 'playing' ? ICON_PAUSE : ICON_PLAY;
    this.npToggle.innerHTML = icon;
    this.modalToggle.innerHTML = icon;
    const ariaLabel = state === 'playing' ? 'Pause' : 'Play';
    this.npToggle.setAttribute('aria-label', ariaLabel);
    this.modalToggle.setAttribute('aria-label', ariaLabel);

    // TV screen overlay (spinner while loading, retry/next on error)
    this.modal.dataset.state = state;
    if (this.tvSpinner) this.tvSpinner.style.display = state === 'loading' ? '' : 'none';
    if (this.tvErrorActions) this.tvErrorActions.hidden = state !== 'error';
    if (this.tvNext) this.tvNext.hidden = this.items.length < 2;
    if (state === 'loading') {
      this.tvOverlay.style.display = '';
      this.tvOverlayText.textContent = '';
    } else if (state === 'error') {
      this.tvOverlay.style.display = '';
      this.tvOverlayText.textContent = 'This stream is currently unavailable. It may be offline or geo-blocked.';
    } else {
      this.tvOverlay.style.display = 'none';
    }

    if (this.current) {
      this.updateActiveCard(!this.video.paused ? this.current.id : null);
    }
  }

  private updateActiveCard(activeId: string | null) {
    for (const [id, el] of this.cards) {
      el.classList.toggle('active', id === activeId);
    }
  }

  private setSleepTimer(minutes: number) {
    if (this.sleepTimeout) clearTimeout(this.sleepTimeout);
    if (this.sleepInterval) clearInterval(this.sleepInterval);
    this.sleepTimeout = null;
    this.sleepInterval = null;
    this.sleepEnd = 0;
    const label = document.querySelector<HTMLElement>('[data-sleep-label]');
    if (minutes <= 0) {
      if (label) label.textContent = 'Sleep timer';
      return;
    }
    this.sleepEnd = Date.now() + minutes * 60_000;
    this.sleepTimeout = setTimeout(() => { this.video.pause(); this.setSleepTimer(0); }, minutes * 60_000);
    this.sleepInterval = setInterval(() => {
      const left = Math.max(0, Math.ceil((this.sleepEnd - Date.now()) / 60_000));
      if (label) label.textContent = `${left} min left`;
    }, 10_000);
    if (label) label.textContent = `${minutes} min left`;
  }
}

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.3l-5.4 3.2 1.4-6.1L3 10.4l6.2-.5L12 4l2.8 5.9 6.2.5-5 4 1.4 6.1z"/></svg>';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string) {
  return escapeHtml(s);
}

const root = document.querySelector<HTMLElement>('[data-player]');
if (root) {
  try {
    const p = new Player(root);
    void p.init();
  } catch (err) {
    console.error('Player failed to start', err);
  }
}
