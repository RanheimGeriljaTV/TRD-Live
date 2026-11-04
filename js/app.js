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
    STORAGE_CACHE_KEY: 'trd_live_events_data_v6',
    STORAGE_DATE_KEY: 'trd_live_last_fetched_date_v6',
    STORAGE_TIME_KEY: 'trd_live_last_fetched_timestamp_v6',
    STORAGE_VIEW_KEY: 'trd_live_view_mode_v6'
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
    districtFilter: 'all', // 'all', 'ranheim', 'sentrum', 'sorbyen'
    nightlifeOnly: false, // true = kun arrangementer etter kl. 19:00
    viewMode: localStorage.getItem(CONFIG.STORAGE_VIEW_KEY) || 'cards', // 'cards' eller 'list'
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
    if (!dateStr) return 'Tid ukjent';
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
    const currentDayOfWeek = now.getDay();
    const diffToFriday = 5 - currentDayOfWeek;
    const fridayStr = getTodayDateString(diffToFriday);
    const saturdayStr = getTodayDateString(diffToFriday + 1);
    const sundayStr = getTodayDateString(diffToFriday + 2);

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

  // 6. Bydels-kategorisering (Ranheim & Ostbyen, Midtbyen/Sentrum, Sorbyen)
  function getDistrict(event) {
    const v = (event.venue || '').toLowerCase();
    const a = (event.address || '').toLowerCase();
    const text = `${v} ${a}`;

    // 1. Ranheim & Ostbyen
    if (
      text.includes('ranheim') ||
      text.includes('extra arena') ||
      text.includes('lademoen') ||
      text.includes('lade') ||
      text.includes('innherredsveien') ||
      text.includes('solsiden') ||
      text.includes('dora') ||
      text.includes('svartlamon') ||
      text.includes('verkstedhallen') ||
      text.includes('lobbyen') ||
      text.includes('rosendal') ||
      text.includes('brukom') ||
      text.includes('leangen') ||
      text.includes('rotvoll') ||
      text.includes('charlottenlund') ||
      text.includes('ringve') ||
      text.includes('7040') ||
      text.includes('7041') ||
      text.includes('7053') ||
      text.includes('7054')
    ) {
      return 'ranheim';
    }

    // 2. Sorbyen, Tempe, Heimdal & Granasen
    if (
      text.includes('lerkendal') ||
      text.includes('tempe') ||
      text.includes('sluppen') ||
      text.includes('saupstad') ||
      text.includes('heimdal') ||
      text.includes('kolstad') ||
      text.includes('tiller') ||
      text.includes('moholt') ||
      text.includes('risvollan') ||
      text.includes('nardo') ||
      text.includes('gløshaugen') ||
      text.includes('gloshaugen') ||
      text.includes('dragvoll') ||
      text.includes('granåsen') ||
      text.includes('granasen') ||
      text.includes('bymarka') ||
      text.includes('lian') ||
      text.includes('skistua')
    ) {
      return 'sorbyen';
    }

    // 3. Midtbyen & Sentrum (og standard)
    return 'sentrum';
  }

  // 7. Pris-formatering
  function formatPrice(event) {
    const prices = event.prices || [];
    if (!prices || prices.length === 0) {
      const lowerTitle = (event.title || '').toLowerCase();
      const lowerDesc = (event.desc || '').toLowerCase();
      if (lowerTitle.includes('gratis') || lowerDesc.includes('gratis inngang') || lowerDesc.includes('fri entr')) {
        return { label: 'Gratis', isFree: true };
      }
      return { label: 'Fri entré', isFree: true };
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

    return { label: 'Billetter', isFree: false };
  }

  // 8. Kategori-normalisering
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

  // 9. Normalisering av arrangement-objekt fra GraphQL
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
    const parsedStartHour = parsedDate && parsedDate.timeStr ? parseInt(parsedDate.timeStr.split(':')[0], 10) : 18;

    const eventObj = {
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
      startHour: isNaN(parsedStartHour) ? 18 : parsedStartHour,
      isSoldOut: Boolean(raw.eventSoldOut)
    };

    eventObj.district = getDistrict(eventObj);
    return eventObj;
  }

  // 10. Lyd-effekt for Ruletten
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
      // Ignorer
    }
  }

  // 11. Datahenting med streng daglig caching (Maks 1 kall per kalenderdag)
  async function loadEvents(forceRefresh = false) {
    const todayStr = getTodayDateString();
    const cachedDate = localStorage.getItem(CONFIG.STORAGE_DATE_KEY);
    const cachedData = localStorage.getItem(CONFIG.STORAGE_CACHE_KEY);

    if (!forceRefresh && cachedDate === todayStr && cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.allEvents = parsed.map(e => ({ ...e, district: getDistrict(e) }));
          state.isCached = true;
          state.lastFetchedDate = cachedDate;
          updateCacheStatusBar(true);
          applyFilters();
          initRoulette();
          return;
        }
      } catch (err) {
        console.warn('Kunne ikke parse cache:', err);
      }
    }

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

      try {
        localStorage.setItem(CONFIG.STORAGE_CACHE_KEY, JSON.stringify(normalized));
        localStorage.setItem(CONFIG.STORAGE_DATE_KEY, todayStr);
        localStorage.setItem(CONFIG.STORAGE_TIME_KEY, new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }));
      } catch (storageErr) {
        console.warn('LocalStorage kvoteoverskridelse:', storageErr);
      }

      updateCacheStatusBar(true);
      applyFilters();
      initRoulette();
    } catch (apiError) {
      console.error('Feil under henting av arrangementer:', apiError);

      if (cachedData) {
        try {
          const fallbackCached = JSON.parse(cachedData);
          state.allEvents = fallbackCached.map(e => ({ ...e, district: getDistrict(e) }));
          state.isCached = true;
          showToast('Nettverk utilgjengelig. Viser lagrede data.', 'warning');
          updateCacheStatusBar(true);
          applyFilters();
          initRoulette();
          return;
        } catch (e) {
          // Gå til noeddatasett
        }
      }

      if (window.TRD_FALLBACK_EVENTS && window.TRD_FALLBACK_EVENTS.length > 0) {
        state.allEvents = window.TRD_FALLBACK_EVENTS.map(normalizeEvent);
        showToast('Bruker lokalt datasett for Trondheim.', 'info');
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

  // 12. Filtrering av arrangementer
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

      // 2. Kveld / Natteliv filter (Etter kl. 19:00)
      if (state.nightlifeOnly) {
        if (event.startHour < 19) return false;
      }

      // 3. Bydels-filter
      if (state.districtFilter !== 'all') {
        if (event.district !== state.districtFilter) return false;
      }

      // 4. Kategori-filter
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

      // 5. Tekst-sok
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
    renderEventContainer();
  }

  // 13. Oppdatering av tall-merker pa filtrene
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

  // 14. Rendering av innhold (Kortvisning vs. Ultra-tett Listevisning)
  function renderEventContainer() {
    const container = document.getElementById('events-container');
    const countLabel = document.getElementById('events-count-label');

    if (countLabel) {
      const n = state.filteredEvents.length;
      countLabel.textContent = `${n} ${n === 1 ? 'arrangement' : 'arrangementer'}`;
    }

    if (!container) return;

    if (state.filteredEvents.length === 0) {
      container.innerHTML = `
        <div class="py-12 px-4 text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 border border-white/10 mb-3 text-zinc-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h3 class="text-base font-bold font-syne text-white mb-1">Ingen arrangementer funnet</h3>
          <p class="text-xs text-zinc-400 max-w-xs mx-auto mb-4">
            Ingen treff for valgte filtre. Prov a velge "Alle dager", skru av kveldsfilter eller tom sokefeltet.
          </p>
          <button id="btn-reset-filters" class="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-medium text-xs transition">
            Nullstill alle filtere
          </button>
        </div>
      `;

      const resetBtn = document.getElementById('btn-reset-filters');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          state.timeFilter = 'all';
          state.categoryFilter = 'all';
          state.districtFilter = 'all';
          state.nightlifeOnly = false;
          state.searchQuery = '';
          const searchInput = document.getElementById('search-input');
          if (searchInput) searchInput.value = '';
          updateActiveFilterPills();
          applyFilters();
        });
      }
      return;
    }

    if (state.viewMode === 'list') {
      renderDenseListView(container);
    } else {
      renderCardGridView(container);
    }

    attachCardEvents(container);
  }

  // 15. ULTRA-TETT LISTEVISNING (Optimalisert for 9:16 mobilskjerm: Ingen overlapp!)
  function renderDenseListView(container) {
    const todayStr = getTodayDateString();

    container.innerHTML = `
      <div class="space-y-1.5">
        ${state.filteredEvents.map(event => {
          const priceInfo = formatPrice(event);
          const displayDate = formatDisplayDate(event.startDate, event.startTime);
          const isToday = event.startDate === todayStr;

          return `
            <div class="glass-card rounded-xl p-2 sm:px-3 sm:py-2 flex items-center justify-between gap-2 border border-white/5 hover:border-cyan-400/40 transition group" data-event-id="${event.id}">
              <!-- Venstre kolonne: Tydelig to-lags hierarki som aldri overlapper -->
              <div class="flex-1 min-w-0 flex flex-col gap-1 cursor-pointer btn-open-details" data-id="${event.id}">
                <!-- Topplinje: Tid, Spillested og Dato i en ren enkel linje -->
                <div class="flex items-center gap-1.5 text-xs leading-none overflow-hidden py-0.5">
                  <!-- Tid -->
                  <span class="font-mono text-xs font-bold ${isToday ? 'text-cyan-400' : 'text-zinc-200'} shrink-0">
                    ${event.startTime || '19:00'}
                  </span>
                  
                  <span class="text-zinc-600 text-[10px] shrink-0">•</span>

                  <!-- Fremhevet Spillested (kontrollert bredde, garantert truncate) -->
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/90 border border-cyan-400/40 text-cyan-200 text-[10px] font-bold uppercase tracking-wider truncate max-w-[100px] sm:max-w-[160px] shrink-0">
                    <svg class="w-2.5 h-2.5 text-cyan-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
                    </svg>
                    <span class="truncate">${event.venue}</span>
                  </span>

                  <!-- Dato (skjules eller forkortes hvis trangt) -->
                  <span class="text-[10px] font-mono text-zinc-400 truncate shrink-0">
                    ${isToday ? 'I dag' : displayDate.split(' kl.')[0]}
                  </span>

                  <!-- Pris (vises nar det er god plass) -->
                  <span class="text-[10px] font-semibold ${priceInfo.isFree ? 'text-emerald-400' : 'text-zinc-400'} truncate hidden sm:inline">
                    ${priceInfo.label}
                  </span>
                </div>

                <!-- Bunnlinje: Tittel (Egen full linje med blokk-avkorting) -->
                <h3 class="font-syne font-bold text-xs sm:text-sm text-white group-hover:text-cyan-300 transition truncate leading-tight block w-full" title="${event.title}">
                  ${event.title}
                </h3>
              </div>

              <!-- Hoyre handlingsknapper: Kompakt og snorrett -->
              <div class="flex items-center gap-1 shrink-0 ml-1.5">
                <button 
                  class="btn-calendar-add p-1 sm:p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition" 
                  title="Legg til i Google Kalender" 
                  data-id="${event.id}">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                </button>

                <a 
                  href="${event.ticketsURL}" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  class="inline-flex items-center justify-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-[11px] sm:text-xs whitespace-nowrap shadow-sm active:scale-95">
                  <span>Billetter</span>
                  <svg class="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                </a>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // 16. KOMPAKT KORTVISNING (4 kolonner, fast bildehoyde, kraftig fokus pa spillested)
  function renderCardGridView(container) {
    const todayStr = getTodayDateString();

    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        ${state.filteredEvents.map(event => {
          const priceInfo = formatPrice(event);
          const displayDate = formatDisplayDate(event.startDate, event.startTime);
          const isToday = event.startDate === todayStr;

          return `
            <article class="glass-card rounded-xl overflow-hidden flex flex-col group border border-white/10 hover:border-cyan-400/50 transition duration-200" data-event-id="${event.id}">
              <!-- Bilde-topp med badges (kompakt hoyde h-28 sm:h-32) -->
              <div class="relative h-28 sm:h-32 w-full overflow-hidden bg-zinc-900 cursor-pointer btn-open-details" data-id="${event.id}">
                <img 
                  src="${event.imageUrl}" 
                  alt="${event.title}" 
                  loading="lazy" 
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onerror="this.onerror=null; this.src='${getFallbackImage(event.primaryCategory)}';"
                />
                <div class="absolute inset-0 card-image-gradient pointer-events-none"></div>

                <!-- Dato-merke (beskyttet bredde mot overlapp) -->
                <div class="absolute top-2 left-2 max-w-[65%] truncate flex items-center gap-1 px-2 py-0.5 rounded backdrop-blur-md text-[10px] font-bold tracking-wide uppercase ${
                  isToday 
                    ? 'bg-cyan-400 text-black shadow-sm shadow-cyan-400/40' 
                    : 'bg-zinc-950/90 text-zinc-200 border border-white/20'
                }">
                  ${isToday ? '<span class="w-1.5 h-1.5 rounded-full bg-black animate-pulse shrink-0"></span>' : ''}
                  <span class="truncate">${displayDate}</span>
                </div>

                <!-- Kategori-merke -->
                <div class="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-zinc-950/90 backdrop-blur-md border border-white/15 text-[9px] font-mono uppercase text-zinc-300">
                  ${event.primaryCategory}
                </div>

                <!-- Pris-badge nede pa bildet -->
                <div class="absolute bottom-1.5 left-2">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    priceInfo.isFree 
                      ? 'bg-emerald-400 text-black font-extrabold shadow-sm' 
                      : 'bg-zinc-950/90 text-zinc-200 border border-white/15'
                  }">
                    ${priceInfo.label}
                  </span>
                </div>
              </div>

              <!-- Innhold med kraftig fokus pa SPILLESTED og kompakt tittel -->
              <div class="p-2.5 sm:p-3 flex flex-col gap-1.5 flex-1 justify-between">
                <div>
                  <!-- Fremhevet Spillested (meget synlig cyan badge med kartnal) -->
                  <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-950/80 border border-cyan-400/40 text-cyan-200 font-extrabold text-xs min-w-0">
                    <svg class="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
                    </svg>
                    <span class="truncate uppercase tracking-wide text-[11px] font-bold">${event.venue}</span>
                  </div>

                  <!-- Tittel: Fast hoyde med title-clamp-2 som aldri strekker boksen -->
                  <div class="h-9 sm:h-10 flex items-center overflow-hidden mt-1">
                    <h3 class="font-syne font-bold text-xs sm:text-sm text-white group-hover:text-cyan-300 transition-colors title-clamp-2 leading-snug cursor-pointer btn-open-details" data-id="${event.id}" title="${event.title}">
                      ${event.title}
                    </h3>
                  </div>
                </div>

                <!-- Bunnrad med knapper (snug, rett under tittelen) -->
                <div class="pt-1.5 border-t border-white/5 flex items-center justify-between gap-1 mt-auto">
                  <button 
                    class="btn-open-details text-[11px] text-zinc-400 hover:text-white flex items-center gap-0.5 py-1 px-0.5 transition" 
                    data-id="${event.id}">
                    <span>Mer info</span>
                  </button>

                  <div class="flex items-center gap-1">
                    <button 
                      class="btn-calendar-add p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 border border-white/10 transition" 
                      title="Legg til i Google Kalender" 
                      data-id="${event.id}">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                      </svg>
                    </button>

                    <a 
                      href="${event.ticketsURL}" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-xs tracking-wide transition shadow-sm active:scale-95">
                      <span>Billetter</span>
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function attachCardEvents(container) {
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

  // 17. "Trondheims-ruletten" (Overrask meg)
  function initRoulette() {
    if (state.allEvents.length === 0) return;
    
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
    const heroBtn = document.getElementById('btn-hero-surprise');

    if (heroBtn) heroBtn.disabled = true;
    if (card) card.classList.add('roulette-spinning');

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
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-4 p-2.5 sm:p-4 relative z-10">
        <!-- Bilde: Kompakt side-om-side eller elegant banner -->
        <div class="relative shrink-0 rounded-xl overflow-hidden h-24 sm:h-32 sm:w-44 bg-zinc-900 border border-white/10 shadow-lg">
          <img 
            src="${event.imageUrl}" 
            alt="${event.title}" 
            class="w-full h-full object-cover"
            onerror="this.onerror=null; this.src='${getFallbackImage(event.primaryCategory)}';"
          />
          <div class="absolute inset-0 card-image-gradient pointer-events-none"></div>
          
          <div class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-cyan-400 text-black text-[9px] font-bold tracking-wider uppercase">
            Ruletten
          </div>
          
          <div class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-zinc-950/90 backdrop-blur-md text-[9px] font-mono text-zinc-300 border border-white/10">
            ${event.primaryCategory}
          </div>
        </div>

        <!-- Tekst- og handlingskolonne -->
        <div class="flex-1 min-w-0 space-y-1.5">
          <!-- Dato, Pris og Fremhevet Spillested -->
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            <!-- Spillested badge -->
            <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/90 border border-cyan-400/50 text-cyan-200 font-extrabold text-xs max-w-[140px] truncate">
              <svg class="w-3 h-3 text-cyan-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
              </svg>
              <span class="truncate">${event.venue}</span>
            </div>

            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium text-[10px] sm:text-[11px]">
              <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
              <span class="truncate">${displayDate}</span>
            </span>

            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${priceInfo.isFree ? 'bg-emerald-400 text-black font-extrabold' : 'bg-zinc-800 text-zinc-300'}">
              ${priceInfo.label}
            </span>
          </div>

          <!-- Tittel -->
          <h2 class="text-sm sm:text-base font-syne font-bold text-white hover:text-cyan-300 transition-colors leading-tight title-clamp-2">
            ${event.title}
          </h2>

          <div class="pt-0.5 flex items-center gap-2">
            <a 
              href="${event.ticketsURL}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="px-3 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-xs tracking-wide transition shadow-sm active:scale-95 flex items-center gap-1">
              <span>Sjekk ut</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </a>

            <button 
              id="btn-spin-roulette-inner" 
              class="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-xs border border-white/10 transition flex items-center gap-1.5 active:scale-95">
              <svg class="w-3.5 h-3.5 text-cyan-400 ${state.isRouletteSpinning ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  // 18. Kalender-integrasjon
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

  // 19. Modal for arrangement-detaljer
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
          class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 transition backdrop-blur-md">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        <div class="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
          <span class="px-2.5 py-0.5 rounded-md bg-cyan-400 text-black text-[11px] font-bold uppercase tracking-wider">
            ${displayDate}
          </span>
          <span class="px-2 py-0.5 rounded-md bg-zinc-900/90 text-zinc-300 text-[10px] font-mono border border-white/10 uppercase">
            ${event.primaryCategory}
          </span>
          <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${priceInfo.isFree ? 'bg-emerald-400 text-black font-extrabold' : 'bg-zinc-900/90 text-zinc-300 border border-white/10'}">
            ${priceInfo.label}
          </span>
        </div>
      </div>

      <div class="p-5 sm:p-6 space-y-4">
        <div>
          <!-- Fremhevet Spillested-badge i modal -->
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-950 border border-cyan-400/50 text-cyan-200 font-extrabold text-xs mb-2">
            <svg class="w-4 h-4 text-cyan-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
            </svg>
            <span>${event.venue}</span>
            <span class="text-zinc-500">•</span>
            <span class="text-zinc-300 font-normal">${event.address}</span>
          </div>

          <h2 class="text-xl sm:text-2xl font-syne font-bold text-white leading-tight mb-1.5">
            ${event.title}
          </h2>
        </div>

        <div class="prose prose-invert text-zinc-300 text-xs sm:text-sm leading-relaxed max-w-none">
          <p class="whitespace-pre-line">${event.desc || 'Ingen utvidet beskrivelse tilgjengelig for dette arrangementet.'}</p>
        </div>

        <div class="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex items-center gap-1.5">
            <button 
              id="btn-modal-gcal" 
              class="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1 transition">
              <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              <span>Google Kalender</span>
            </button>

            <button 
              id="btn-modal-ical" 
              class="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1 transition">
              <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
              <span>.ics</span>
            </button>

            <button 
              id="btn-modal-share" 
              class="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1 transition"
              title="Kopier lenke">
              <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
              </svg>
              <span>Del</span>
            </button>
          </div>

          <a 
            href="${event.ticketsURL}" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-xs tracking-wide transition shadow-sm active:scale-95 flex items-center gap-1.5">
            <span>Billetter / Info</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </a>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    document.getElementById('btn-close-modal-top').addEventListener('click', closeEventModal);
    document.getElementById('btn-modal-gcal').addEventListener('click', () => addToGoogleCalendar(event));
    document.getElementById('btn-modal-ical').addEventListener('click', () => downloadICal(event));
    document.getElementById('btn-modal-share').addEventListener('click', () => {
      navigator.clipboard.writeText(event.ticketsURL || event.eventLink).then(() => {
        showToast('Lenke kopiert', 'success');
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

  // 20. Statusfelt for daglig cache
  function updateCacheStatusBar(ready = true, isFetching = false) {
    const label = document.getElementById('cache-status-text');
    const dot = document.getElementById('cache-status-dot');
    const refreshBtn = document.getElementById('btn-force-refresh');

    if (!label) return;

    if (isFetching) {
      label.textContent = 'Laster...';
      if (dot) dot.className = 'w-1 h-1 rounded-full bg-amber-400 animate-ping';
      if (refreshBtn) refreshBtn.classList.add('opacity-50', 'pointer-events-none');
      return;
    }

    if (refreshBtn) refreshBtn.classList.remove('opacity-50', 'pointer-events-none');

    const todayStr = getTodayDateString();
    const cachedTime = localStorage.getItem(CONFIG.STORAGE_TIME_KEY) || 'i dag';

    if (state.isCached) {
      label.textContent = 'Cached';
      label.title = `Dagens data er lagret lokalt i nettleseren (kl. ${cachedTime}). Maks 1 API-kall per dag.`;
      if (dot) dot.className = 'w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]';
    } else {
      label.textContent = 'Oppdatert';
      label.title = `Ferske data hentet for ${todayStr}. Neste automatiske sjekk i morgen.`;
      if (dot) dot.className = 'w-1 h-1 rounded-full bg-emerald-400';
    }
  }

  // 21. Laste-indikatorer
  function showLoadingSkeletons() {
    const container = document.getElementById('events-container');
    if (!container) return;

    if (state.viewMode === 'list') {
      container.innerHTML = Array.from({ length: 8 }).map(() => `
        <div class="glass-card rounded-xl p-2.5 sm:px-3 sm:py-2 flex items-center justify-between gap-3 animate-pulse">
          <div class="flex-1 space-y-1.5">
            <div class="h-3 w-1/3 rounded skeleton-shimmer"></div>
            <div class="h-4 w-3/4 rounded skeleton-shimmer"></div>
          </div>
          <div class="h-7 w-16 rounded-lg skeleton-shimmer"></div>
        </div>
      `).join('');
    } else {
      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          ${Array.from({ length: 8 }).map(() => `
            <div class="glass-card rounded-xl overflow-hidden flex flex-col space-y-2 p-3 animate-pulse">
              <div class="h-28 w-full rounded-lg skeleton-shimmer"></div>
              <div class="h-4 w-1/2 rounded skeleton-shimmer"></div>
              <div class="h-5 w-3/4 rounded skeleton-shimmer"></div>
              <div class="pt-1.5 border-t border-white/5 flex justify-between items-center">
                <div class="h-3.5 w-1/4 rounded skeleton-shimmer"></div>
                <div class="h-5 w-14 rounded skeleton-shimmer"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // 22. Feilvisning
  function renderErrorState(errorMessage) {
    const container = document.getElementById('events-container');
    if (!container) return;

    container.innerHTML = `
      <div class="py-12 px-4 text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-3 text-rose-400">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        </div>
        <h3 class="text-base font-bold font-syne text-white mb-1">Kunne ikke laste arrangementer</h3>
        <p class="text-xs text-zinc-400 max-w-sm mx-auto mb-4">
          Feilmelding: ${errorMessage}. Prov a laste siden pa nytt eller sjekk nettverket.
        </p>
        <button id="btn-error-retry" class="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs uppercase tracking-wider transition active:scale-95">
          Prov pa nytt
        </button>
      </div>
    `;

    const retryBtn = document.getElementById('btn-error-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => loadEvents(true));
    }
  }

  // 23. Toast-varsel
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
    }, 3000);
  }

  // 24. Oppdatering av aktive knapper i filtere
  function updateActiveFilterPills() {
    // Tidsfilter
    document.querySelectorAll('.btn-time-filter').forEach(btn => {
      const filter = btn.getAttribute('data-filter');
      if (filter === state.timeFilter) {
        btn.classList.remove('bg-zinc-900/60', 'text-zinc-400', 'border-white/5');
        btn.classList.add('bg-cyan-400', 'text-black', 'font-bold', 'border-cyan-400', 'shadow-sm', 'shadow-cyan-400/20');
      } else {
        btn.classList.add('bg-zinc-900/60', 'text-zinc-400', 'border-white/5');
        btn.classList.remove('bg-cyan-400', 'text-black', 'font-bold', 'border-cyan-400', 'shadow-sm', 'shadow-cyan-400/20');
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

    // Bydels-filter
    document.querySelectorAll('.btn-district-filter').forEach(btn => {
      const dist = btn.getAttribute('data-district');
      if (dist === state.districtFilter) {
        btn.classList.remove('bg-zinc-900/80', 'text-zinc-400', 'border-white/10');
        btn.classList.add('bg-cyan-400', 'text-black', 'font-bold', 'border-cyan-400');
      } else {
        btn.classList.add('bg-zinc-900/80', 'text-zinc-400', 'border-white/10');
        btn.classList.remove('bg-cyan-400', 'text-black', 'font-bold', 'border-cyan-400');
      }
    });

    // Kveld / Natteliv knapp
    const nightBtn = document.getElementById('btn-nightlife-toggle');
    if (nightBtn) {
      if (state.nightlifeOnly) {
        nightBtn.classList.remove('bg-zinc-900/80', 'text-zinc-400', 'border-white/10');
        nightBtn.classList.add('bg-amber-400', 'text-black', 'font-bold', 'border-amber-400', 'shadow-sm', 'shadow-amber-400/30');
      } else {
        nightBtn.classList.add('bg-zinc-900/80', 'text-zinc-400', 'border-white/10');
        nightBtn.classList.remove('bg-amber-400', 'text-black', 'font-bold', 'border-amber-400', 'shadow-sm', 'shadow-amber-400/30');
      }
    }

    // Visnings-knapper (Kort vs. Liste)
    const btnCards = document.getElementById('btn-view-cards');
    const btnList = document.getElementById('btn-view-list');
    if (btnCards && btnList) {
      if (state.viewMode === 'list') {
        btnList.classList.add('bg-cyan-400', 'text-black', 'font-bold');
        btnList.classList.remove('text-zinc-400');
        btnCards.classList.remove('bg-cyan-400', 'text-black', 'font-bold');
        btnCards.classList.add('text-zinc-400');
      } else {
        btnCards.classList.add('bg-cyan-400', 'text-black', 'font-bold');
        btnCards.classList.remove('text-zinc-400');
        btnList.classList.remove('bg-cyan-400', 'text-black', 'font-bold');
        btnList.classList.add('text-zinc-400');
      }
    }
  }

  // 25. Initialisering av hendelseslyttere
  function initEvents() {
    // Tidsfilter
    document.querySelectorAll('.btn-time-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.timeFilter = e.currentTarget.getAttribute('data-filter');
        updateActiveFilterPills();
        applyFilters();
      });
    });

    // Kategori-filter
    document.querySelectorAll('.btn-cat-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.categoryFilter = e.currentTarget.getAttribute('data-category');
        updateActiveFilterPills();
        applyFilters();
      });
    });

    // Bydels-filter
    document.querySelectorAll('.btn-district-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.districtFilter = e.currentTarget.getAttribute('data-district');
        updateActiveFilterPills();
        applyFilters();
      });
    });

    // Kveld / Natteliv hurtigknapp
    const nightBtn = document.getElementById('btn-nightlife-toggle');
    if (nightBtn) {
      nightBtn.addEventListener('click', () => {
        state.nightlifeOnly = !state.nightlifeOnly;
        updateActiveFilterPills();
        applyFilters();
      });
    }

    // Visningsvelger (Kort vs. Liste)
    const btnCards = document.getElementById('btn-view-cards');
    const btnList = document.getElementById('btn-view-list');
    if (btnCards) {
      btnCards.addEventListener('click', () => {
        state.viewMode = 'cards';
        try { localStorage.setItem(CONFIG.STORAGE_VIEW_KEY, 'cards'); } catch (e) {}
        updateActiveFilterPills();
        renderEventContainer();
      });
    }
    if (btnList) {
      btnList.addEventListener('click', () => {
        state.viewMode = 'list';
        try { localStorage.setItem(CONFIG.STORAGE_VIEW_KEY, 'list'); } catch (e) {}
        updateActiveFilterPills();
        renderEventContainer();
      });
    }

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

  // 26. Oppstart
  document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    updateActiveFilterPills();
    loadEvents();
  });

})();
