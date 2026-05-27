import {
  type Station,
  STORE_EVENT,
  addToHistory,
  getFavorites,
  getHistory,
  isFavorite,
  toggleFavorite,
} from './store';

const API_STATIONS = '/api/stations';
const API_VOTE = '/api/vote';
const STORAGE_KEY = 'br-last-station';
const VOLUME_KEY = 'br-volume';
const VIEW_KEY = 'br-view';
const BATCH_SIZE = 24;

type View = 'list' | 'grid';
type Mode = 'browse' | 'favorites' | 'history';
type PlayState = 'playing' | 'paused' | 'loading' | 'error';

class Player {
  private mode: Mode;
  private audio = new Audio();
  private all: Station[] = [];
  private filtered: Station[] = [];
  private rendered = 0;
  private current: Station | null = null;
  private state: PlayState = 'paused';

  // Player section refs
  private statusEl: HTMLElement;
  private stationsEl: HTMLElement;
  private searchEl: HTMLInputElement | null;
  private countEl: HTMLElement;
  private sentinelEl: HTMLElement;
  private viewButtons: NodeListOf<HTMLButtonElement>;
  private view: View = 'list';
  private stationCards = new Map<string, HTMLElement>();
  private observer: IntersectionObserver | null = null;

  // Mini bar refs
  private nowPlaying: HTMLElement;
  private npLogo: HTMLElement;
  private npName: HTMLElement;
  private npState: HTMLElement;
  private npToggle: HTMLButtonElement;
  private npExpand: HTMLButtonElement;
  private npPrev: HTMLButtonElement;
  private npNext: HTMLButtonElement;

  // Modal refs
  private modal: HTMLElement;
  private modalLogo: HTMLElement;
  private modalName: HTMLElement;
  private modalLang: HTMLElement;
  private modalState: HTMLElement;
  private modalTags: HTMLElement;
  private modalToggle: HTMLButtonElement;
  private modalPrev: HTMLButtonElement;
  private modalNext: HTMLButtonElement;
  private modalVolume: HTMLInputElement;
  private modalClose: HTMLButtonElement;
  private modalFav: HTMLButtonElement;
  private modalVu: HTMLElement;
  private modalVote: HTMLButtonElement;
  private modalVoteLabel: HTMLElement;
  private modalVoteCount: HTMLElement;

  constructor(root: HTMLElement) {
    this.mode = (root.dataset.mode as Mode) || 'browse';
    this.statusEl = root.querySelector<HTMLElement>('[data-status]')!;
    this.stationsEl = root.querySelector<HTMLElement>('[data-stations]')!;
    this.searchEl = root.querySelector<HTMLInputElement>('[data-search]');
    this.countEl = root.querySelector<HTMLElement>('[data-count]')!;
    this.sentinelEl = root.querySelector<HTMLElement>('[data-sentinel]')!;
    this.viewButtons = root.querySelectorAll<HTMLButtonElement>('.vt-btn');

    const savedView = localStorage.getItem(VIEW_KEY) as View | null;
    this.view = savedView === 'grid' ? 'grid' : 'list';
    this.stationsEl.classList.add(`view-${this.view}`);
    this.viewButtons.forEach((b) => {
      b.classList.toggle('active', b.dataset.view === this.view);
      b.addEventListener('click', () => this.setView(b.dataset.view as View));
    });

    this.nowPlaying = document.querySelector<HTMLElement>('[data-now-playing]')!;
    this.npLogo = this.nowPlaying.querySelector<HTMLElement>('[data-np-logo]')!;
    this.npName = this.nowPlaying.querySelector<HTMLElement>('[data-np-name]')!;
    this.npState = this.nowPlaying.querySelector<HTMLElement>('[data-np-state]')!;
    this.npToggle = this.nowPlaying.querySelector<HTMLButtonElement>('[data-np-toggle]')!;
    this.npExpand = this.nowPlaying.querySelector<HTMLButtonElement>('[data-np-expand]')!;
    this.npPrev = this.nowPlaying.querySelector<HTMLButtonElement>('[data-np-prev]')!;
    this.npNext = this.nowPlaying.querySelector<HTMLButtonElement>('[data-np-next]')!;

    this.modal = document.querySelector<HTMLElement>('[data-modal]')!;
    this.modalLogo = this.modal.querySelector<HTMLElement>('[data-modal-logo]')!;
    this.modalName = this.modal.querySelector<HTMLElement>('[data-modal-name]')!;
    this.modalLang = this.modal.querySelector<HTMLElement>('[data-modal-lang]')!;
    this.modalState = this.modal.querySelector<HTMLElement>('[data-modal-state]')!;
    this.modalTags = this.modal.querySelector<HTMLElement>('[data-modal-tags]')!;
    this.modalToggle = this.modal.querySelector<HTMLButtonElement>('[data-modal-toggle]')!;
    this.modalPrev = this.modal.querySelector<HTMLButtonElement>('[data-modal-prev]')!;
    this.modalNext = this.modal.querySelector<HTMLButtonElement>('[data-modal-next]')!;
    this.modalVolume = this.modal.querySelector<HTMLInputElement>('[data-modal-volume]')!;
    this.modalClose = this.modal.querySelector<HTMLButtonElement>('[data-modal-close]')!;
    this.modalFav = this.modal.querySelector<HTMLButtonElement>('[data-modal-fav]')!;
    this.modalVu = this.modal.querySelector<HTMLElement>('[data-modal-vu]')!;
    this.modalVote = document.querySelector<HTMLButtonElement>('[data-modal-vote]')!;
    this.modalVoteLabel = document.querySelector<HTMLElement>('[data-vote-label]')!;
    this.modalVoteCount = document.querySelector<HTMLElement>('[data-vote-count]')!;

    this.audio.preload = 'none';
    const savedVol = parseFloat(localStorage.getItem(VOLUME_KEY) || '0.8');
    this.audio.volume = isNaN(savedVol) ? 0.8 : savedVol;
    this.modalVolume.value = String(this.audio.volume);

    this.audio.addEventListener('playing', () => this.setState('playing'));
    this.audio.addEventListener('pause', () => this.setState('paused'));
    this.audio.addEventListener('waiting', () => this.setState('loading'));
    this.audio.addEventListener('error', () => this.setState('error'));

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
    this.modalClose.addEventListener('click', () => this.closeModal());
    this.modalFav.addEventListener('click', () => {
      if (!this.current) return;
      toggleFavorite(this.current);
    });
    this.modalVote.addEventListener('click', () => this.vote());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('visible')) this.closeModal();
    });
    this.modalVolume.addEventListener('input', () => {
      const v = parseFloat(this.modalVolume.value);
      this.audio.volume = v;
      localStorage.setItem(VOLUME_KEY, String(v));
    });

    if (this.searchEl) this.searchEl.addEventListener('input', () => this.applyFilter());

    document.addEventListener(STORE_EVENT, (e) => {
      const detail = (e as CustomEvent).detail as { kind: string };
      if (detail.kind === 'favorites') this.refreshFavStars();
      if (this.mode === 'favorites' && detail.kind === 'favorites') this.reloadFromStore();
      if (this.mode === 'history' && detail.kind === 'history') this.reloadFromStore();
    });
  }

  async init() {
    try {
      if (this.mode === 'browse') {
        const res = await fetch(API_STATIONS);
        if (!res.ok) throw new Error('API ' + res.status);
        this.all = await res.json();
      } else if (this.mode === 'favorites') {
        this.all = getFavorites();
      } else if (this.mode === 'history') {
        this.all = getHistory().map((e) => e.station);
      }

      if (this.all.length === 0) {
        this.showEmpty();
        return;
      }
      this.statusEl.style.display = 'none';
      const toolbar = document.querySelector<HTMLElement>('.player-toolbar');
      if (toolbar) toolbar.style.display = '';
      this.applyFilter();
      this.setupInfiniteScroll();
    } catch (err) {
      console.error(err);
      this.showError('Не успяхме да заредим станциите.');
    }
  }

  /** Re-source the in-memory list from localStorage and re-render. */
  private reloadFromStore() {
    if (this.mode === 'favorites') this.all = getFavorites();
    else if (this.mode === 'history') this.all = getHistory().map((e) => e.station);
    if (this.all.length === 0) {
      this.showEmpty();
      const toolbar = document.querySelector<HTMLElement>('.player-toolbar');
      if (toolbar) toolbar.style.display = 'none';
      this.stationsEl.innerHTML = '';
      this.stationCards.clear();
      this.sentinelEl.style.display = 'none';
      return;
    }
    this.statusEl.style.display = 'none';
    const toolbar = document.querySelector<HTMLElement>('.player-toolbar');
    if (toolbar) toolbar.style.display = '';
    this.applyFilter();
  }

  private applyFilter() {
    const q = this.searchEl ? this.searchEl.value.trim().toLowerCase() : '';
    this.filtered = q
      ? this.all.filter((s) =>
          s.name.toLowerCase().includes(q) || s.tags.toLowerCase().includes(q)
        )
      : this.all;
    this.rendered = 0;
    this.stationsEl.innerHTML = '';
    this.stationCards.clear();
    this.updateCount();
    this.renderNextBatch();
    this.updateNavButtons();
  }

  private updateCount() {
    const total = this.all.length;
    const shown = this.filtered.length;
    const word = this.mode === 'favorites' ? 'любими' : this.mode === 'history' ? 'в дневника' : 'станции';
    this.countEl.textContent =
      shown === total ? `${total} ${word}` : `${shown} от ${total} ${word}`;
  }

  private renderNextBatch() {
    const next = this.filtered.slice(this.rendered, this.rendered + BATCH_SIZE);
    const frag = document.createDocumentFragment();
    const lastId = localStorage.getItem(STORAGE_KEY);
    for (const s of next) {
      const card = this.makeStationCard(s);
      this.stationCards.set(s.stationuuid, card);
      frag.appendChild(card);
      if (s.stationuuid === lastId && !this.current) {
        this.current = s;
        this.showNowPlaying(s, 'paused');
      }
    }
    this.stationsEl.appendChild(frag);
    this.rendered += next.length;
    this.sentinelEl.style.display = this.rendered < this.filtered.length ? '' : 'none';
    if (this.current && this.state === 'playing') {
      this.updateActiveCard(this.current.stationuuid);
    }
  }

  private setupInfiniteScroll() {
    if (this.observer) this.observer.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && this.rendered < this.filtered.length) {
            this.renderNextBatch();
          }
        }
      },
      { rootMargin: '400px 0px' }
    );
    this.observer.observe(this.sentinelEl);
  }

  private makeStationCard(s: Station): HTMLElement {
    const card = document.createElement('div');
    card.className = 'station';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    const tag = (s.tags.split(',')[0] || s.codec || '').trim();
    const initial = s.name.charAt(0).toUpperCase();
    const logo = s.favicon
      ? `<img src="${escapeAttr(s.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fallback',textContent:'${initial}'}))" />`
      : `<span class="fallback">${initial}</span>`;
    const fav = isFavorite(s.stationuuid);
    const votes = s.votes > 0 ? `<span class="station-votes" title="${s.votes} гласа">★ ${s.votes}</span>` : '';
    card.innerHTML = `
      <div class="station-logo">${logo}</div>
      <div class="station-meta">
        <p class="station-name">${escapeHtml(s.name)}</p>
        <span class="station-tag-row">${tag ? `<span class="station-tag">${escapeHtml(tag)}</span>` : ''}${votes}</span>
      </div>
      <button class="fav-btn ${fav ? 'active' : ''}" data-fav type="button" aria-label="${fav ? 'Премахни от любими' : 'Добави в любими'}" aria-pressed="${fav}">
        ${ICON_STAR}
      </button>
    `;
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-fav]')) return;
      this.play(s);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.play(s);
      }
    });
    const favBtn = card.querySelector<HTMLButtonElement>('[data-fav]')!;
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(s);
    });
    return card;
  }

  private setView(view: View) {
    if (view !== 'list' && view !== 'grid') return;
    if (view === this.view) return;
    this.view = view;
    localStorage.setItem(VIEW_KEY, view);
    this.stationsEl.classList.remove('view-list', 'view-grid');
    this.stationsEl.classList.add(`view-${view}`);
    this.viewButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  }

  private showEmpty() {
    const msg =
      this.mode === 'favorites'
        ? 'Все още нямате любими станции.<br>Натиснете звездичка до станция, за да я запазите.'
        : this.mode === 'history'
          ? 'Дневникът е празен.<br>Започнете да слушате, за да видите станциите тук.'
          : 'Няма налични станции.';
    this.statusEl.style.display = '';
    this.statusEl.innerHTML = `<p class="empty">${msg}</p>${this.mode !== 'browse' ? '<a class="cta cta-secondary" href="/">Виж всички станции</a>' : ''}`;
  }

  private showError(msg: string) {
    this.statusEl.innerHTML = `<p>${escapeHtml(msg)}<br>Опитайте отново или проверете интернет връзката си.</p>`;
  }

  private play(s: Station) {
    if (this.current?.stationuuid === s.stationuuid && !this.audio.paused) {
      this.audio.pause();
      return;
    }
    this.current = s;
    this.audio.src = s.url_resolved;
    void this.audio.play().catch(() => this.setState('error'));
    this.showNowPlaying(s, 'loading');
    this.updateActiveCard(s.stationuuid);
    localStorage.setItem(STORAGE_KEY, s.stationuuid);
    addToHistory(s);
    this.updateNavButtons();
  }

  private toggle() {
    if (!this.current) return;
    if (this.audio.paused) {
      if (!this.audio.src) this.audio.src = this.current.url_resolved;
      void this.audio.play().catch(() => this.setState('error'));
    } else {
      this.audio.pause();
    }
  }

  /** Move to prev/next station within current filtered list, with wrap-around. */
  private step(delta: number) {
    if (this.filtered.length < 2) return;
    let idx = this.current
      ? this.filtered.findIndex((s) => s.stationuuid === this.current!.stationuuid)
      : -1;
    if (idx < 0) idx = 0;
    const len = this.filtered.length;
    const next = (idx + delta + len) % len;
    this.play(this.filtered[next]);
  }

  private updateNavButtons() {
    const enabled = this.filtered.length > 1;
    this.npPrev.disabled = !enabled;
    this.npNext.disabled = !enabled;
    this.modalPrev.disabled = !enabled;
    this.modalNext.disabled = !enabled;
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

  private showNowPlaying(s: Station, state: PlayState) {
    this.nowPlaying.classList.add('visible');
    const initial = s.name.charAt(0).toUpperCase();
    const logoHtml = s.favicon
      ? `<img src="${escapeAttr(s.favicon)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fallback',textContent:'${initial}'}))" />`
      : `<span class="fallback">${initial}</span>`;
    this.npLogo.innerHTML = logoHtml;
    this.npName.textContent = s.name;
    this.modalLogo.innerHTML = logoHtml;
    this.modalName.textContent = s.name;
    this.modalLang.textContent = s.language || s.country || '';
    this.renderTags(s);
    this.refreshFavStars();
    this.updateVoteDisplay(s);
    this.setState(state);
  }

  private renderTags(s: Station) {
    const tags = (s.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 3);
    this.modalTags.innerHTML = tags
      .map((t) => `<span class="tag-chip">${escapeHtml(t.toUpperCase())}</span>`)
      .join('');
  }

  private updateVoteDisplay(s: Station) {
    this.modalVoteCount.textContent = s.votes > 0 ? `★ ${s.votes}` : '';
    this.modalVoteLabel.textContent = 'Гласувай';
    this.modalVote.disabled = false;
  }

  private async vote() {
    if (!this.current) return;
    this.modalVote.disabled = true;
    this.modalVoteLabel.textContent = '...';
    try {
      const res = await fetch(API_VOTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: this.current.stationuuid }),
      });
      const data = await res.json();
      if (data.ok === true) {
        this.current.votes = (this.current.votes || 0) + 1;
        this.modalVoteCount.textContent = `★ ${this.current.votes}`;
        this.modalVoteLabel.textContent = 'Благодаря!';
      } else {
        this.modalVoteLabel.textContent = data.message || 'Вече сте гласували';
      }
    } catch {
      this.modalVoteLabel.textContent = 'Грешка';
    }
    setTimeout(() => {
      this.modalVoteLabel.textContent = 'Гласувай';
      this.modalVote.disabled = false;
    }, 3000);
  }

  /** Sync star states on all rendered cards + modal star to localStorage truth. */
  private refreshFavStars() {
    for (const [id, el] of this.stationCards) {
      const fav = isFavorite(id);
      const btn = el.querySelector<HTMLButtonElement>('[data-fav]');
      if (btn) {
        btn.classList.toggle('active', fav);
        btn.setAttribute('aria-pressed', String(fav));
        btn.setAttribute('aria-label', fav ? 'Премахни от любими' : 'Добави в любими');
      }
    }
    if (this.current) {
      const fav = isFavorite(this.current.stationuuid);
      this.modalFav.classList.toggle('active', fav);
      this.modalFav.setAttribute('aria-pressed', String(fav));
      this.modalFav.setAttribute('aria-label', fav ? 'Премахни от любими' : 'Добави в любими');
    }
  }

  private setState(state: PlayState) {
    this.state = state;
    const label =
      state === 'playing'
        ? 'В ЕФИР'
        : state === 'loading'
          ? 'Зареждане…'
          : state === 'error'
            ? 'Грешка'
            : 'ПАУЗА';
    this.npState.innerHTML = `<span class="dot ${state}"></span>${label}`;
    this.modalState.innerHTML = `<span class="dot ${state}"></span>${label}`;
    const icon = state === 'playing' ? ICON_PAUSE : ICON_PLAY;
    this.npToggle.innerHTML = icon;
    this.modalToggle.innerHTML = icon;
    const ariaLabel = state === 'playing' ? 'Пауза' : 'Пусни';
    this.npToggle.setAttribute('aria-label', ariaLabel);
    this.modalToggle.setAttribute('aria-label', ariaLabel);
    this.modalVu.classList.toggle('animating', state === 'playing');
    if (this.current) {
      const isActive = !this.audio.paused;
      this.updateActiveCard(isActive ? this.current.stationuuid : null);
    }
  }

  private updateActiveCard(activeId: string | null) {
    for (const [id, el] of this.stationCards) {
      el.classList.toggle('active', id === activeId);
    }
  }
}

const ICON_PLAY =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
const ICON_STAR =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.3l-5.4 3.2 1.4-6.1L3 10.4l6.2-.5L12 4l2.8 5.9 6.2.5-5 4 1.4 6.1z"/></svg>';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string) {
  return escapeHtml(s);
}

const root = document.querySelector<HTMLElement>('[data-player]');
if (root) {
  const p = new Player(root);
  void p.init();
}
