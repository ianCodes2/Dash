/* ============================================================
   Northstar Goals — core helpers
   Classic script. Everything hangs off window.NG.
   ============================================================ */
(function (NG) {
  'use strict';

  const KG_TO_LB = 2.2046226218;

  const CURRENCIES = {
    USD: { label: 'US Dollar', locale: 'en-US', decimals: 2, symbol: '$' },
    IDR: { label: 'Indonesian Rupiah', locale: 'id-ID', decimals: 0, symbol: 'Rp' },
    EUR: { label: 'Euro', locale: 'de-DE', decimals: 2, symbol: '€' },
    GBP: { label: 'British Pound', locale: 'en-GB', decimals: 2, symbol: '£' },
    AUD: { label: 'Australian Dollar', locale: 'en-AU', decimals: 2, symbol: 'A$' },
    CAD: { label: 'Canadian Dollar', locale: 'en-CA', decimals: 2, symbol: 'C$' },
    SGD: { label: 'Singapore Dollar', locale: 'en-SG', decimals: 2, symbol: 'S$' },
    JPY: { label: 'Japanese Yen', locale: 'ja-JP', decimals: 0, symbol: '¥' },
    MYR: { label: 'Malaysian Ringgit', locale: 'ms-MY', decimals: 2, symbol: 'RM' },
    PHP: { label: 'Philippine Peso', locale: 'en-PH', decimals: 2, symbol: '₱' }
  };

  const JAR_COLORS = [
    '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
    '#ef4444', '#db2777', '#8b5cf6', '#14b8a6'
  ];

  const PERSON_COLORS = [
    '#4338ca', '#be123c', '#0f766e', '#b45309',
    '#7e22ce', '#0369a1', '#4d7c0f', '#9f1239'
  ];

  const JAR_COLOR_NAMES = {
    '#6366f1': 'Indigo', '#0ea5e9': 'Sky', '#10b981': 'Emerald',
    '#f59e0b': 'Amber', '#ef4444': 'Red', '#db2777': 'Pink',
    '#8b5cf6': 'Violet', '#14b8a6': 'Teal'
  };

  const PERSON_COLOR_NAMES = {
    '#4338ca': 'Indigo', '#be123c': 'Rose', '#0f766e': 'Teal',
    '#b45309': 'Amber', '#7e22ce': 'Violet', '#0369a1': 'Sky',
    '#4d7c0f': 'Olive', '#9f1239': 'Wine'
  };

  const ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    jar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8"/><path d="M9 3v3M15 3v3"/><path d="M7 6h10a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2Z"/><path d="M5 11h14"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 15a4 4 0 0 1 8 0"/><path d="m12 11 2.5-3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L19 7"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>',
    smartphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19a4.5 4.5 0 0 0 .4-9 6 6 0 0 0-11.6 1.7A3.7 3.7 0 0 0 7 19Z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7h.01A1.7 1.7 0 0 0 10 3.14V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01A1.7 1.7 0 0 0 20.86 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/></svg>'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const safeId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function initial(name) {
    const characters = Array.from(String(name || '?').trim());
    return (characters[0] || '?').toUpperCase();
  }

  /* ---------- dates ---------- */
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function isValidISODate(value) {
    if (!DATE_RE.test(String(value || ''))) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function parseISO(value) {
    if (!isValidISODate(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function toISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayISO() {
    return toISO(new Date());
  }

  function dayNumber(iso) {
    const [year, month, day] = iso.split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  }

  function addDaysISO(iso, days) {
    const next = dayNumber(iso) + days;
    const date = new Date(next * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function addMonthsISO(iso, months, anchorDay) {
    const [year, month, day] = iso.split('-').map(Number);
    const monthIndex = month - 1 + months;
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const targetDay = Math.min(anchorDay || day, last);
    return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
  }

  function daysBetween(a, b) {
    return dayNumber(b) - dayNumber(a);
  }

  function startOfWeekISO(iso) {
    const date = parseISO(iso);
    if (!date) return iso;
    const offset = (date.getDay() + 6) % 7;
    return addDaysISO(iso, -offset);
  }

  function weekdayOfISO(iso) {
    const date = parseISO(iso);
    return date ? date.getDay() : 0;
  }

  function nextWeekdayOnOrAfter(iso, weekday) {
    const target = clamp(Number(weekday) || 0, 0, 6);
    const difference = (target - weekdayOfISO(iso) + 7) % 7;
    return addDaysISO(iso, difference);
  }

  function weekdayName(weekday) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][clamp(Number(weekday) || 0, 0, 6)];
  }

  function weekdayShort(weekday) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][clamp(Number(weekday) || 0, 0, 6)];
  }

  function formatDate(iso, options) {
    const date = parseISO(iso);
    if (!date) return '';
    return date.toLocaleDateString(undefined, options || { month: 'short', day: 'numeric' });
  }

  function formatShortDate(iso) {
    const date = parseISO(iso);
    if (!date) return '';
    const options = { month: 'short', day: 'numeric' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString(undefined, options);
  }

  function formatLongDate(iso) {
    return formatDate(iso, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatMonthYear(iso) {
    return formatDate(iso, { month: 'long', year: 'numeric' });
  }

  function relativeDate(iso) {
    const difference = daysBetween(todayISO(), iso);
    if (difference === 0) return 'today';
    if (difference === 1) return 'tomorrow';
    if (difference === -1) return 'yesterday';
    if (difference > 1 && difference <= 7) return `in ${difference} days`;
    if (difference < -1 && difference >= -7) return `${Math.abs(difference)} days ago`;
    return formatShortDate(iso);
  }

  function formatTimestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay
      ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function ordinal(number) {
    const value = Number(number);
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
    if (value % 10 === 1) return `${value}st`;
    if (value % 10 === 2) return `${value}nd`;
    if (value % 10 === 3) return `${value}rd`;
    return `${value}th`;
  }

  /* ---------- money ---------- */
  function roundAmount(value, currency) {
    const decimals = CURRENCIES[currency] ? CURRENCIES[currency].decimals : 2;
    const factor = Math.pow(10, decimals);
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function parseAmountInput(value, currency) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    const number = Number(raw);
    if (!Number.isFinite(number)) return null;
    return roundAmount(number, currency);
  }

  function formatMoney(amount, currency) {
    const meta = CURRENCIES[currency] || CURRENCIES.USD;
    const value = Number(amount) || 0;
    const hasFraction = meta.decimals > 0 && Math.round(Math.abs(value) * 100) % 100 !== 0;
    const digits = hasFraction ? meta.decimals : 0;
    try {
      return new Intl.NumberFormat(meta.locale, {
        style: 'currency',
        currency: CURRENCIES[currency] ? currency : 'USD',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      }).format(value);
    } catch (error) {
      return `${currency} ${value.toFixed(digits)}`;
    }
  }

  function formatMoneyExact(amount, currency) {
    const meta = CURRENCIES[currency] || CURRENCIES.USD;
    try {
      return new Intl.NumberFormat(meta.locale, {
        style: 'currency',
        currency: CURRENCIES[currency] ? currency : 'USD',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: meta.decimals,
        maximumFractionDigits: meta.decimals
      }).format(Number(amount) || 0);
    } catch (error) {
      return `${currency} ${Number(amount || 0).toFixed(meta.decimals)}`;
    }
  }

  function currencySymbol(currency) {
    const meta = CURRENCIES[currency] || CURRENCIES.USD;
    try {
      const parts = new Intl.NumberFormat(meta.locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol'
      }).formatToParts(0);
      const found = parts.find((part) => part.type === 'currency');
      return found ? found.value : meta.symbol;
    } catch (error) {
      return meta.symbol;
    }
  }

  function configureAmountInput(input, currency) {
    if (!input) return;
    const decimals = CURRENCIES[currency] ? CURRENCIES[currency].decimals : 2;
    input.step = decimals === 0 ? '1' : '0.01';
    input.min = decimals === 0 ? '1' : '0.01';
  }

  /* ---------- weight ---------- */
  function weightInUnit(kg, unit) {
    return unit === 'lb' ? Number(kg) * KG_TO_LB : Number(kg);
  }

  function toKg(value, unit) {
    return unit === 'lb' ? Number(value) / KG_TO_LB : Number(value);
  }

  function displayWeight(kg, unit) {
    return weightInUnit(kg, unit).toFixed(1);
  }

  function weightText(kg, unit) {
    return `${displayWeight(kg, unit)} ${unit}`;
  }

  function roundKg(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  NG.KG_TO_LB = KG_TO_LB;
  NG.CURRENCIES = CURRENCIES;
  NG.JAR_COLORS = JAR_COLORS;
  NG.PERSON_COLORS = PERSON_COLORS;
  NG.JAR_COLOR_NAMES = JAR_COLOR_NAMES;
  NG.PERSON_COLOR_NAMES = PERSON_COLOR_NAMES;
  NG.ICONS = ICONS;
  NG.$ = $;
  NG.$$ = $$;
  NG.clamp = clamp;
  NG.esc = esc;
  NG.safeId = safeId;
  NG.makeId = makeId;
  NG.initial = initial;
  NG.isValidISODate = isValidISODate;
  NG.parseISO = parseISO;
  NG.toISO = toISO;
  NG.todayISO = todayISO;
  NG.dayNumber = dayNumber;
  NG.addDaysISO = addDaysISO;
  NG.addMonthsISO = addMonthsISO;
  NG.daysBetween = daysBetween;
  NG.startOfWeekISO = startOfWeekISO;
  NG.weekdayOfISO = weekdayOfISO;
  NG.nextWeekdayOnOrAfter = nextWeekdayOnOrAfter;
  NG.weekdayName = weekdayName;
  NG.weekdayShort = weekdayShort;
  NG.formatDate = formatDate;
  NG.formatShortDate = formatShortDate;
  NG.formatLongDate = formatLongDate;
  NG.formatMonthYear = formatMonthYear;
  NG.relativeDate = relativeDate;
  NG.formatTimestamp = formatTimestamp;
  NG.ordinal = ordinal;
  NG.roundAmount = roundAmount;
  NG.parseAmountInput = parseAmountInput;
  NG.formatMoney = formatMoney;
  NG.formatMoneyExact = formatMoneyExact;
  NG.currencySymbol = currencySymbol;
  NG.configureAmountInput = configureAmountInput;
  NG.weightInUnit = weightInUnit;
  NG.toKg = toKg;
  NG.displayWeight = displayWeight;
  NG.weightText = weightText;
  NG.roundKg = roundKg;

  NG.state = {
    data: null,
    route: null,
    ui: {
      chartRange: {},
      chartObserver: null,
      chartFrame: 0,
      installPrompt: null
    }
  };
})(window.NG = window.NG || {});
