/**
 * TRD Live - Hva skjer i Trondheim for ranheimkraft.no
 * 100 % klient-side arkitektur med 1-kalls daglig localStorage-caching.
 * 
 * Streng regel: Ingen tankestrek i kommentarer eller strenger.
 */

(function () {
  'use strict';

  // 1. Konfigurasjon og caching-nokler
  const CONFIG = {
    API_ENDPOINT: 'https://trdevents.no/graphQL',
    PAGE_SIZE: 200,
    STORAGE_CACHE_KEY: 'trd_live_events_data_v1',
    STORAGE_DATE_KEY: 'trd_live_last_fetched_date_v1',
    STORAGE_TIME_KEY: 'trd_live_last_fetched_timestamp_v1'
  };

  // 2. Fallback bilder hvis et arrangement mangler bilde
  const FALLBACK_IMAGES = {
    CONCERT: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
    SPORT: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80',
    CULTURE: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=800&q=80',
    SOCIAL: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
    DEFAULT: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=800&q=80'
  };

  // 3. Tilstands-handtering
  const state = {
    allEvents: [],
    filteredEvents: [],
    timeFilter: 'today', // 'today', 'weekend', 'week', 'all'
    categoryFilter: 'all', // 'all', 'concert', 'sport', 'culture', 'free', 'social'
    searchQuery: '',
    selectedRouletteEvent: null,
    isRouletteSpinning: false,
    activeModalEvent: null,
    lastFetchedDate: null,
    isCached: false,
    isLoading: false
  };

  // 4. Sanitering: Garanterer null tankestreker (erstatter med vanlig bindestrek eller komma)
  function cleanDash(str) {
    if (!str) return '';
    return String(str)
      .replace(/[\u2013\u2014]/g, ' - ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // 5. Dato-hjelpefunksjoner
  function getTodayDateString(offsetDays = 0) {
    const d = new Date();
    if (offsetDays !== 0) {
      d.setDate(d.getDate() + offsetDays);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseEventDate(event) {
    if (!event.startDate) return null;
    const datePart = event.startDate.substring(0, 10);
    const timePart = event.startTime || (event.startDate.length >= 16 ? event.startDate.substring(11, 16) : '18:00');
    return {
      dateStr: datePart,
      timeStr: timePart,
      fullDate: new Date(event.startDate.replace(' ', 'T'))
    };
  }

  function formatDisplayDate(dateStr, timeStr) {
    if (!dateStr) return 'Tidspunkt ikke oppgitt';
    const today = getTodayDateString();
    const tomorrow = getTodayDateString(1);

    const timeFormatted = timeStr ? `kl. ${timeStr}` : '';

    if (dateStr === today) {
      return `I dag ${timeFormatted}`.trim();
    }
    if (dateStr === tomorrow) {
      return `I morgen ${timeFormatted}`.trim();
    }

    try {
      const parts = dateStr.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const dayNames = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
      const dayName = dayNames[d.getDay()];
      const monthName = monthNames[d.getMonth()];
      return `${dayName} ${d.getDate()}. ${monthName} ${timeFormatted}`.trim();
    } catch (e) {
      return `${dateStr} ${timeFormatted}`.trim();
    }
  }

  function isThisWeekend(dateStr) {
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 is Sunday, 5 is Friday, 6 is Saturday
    
    // Beregn dato for fredag, lordag og sondag i innevaerende uke
    const diffToFriday = 5 - currentDayOfWeek;
    const fridayStr = getTodayDateString(diffToFriday);
    const saturdayStr = getTodayDateString(diffToFriday + 1);
    const sundayStr = getTodayDateString(diffToFriday + 2);

    // Dersom vi er i helgen (fre, lor, son), sjekk mot disse dagene
    return dateStr === fridayStr || dateStr === saturdayStr || dateStr === sundayStr;
  }

  function isThisWeek(dateStr) {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      weekDays.push(getTodayDateString(diffToMonday + i));
    }
    return weekDays.includes(dateStr);
  }

  // 6. Pris-formatering
  function formatPrice(event) {
    const prices = event.prices || [];
    if (!prices || prices.length === 0) {
      const lowerTitle = (event.title || '').toLowerCase();
      const lowerDesc = (event.desc || '').toLowerCase();
      if (lowerTitle.includes('gratis') || lowerDesc.includes('gratis inngang') || lowerDesc.includes('fri entr')) {
        return { label: 'Gratis inngang', isFree: true };
      }
      return { label: 'Fri entré / Sjekk lenke', isFree: true };
    }

    const freeItem = prices.find(p => p.type === 'FREE' || p.price === 0);
    if (freeItem) {
      return { label: 'Gratis', isFree: true };
    }

    const validPrices = prices.filter(p => typeof p.price === 'number' && p.price > 0);
    if (validPrices.length > 0) {
      const minPrice = Math.min(...validPrices.map(p => p.price));
      if (validPrices.length > 1) {
        return { label: `Fra ${minPrice} kr`, isFree: false };
      }
      return { label: `${minPrice} kr`, isFree: false };
    }

    return { label: 'Billetter tilgjengelig', isFree: false };
  }

  // 7. Kategori-normalisering
  function getPrimaryCategory(categories) {
    if (!categories || categories.length === 0) return 'Kultur';
    const cats = categories.map(c => String(c).toUpperCase());

    if (cats.includes('CONCERT')) return 'Konsert';
    if (cats.includes('SPORT')) return 'Sport';
    if (cats.some(c => ['THEATER', 'ART', 'EXHIBITION', 'MUSEUM', 'MOVIES', 'DANCE', 'LITERATURE'].includes(c))) {
      return 'Kultur';
    }
    if (cats.some(c => ['FOOD_DRINKS', 'SOCIAL', 'QUIZ', 'GAMES', 'GUIDED_TOUR', 'MARKET', 'FAMILY'].includes(c))) {
      return 'Mat & Sosialt';
    }
    return 'Opplevelse';
  }

  function getFallbackImage(category) {
    switch (category) {
      case 'Konsert': return FALLBACK_IMAGES.CONCERT;
      case 'Sport': return FALLBACK_IMAGES.SPORT;
      case 'Kultur': return FALLBACK_IMAGES.CULTURE;
      case 'Mat & Sosialt': return FALLBACK_IMAGES.SOCIAL;
      default: return FALLBACK_IMAGES.DEFAULT;
    }
  }

  // 8. Normalisering av arrangement-objekt fra GraphQL
  function normalizeEvent(raw) {
    const title = cleanDash(raw.title_nb || raw.title || 'Uten tittel');
    const desc = cleanDash(raw.desc_nb || raw.desc || '');
    const venueName = cleanDash((raw.venue && raw.venue.name) || raw.venue || 'Trondheim');
    const venueAddress = cleanDash((raw.venue && raw.venue.address) || raw.address || 'Trondheim');
    const categories = raw.categories || [];
    const primaryCategory = getPrimaryCategory(categories);

    let imageUrl = null;
    if (raw.images && raw.images.length > 0) {
      imageUrl = raw.images[0].urlSmall || raw.images[0].urlLarge || raw.images[0].urlOriginal;
    }
    if (!imageUrl) {
      imageUrl = getFallbackImage(primaryCategory);
    }

    const eventLink = raw.eventLink || 'https://trdevents.no';
    const ticketsURL = raw.ticketsURL || eventLink;

    const parsedDate = parseEventDate(raw);

    return {
      id: raw.id || String(Math.random()),
      title,
      desc,
      venue: venueName,
      address: venueAddress,
      categories,
      primaryCategory,
      imageUrl,
      eventLink,
      ticketsURL,
      prices: raw.prices || [],
      startDate: parsedDate ? parsedDate.dateStr : raw.startDate,
      startTime: parsedDate ? parsedDate.timeStr : (raw.startTime || '18:00'),
      isSoldOut: Boolean(raw.eventSoldOut)
    };
  }

  // 9. Lyd-effekt for Ruletten (Web Audio API for maksimal responsivitet uten eksterne filer)
  function playChime(frequency, duration = 0.08) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Ignorer lydfeil hvis bruker ikke har interagert enna
    }
  }

  // 10. Datahenting med streng daglig caching (Maks 1 kall per kalenderdag)
  async function loadEvents(forceRefresh = false) {
    const todayStr = getTodayDateString();
    const cachedDate = localStorage.getItem(CONFIG.STORAGE_DATE_KEY);
    const cachedData = localStorage.getItem(CONFIG.STORAGE_CACHE_KEY);

    // Sjekk om vi kan bruke cache
    if (!forceRefresh && cachedDate === todayStr && cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.allEvents = parsed;
          state.isCached = true;
          state.lastFetchedDate = cachedDate;
          updateCacheStatusBar(true);
          applyFilters();
          initRoulette();
          return;
        }
      } catch (err) {
        console.warn('Kunne ikke parse cache, henter ferske data:', err);
      }
    }

    // Gjor ett nytt API-kall for dagen
    state.isLoading = true;
    showLoadingSkeletons();
    updateCacheStatusBar(false, true);

    const query = `
      query {
        events(page: 0, pageSize: ${CONFIG.PAGE_SIZE}, filter: { cancelledNotIncluded: true }) {
          totalCount
          data {
            id
            title_nb
            desc_nb
            startDate
            startTime
            endDate
            categories
            eventSoldOut
            eventLink
            ticketsURL
            images {
              urlSmall
              urlLarge
            }
            prices {
              type
              price
              name_nb
            }
            venue {
              name
              address
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(CONFIG.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Nettverksfeil: ${response.status}`);
      }

      const json = await response.json();
      const rawEvents = (json.data && json.data.events && json.data.events.data) || [];

      if (rawEvents.length === 0) {
        throw new Error('API-et returnerte et tomt datasett');
      }

      const normalized = rawEvents.map(normalizeEvent);
      state.allEvents = normalized;
      state.isCached = false;
      state.lastFetchedDate = todayStr;

      // Lagre i localStorage for resten av kalenderdagen
      try {
        localStorage.setItem(CONFIG.STORAGE_CACHE_KEY, JSON.stringify(normalized));
        localStorage.setItem(CONFIG.STORAGE_DATE_KEY, todayStr);
        localStorage.setItem(CONFIG.STORAGE_TIME_KEY, new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }));
      } catch (storageErr) {
        console.warn('LocalStorage lagring feilet (mulig kvoteoverskridelse):', storageErr);
      }

      updateCacheStatusBar(true);
      applyFilters();
      initRoulette();
    } catch (apiError) {
      console.error('Feil under henting av arrangementer:', apiError);

      // Hvis feil, sjekk om vi har eldre cache
      if (cachedData) {
        try {
          const fallbackCached = JSON.parse(cachedData);
          state.allEvents = fallbackCached;
          state.isCached = true;
          showToast('Nettverk utilgjengelig. Viser tidligere lagrede data.', 'warning');
          updateCacheStatusBar(true);
          applyFilters();
          initRoulette();
          return;
        } catch (e) {
          // Fortsett til noeddatasett
        }
      }

      // Hvis ingen cache finnes, bruk noed-fallback
      if (window.TRD_FALLBACK_EVENTS && window.TRD_FALLBACK_EVENTS.length > 0) {
        state.allEvents = window.TRD_FALLBACK_EVENTS.map(normalizeEvent);
        showToast('Bruker lokalt noed-datasett for Trondheim.', 'info');
        updateCacheStatusBar(true);
        applyFilters();
        initRoulette();
      } else {
        renderErrorState(apiError.message);
      }
    } finally {
      state.isLoading = false;
    }
  }

  // 11. Filtrering av arrangementer
  function applyFilters() {
    const todayStr = getTodayDateString();

    state.filteredEvents = state.allEvents.filter(event => {
      // 1. Tidsfilter
      if (state.timeFilter === 'today') {
        if (event.startDate !== todayStr) return false;
      } else if (state.timeFilter === 'weekend') {
        if (!isThisWeekend(event.startDate)) return false;
      } else if (state.timeFilter === 'week') {
        if (!isThisWeek(event.startDate)) return false;
      }

      // 2. Kategori-filter
      if (state.categoryFilter !== 'all') {
        if (state.categoryFilter === 'free') {
          const priceInfo = formatPrice(event);
          if (!priceInfo.isFree) return false;
        } else if (state.categoryFilter === 'concert') {
          if (event.primaryCategory !== 'Konsert') return false;
        } else if (state.categoryFilter === 'sport') {
          if (event.primaryCategory !== 'Sport') return false;
        } else if (state.categoryFilter === 'culture') {
          if (event.primaryCategory !== 'Kultur') return false;
        } else if (state.categoryFilter === 'social') {
          if (event.primaryCategory !== 'Mat & Sosialt') return false;
        }
      }

      // 3. Tekst-sok
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        const titleMatch = event.title.toLowerCase().includes(query);
        const venueMatch = event.venue.toLowerCase().includes(query);
        const descMatch = event.desc.toLowerCase().includes(query);
        if (!titleMatch && !venueMatch && !descMatch) return false;
      }

      return true;
    });

    updateFilterBadges();
    renderEventGrid();
  }

  // 12. Oppdatering av tall-merker pa filtrene
  function updateFilterBadges() {
    const todayStr = getTodayDateString();

    const countToday = state.allEvents.filter(e => e.startDate === todayStr).length;
    const countWeekend = state.allEvents.filter(e => isThisWeekend(e.startDate)).length;
    const countWeek = state.allEvents.filter(e => isThisWeek(e.startDate)).length;
    const countAll = state.allEvents.length;

    const badgeToday = document.getElementById('badge-filter-today');
    const badgeWeekend = document.getElementById('badge-filter-weekend');
    const badgeWeek = document.getElementById('badge-filter-week');
    const badgeAll = document.getElementById('badge-filter-all');

    if (badgeToday) badgeToday.textContent = countToday;
    if (badgeWeekend) badgeWeekend.textContent = countWeekend;
    if (badgeWeek) badgeWeek.textContent = countWeek;
    if (badgeAll) badgeAll.textContent = countAll;
  }

  // 13. Rendering av arrangement-rutenett (Grid)
  function renderEventGrid() {
    const container = document.getElementById('events-grid');
    const countLabel = document.getElementById('events-count-label');

    if (countLabel) {
      const n = state.filteredEvents.length;
      countLabel.textContent = `${n} ${n === 1 ? 'arrangement' : 'arrangementer'}`;
    }

    if (!container) return;

    if (state.filteredEvents.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-16 px-4 text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-900/80 border border-white/10 mb-4 text-zinc-400">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-bold font-syne text-white mb-2">Ingen arrangementer funnet</h3>
          <p class="text-sm text-zinc-400 max-w-sm mx-auto mb-6">
            Det er ingen treff med gjeldende filtere for valgt tidsrom. Prov a velge "Alle dager" eller nullstille sokefeltet.
          </p>
          <button id="btn-reset-filters" class="px-5 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-medium text-xs transition">
            Tilbakestill filter
          </button>
        </div>
      `;

      const resetBtn = document.getElementById('btn-reset-filters');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          state.timeFilter = 'all';
          state.categoryFilter = 'all';
          state.searchQuery = '';
          const searchInput = document.getElementById('search-input');
          if (searchInput) searchInput.value = '';
          updateActiveFilterPills();
          applyFilters();
        });
      }
      return;
    }

    container.innerHTML = state.filteredEvents.map(event => {
      const priceInfo = formatPrice(event);
      const displayDate = formatDisplayDate(event.startDate, event.startTime);
      const isToday = event.startDate === getTodayDateString();

      return `
        <article class="glass-card rounded-2xl overflow-hidden flex flex-col group relative" data-event-id="${event.id}">
          <!-- Bilde-topp med badges -->
          <div class="relative aspect-[16/10] w-full overflow-hidden bg-zinc-900">
            <img 
              src="${event.imageUrl}" 
              alt="${event.title}" 
              loading="lazy" 
              class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onerror="this.onerror=null; this.src='${getFallbackImage(event.primaryCategory)}';"
            />
            <div class="absolute inset-0 card-image-gradient pointer-events-none"></div>

            <!-- Dato-merke -->
            <div class="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg backdrop-blur-md text-[11px] font-bold tracking-wide uppercase ${
              isToday 
                ? 'bg-cyan-500/90 text-black shadow-lg shadow-cyan-500/20' 
                : 'bg-zinc-950/80 text-zinc-200 border border-white/10'
            }">
              ${isToday ? '<span class="w-1.5 h-1.5 rounded-full bg-black animate-pulse"></span>' : ''}
              ${displayDate}
            </div>

            <!-- Kategori-merke -->
            <div class="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-zinc-950/80 backdrop-blur-md border border-white/10 text-[10px] font-mono uppercase text-zinc-300">
              ${event.primaryCategory}
            </div>

            <!-- Pris-badge nede til venstre over bildet -->
            <div class="absolute bottom-2.5 left-3">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                priceInfo.isFree 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-zinc-900/80 text-zinc-300 border border-white/10'
              }">
                ${priceInfo.label}
              </span>
            </div>
          </div>

          <!-- Innhold -->
          <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
            <div class="space-y-2">
              <!-- Spillested -->
              <div class="flex items-center gap-1.5 text-xs text-cyan-400 font-medium">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <span class="truncate">${event.venue}</span>
              </div>

              <!-- Tittel -->
              <h3 class="font-syne font-bold text-base sm:text-lg text-white group-hover:text-cyan-300 transition-colors line-clamp-2 leading-snug">
                ${event.title}
              </h3>

              <!-- Beskrivelse utdrag -->
              ${event.desc ? `<p class="text-xs text-zinc-400 line-clamp-2 leading-relaxed">${event.desc}</p>` : ''}
            </div>

            <!-- Bunn-knapper -->
            <div class="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
              <button 
                class="btn-open-details text-xs text-zinc-400 hover:text-white flex items-center gap-1 py-2 px-1 transition" 
                data-id="${event.id}">
                Mer info
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </button>

              <div class="flex items-center gap-1.5">
                <!-- Kalender-knapp -->
                <button 
                  class="btn-calendar-add p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 border border-white/10 transition" 
                  title="Legg til i Google Kalender" 
                  data-id="${event.id}">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                </button>

                <!-- Direkte billett/sjekk ut-lenke -->
                <a 
                  href="${event.ticketsURL}" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs tracking-wide transition shadow-md shadow-cyan-500/20 active:scale-95">
                  <span>Sjekk ut</span>
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Koble opp hendelser pa kortene
    container.querySelectorAll('.btn-open-details').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const ev = state.allEvents.find(x => x.id === id);
        if (ev) openEventModal(ev);
      });
    });

    container.querySelectorAll('.btn-calendar-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const ev = state.allEvents.find(x => x.id === id);
        if (ev) addToGoogleCalendar(ev);
      });
    });
  }

  // 14. "Trondheims-ruletten" (Overrask meg)
  function initRoulette() {
    if (state.allEvents.length === 0) return;
    
    // Velg et standard forste arrangement for rulett-boksen hvis ingen er valgt
    if (!state.selectedRouletteEvent) {
      const todayStr = getTodayDateString();
      const candidates = state.allEvents.filter(e => e.startDate >= todayStr);
      const pool = candidates.length > 0 ? candidates : state.allEvents;
      state.selectedRouletteEvent = pool[Math.floor(Math.random() * pool.length)];
    }

    renderRouletteCard(state.selectedRouletteEvent);
  }

  function spinRoulette() {
    if (state.isRouletteSpinning || state.allEvents.length === 0) return;

    state.isRouletteSpinning = true;
    const card = document.getElementById('roulette-card');
    const spinBtn = document.getElementById('btn-spin-roulette');
    const heroBtn = document.getElementById('btn-hero-surprise');

    if (spinBtn) spinBtn.disabled = true;
    if (heroBtn) heroBtn.disabled = true;
    if (card) card.classList.add('roulette-spinning');

    // Velg kandidater fra de neste dagene
    const todayStr = getTodayDateString();
    const upcoming = state.allEvents.filter(e => e.startDate >= todayStr);
    const pool = upcoming.length > 5 ? upcoming : state.allEvents;

    let spinCount = 0;
    const totalSpins = 9;
    const intervalTime = 90;

    const spinTimer = setInterval(() => {
      spinCount++;
      const randomPreview = pool[Math.floor(Math.random() * pool.length)];
      renderRouletteCard(randomPreview, true);
      playChime(320 + spinCount * 45, 0.05);

      if (spinCount >= totalSpins) {
        clearInterval(spinTimer);

        // Bestem endelig vinner
        let winner;
        do {
          winner = pool[Math.floor(Math.random() * pool.length)];
        } while (pool.length > 1 && winner.id === (state.selectedRouletteEvent && state.selectedRouletteEvent.id));

        state.selectedRouletteEvent = winner;
        renderRouletteCard(winner, false);

        if (card) {
          card.classList.remove('roulette-spinning');
          card.classList.add('neon-glow-cyan');
          setTimeout(() => card.classList.remove('neon-glow-cyan'), 1200);
        }

        playChime(880, 0.25);
        state.isRouletteSpinning = false;
        if (spinBtn) spinBtn.disabled = false;
        if (heroBtn) heroBtn.disabled = false;
      }
    }, intervalTime);
  }

  function renderRouletteCard(event, isPreview = false) {
    const card = document.getElementById('roulette-card');
    if (!card || !event) return;

    const priceInfo = formatPrice(event);
    const displayDate = formatDisplayDate(event.startDate, event.startTime);

    card.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-12 gap-5 items-center p-5 sm:p-7 relative z-10">
        <!-- Bilde-kolonne -->
        <div class="md:col-span-5 relative rounded-xl overflow-hidden aspect-[16/10] bg-zinc-900 border border-white/10 shadow-lg">
          <img 
            src="${event.imageUrl}" 
            alt="${event.title}" 
            class="w-full h-full object-cover"
            onerror="this.onerror=null; this.src='${getFallbackImage(event.primaryCategory)}';"
          />
          <div class="absolute inset-0 card-image-gradient pointer-events-none"></div>
          
          <div class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-cyan-500 text-black text-[10px] font-bold tracking-wider uppercase shadow-md shadow-cyan-500/20">
            Trondheims-ruletten
          </div>
          
          <div class="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded bg-zinc-950/80 backdrop-blur-md text-[11px] font-mono text-zinc-300 border border-white/10">
            ${event.primaryCategory}
          </div>
        </div>

        <!-- Tekst- og handlingskolonne -->
        <div class="md:col-span-7 space-y-3.5">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              ${displayDate}
            </span>
            <span class="inline-flex items-center gap-1 text-zinc-400">
              <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              ${event.venue}
            </span>
            <span class="px-2 py-0.5 rounded text-[11px] ${priceInfo.isFree ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-300'}">
              ${priceInfo.label}
            </span>
          </div>

          <h2 class="text-xl sm:text-2xl font-syne font-black text-white hover:text-cyan-300 transition-colors leading-tight">
            ${event.title}
          </h2>

          <p class="text-xs sm:text-sm text-zinc-300 line-clamp-2 leading-relaxed">
            ${event.desc || 'Et spennende arrangement i Trondheim. Bli med pa opplevelsen i bartebyen!'}
          </p>

          <div class="pt-2 flex flex-wrap items-center gap-3">
            <a 
              href="${event.ticketsURL}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs sm:text-sm tracking-wide transition shadow-lg shadow-cyan-500/25 flex items-center gap-1.5 active:scale-95">
              <span>Sjekk ut / Billetter</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </a>

            <button 
              id="btn-spin-roulette-inner" 
              class="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-xs sm:text-sm border border-white/10 transition flex items-center gap-2 active:scale-95">
              <svg class="w-4 h-4 text-cyan-400 ${state.isRouletteSpinning ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              <span>Nytt spinn</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const innerBtn = document.getElementById('btn-spin-roulette-inner');
    if (innerBtn) {
      innerBtn.addEventListener('click', spinRoulette);
    }
  }

  // 15. Kalender-integrasjon (Google Kalender og iCal)
  function addToGoogleCalendar(event) {
    const title = encodeURIComponent(event.title);
    const details = encodeURIComponent(`${event.desc || ''}\n\nLenke: ${event.eventLink}\nKilde: TRD Live (ranheimkraft.no)`);
    const location = encodeURIComponent(`${event.venue}, ${event.address}`);

    const startDate = (event.startDate || getTodayDateString()).replace(/-/g, '');
    const startTimeFormatted = (event.startTime || '18:00').replace(':', '') + '00';
    const dates = `${startDate}T${startTimeFormatted}/${startDate}T${startTimeFormatted}`;

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function downloadICal(event) {
    const startDate = (event.startDate || getTodayDateString()).replace(/-/g, '');
    const startTimeFormatted = (event.startTime || '18:00').replace(':', '') + '00';
    
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Ranheim Kraft//TRD Live//NO',
      'BEGIN:VEVENT',
      `UID:${event.id}@trdlive.ranheimkraft.no`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${startDate}T${startTimeFormatted}`,
      `DTEND:${startDate}T${startTimeFormatted}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${event.desc || ''}`,
      `LOCATION:${event.venue}, ${event.address}`,
      `URL:${event.eventLink}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showToast('Kalenderfil (.ics) lastet ned', 'success');
  }

  // 16. Modal for arrangement-detaljer
  function openEventModal(event) {
    state.activeModalEvent = event;
    const modal = document.getElementById('event-modal');
    if (!modal) return;

    const modalContent = document.getElementById('modal-content');
    const priceInfo = formatPrice(event);
    const displayDate = formatDisplayDate(event.startDate, event.startTime);

    modalContent.innerHTML = `
      <div class="relative aspect-video w-full overflow-hidden bg-zinc-950">
        <img 
          src="${event.imageUrl}" 
          alt="${event.title}" 
          class="w-full h-full object-cover"
          onerror="this.onerror=null; this.src='${getFallbackImage(event.primaryCategory)}';"
        />
        <div class="absolute inset-0 card-image-gradient pointer-events-none"></div>

        <button 
          id="btn-close-modal-top" 
          class="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition backdrop-blur-md">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        <div class="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-2">
          <span class="px-3 py-1 rounded-lg bg-cyan-500 text-black text-xs font-bold uppercase tracking-wider">
            ${displayDate}
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-zinc-900/90 text-zinc-300 text-xs font-mono border border-white/10 uppercase">
            ${event.primaryCategory}
          </span>
          <span class="px-2.5 py-1 rounded-lg text-xs font-semibold ${priceInfo.isFree ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-900/90 text-zinc-300 border border-white/10'}">
            ${priceInfo.label}
          </span>
        </div>
      </div>

      <div class="p-6 sm:p-8 space-y-6">
        <div>
          <h2 class="text-2xl sm:text-3xl font-syne font-black text-white leading-tight mb-2">
            ${event.title}
          </h2>
          <div class="flex items-center gap-2 text-sm text-cyan-400 font-medium">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            <span>${event.venue}</span>
            <span class="text-zinc-500">•</span>
            <span class="text-zinc-400">${event.address}</span>
          </div>
        </div>

        <div class="prose prose-invert text-zinc-300 text-sm leading-relaxed max-w-none">
          <p class="whitespace-pre-line">${event.desc || 'Ingen utvidet beskrivelse tilgjengelig for dette arrangementet.'}</p>
        </div>

        <!-- Handlingsknapper -->
        <div class="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button 
              id="btn-modal-gcal" 
              class="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition">
              <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              <span>Google Kalender</span>
            </button>

            <button 
              id="btn-modal-ical" 
              class="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition">
              <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
              <span>Last ned .ics</span>
            </button>

            <button 
              id="btn-modal-share" 
              class="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition"
              title="Kopier lenke">
              <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
              </svg>
              <span>Del</span>
            </button>
          </div>

          <a 
            href="${event.ticketsURL}" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-sm tracking-wide transition shadow-lg shadow-cyan-500/25 flex items-center gap-2 active:scale-95">
            <span>Kjop billetter / Les mer</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </a>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Fest hendelser
    document.getElementById('btn-close-modal-top').addEventListener('click', closeEventModal);
    document.getElementById('btn-modal-gcal').addEventListener('click', () => addToGoogleCalendar(event));
    document.getElementById('btn-modal-ical').addEventListener('click', () => downloadICal(event));
    document.getElementById('btn-modal-share').addEventListener('click', () => {
      navigator.clipboard.writeText(event.ticketsURL || event.eventLink).then(() => {
        showToast('Lenke kopiert til utklippstavlen', 'success');
      }).catch(() => {
        showToast('Kunne ikke kopiere lenke', 'error');
      });
    });
  }

  function closeEventModal() {
    const modal = document.getElementById('event-modal');
    if (modal) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
      state.activeModalEvent = null;
    }
  }

  // 17. Statusfelt for daglig cache
  function updateCacheStatusBar(ready = true, isFetching = false) {
    const label = document.getElementById('cache-status-text');
    const dot = document.getElementById('cache-status-dot');
    const refreshBtn = document.getElementById('btn-force-refresh');

    if (!label) return;

    if (isFetching) {
      label.textContent = 'Henter ferske data fra TRD Events...';
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
      if (refreshBtn) refreshBtn.classList.add('opacity-50', 'pointer-events-none');
      return;
    }

    if (refreshBtn) refreshBtn.classList.remove('opacity-50', 'pointer-events-none');

    const todayStr = getTodayDateString();
    const cachedTime = localStorage.getItem(CONFIG.STORAGE_TIME_KEY) || 'i dag';

    if (state.isCached) {
      label.textContent = `Dagens data aktiv (hentet ${cachedTime}). Maks 1 API-kall per dag.`;
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]';
    } else {
      label.textContent = `Oppdatert for ${todayStr}. Neste sjekk i morgen.`;
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    }
  }

  // 18. Laste-indikatorer (Skeleton cards)
  function showLoadingSkeletons() {
    const container = document.getElementById('events-grid');
    if (!container) return;

    container.innerHTML = Array.from({ length: 6 }).map(() => `
      <div class="glass-card rounded-2xl overflow-hidden flex flex-col space-y-4 p-4 animate-pulse">
        <div class="aspect-[16/10] w-full rounded-xl skeleton-shimmer"></div>
        <div class="h-4 w-1/3 rounded skeleton-shimmer"></div>
        <div class="h-6 w-3/4 rounded skeleton-shimmer"></div>
        <div class="h-4 w-full rounded skeleton-shimmer"></div>
        <div class="pt-4 border-t border-white/5 flex justify-between items-center">
          <div class="h-4 w-1/4 rounded skeleton-shimmer"></div>
          <div class="h-8 w-20 rounded-xl skeleton-shimmer"></div>
        </div>
      </div>
    `).join('');
  }

  // 19. Feilvisning
  function renderErrorState(errorMessage) {
    const container = document.getElementById('events-grid');
    if (!container) return;

    container.innerHTML = `
      <div class="col-span-full py-16 px-4 text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 mb-4 text-rose-400">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        </div>
        <h3 class="text-xl font-bold font-syne text-white mb-2">Kunne ikke laste arrangementer</h3>
        <p class="text-sm text-zinc-400 max-w-md mx-auto mb-6">
          Vi klarte ikke a hente arrangementsdata akkurat na. Feilmelding: ${errorMessage}. Prov a laste siden pa nytt eller sjekk internettforbindelsen.
        </p>
        <button id="btn-error-retry" class="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs uppercase tracking-wider transition active:scale-95">
          Prov pa nytt
        </button>
      </div>
    `;

    const retryBtn = document.getElementById('btn-error-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => loadEvents(true));
    }
  }

  // 20. Toast-varsel
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    const text = document.getElementById('toast-text');
    if (text) text.textContent = message;

    toast.classList.remove('hidden', 'translate-y-10', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-10', 'opacity-0');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3500);
  }

  // 21. Oppdatering av aktive knapper i filtere
  function updateActiveFilterPills() {
    // Tidsfilter
    document.querySelectorAll('.btn-time-filter').forEach(btn => {
      const filter = btn.getAttribute('data-filter');
      if (filter === state.timeFilter) {
        btn.classList.remove('bg-zinc-900/60', 'text-zinc-400', 'border-white/5');
        btn.classList.add('bg-cyan-400', 'text-black', 'font-bold', 'border-cyan-400');
      } else {
        btn.classList.add('bg-zinc-900/60', 'text-zinc-400', 'border-white/5');
        btn.classList.remove('bg-cyan-400', 'text-black', 'font-bold', 'border-cyan-400');
      }
    });

    // Kategori-filter
    document.querySelectorAll('.btn-cat-filter').forEach(btn => {
      const cat = btn.getAttribute('data-category');
      if (cat === state.categoryFilter) {
        btn.classList.remove('bg-zinc-900/80', 'text-zinc-400', 'border-white/10');
        btn.classList.add('bg-white', 'text-black', 'font-bold', 'border-white');
      } else {
        btn.classList.add('bg-zinc-900/80', 'text-zinc-400', 'border-white/10');
        btn.classList.remove('bg-white', 'text-black', 'font-bold', 'border-white');
      }
    });
  }

  // 22. Initialisering av hendelseslyttere
  function initEvents() {
    // Tidsfilter-knapper
    document.querySelectorAll('.btn-time-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.timeFilter = e.currentTarget.getAttribute('data-filter');
        updateActiveFilterPills();
        applyFilters();
      });
    });

    // Kategori-knapper
    document.querySelectorAll('.btn-cat-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.categoryFilter = e.currentTarget.getAttribute('data-category');
        updateActiveFilterPills();
        applyFilters();
      });
    });

    // Sokefelt med debouncing
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('btn-clear-search');
    let searchTimeout = null;

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const val = e.target.value.trim();
        if (searchClear) {
          searchClear.classList.toggle('hidden', val.length === 0);
        }
        searchTimeout = setTimeout(() => {
          state.searchQuery = val;
          applyFilters();
        }, 150);
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        searchClear.classList.add('hidden');
        searchInput.focus();
        applyFilters();
      });
    }

    // Overrask meg / Rulett-knapper
    const heroSurpriseBtn = document.getElementById('btn-hero-surprise');
    if (heroSurpriseBtn) {
      heroSurpriseBtn.addEventListener('click', () => {
        const rouletteSection = document.getElementById('roulette-section');
        if (rouletteSection) {
          rouletteSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        spinRoulette();
      });
    }

    // Manuell oppdateringsknapp for cache
    const forceRefreshBtn = document.getElementById('btn-force-refresh');
    if (forceRefreshBtn) {
      forceRefreshBtn.addEventListener('click', () => {
        loadEvents(true);
      });
    }

    // Modal lukk ved klikk pa bakgrunn eller ESC
    const modal = document.getElementById('event-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeEventModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.activeModalEvent) {
        closeEventModal();
      }
    });
  }

  // 23. Oppstart
  document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    updateActiveFilterPills();
    loadEvents();
  });

})();
