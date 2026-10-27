'use strict';

const STORAGE_KEY = 'budget.v1';
const LIBRARY_KEY = 'budget.library.v1';
const MAX_PAGES = 50;
const MAX_PAGE_NAME = 60;

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly', factor: 4 },
  { value: 'biweekly', label: 'Bi-weekly', factor: 2 },
  { value: 'monthly', label: 'Monthly', factor: 1 },
  { value: 'quarterly', label: 'Quarterly', factor: 1 / 3 },
  { value: 'yearly', label: 'Yearly', factor: 1 / 12 },
];
const FREQ_MAP = new Map(FREQUENCIES.map((item) => [item.value, item]));

const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD',
  'IDR', 'PHP', 'INR', 'JPY', 'SGD', 'ZAR',
  'BRL', 'MXN', 'NGN', 'KES',
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const uid = () => (
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const pad2 = (value) => String(value).padStart(2, '0');

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
};

const monthKeyOffset = (key, offset) => {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
};

const monthsBetween = (fromKey, toKey) => {
  const [fromYear, fromMonth] = fromKey.split('-').map(Number);
  const [toYear, toMonth] = toKey.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
};

function monthLabel(key) {
  if (!key || !MONTH_RE.test(key)) return '';
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
}

const defaultGoalDate = () => monthKeyOffset(currentMonthKey(), 12);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]);

/* State */

const defaultState = () => ({
  currency: 'USD',
  savings: { mode: 'percent', value: 20 },
  goal: { current: 0, target: 0, date: defaultGoalDate() },
  income: [],
  categories: [],
});

let state = loadState();
let library = loadLibrary();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return normalize(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function normalize(raw) {
  const next = defaultState();
  if (!raw || typeof raw !== 'object') return next;

  if (CURRENCIES.includes(raw.currency)) next.currency = raw.currency;

  if (raw.savings && typeof raw.savings === 'object') {
    if (raw.savings.mode === 'amount' || raw.savings.mode === 'percent') {
      next.savings.mode = raw.savings.mode;
    }
    next.savings.value = Math.max(0, toNumber(raw.savings.value));
  }

  if (raw.goal && typeof raw.goal === 'object') {
    next.goal.current = Math.max(0, toNumber(raw.goal.current));
    next.goal.target = Math.max(0, toNumber(raw.goal.target));
    if (typeof raw.goal.date === 'string') {
      next.goal.date = MONTH_RE.test(raw.goal.date.trim()) ? raw.goal.date.trim() : '';
    }
  }

  if (Array.isArray(raw.income)) {
    next.income = raw.income.slice(0, 50).map((item) => ({
      id: String(item?.id ?? uid()),
      name: String(item?.name ?? ''),
      amount: Math.max(0, toNumber(item?.amount)),
      freq: FREQ_MAP.has(item?.freq) ? item.freq : 'monthly',
    }));
  }

  if (Array.isArray(raw.categories)) {
    next.categories = raw.categories.slice(0, 100).map((item) => ({
      id: String(item?.id ?? uid()),
      name: String(item?.name ?? ''),
      amount: Math.max(0, toNumber(item?.amount)),
    }));
  }

  return next;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage may be unavailable; the app still works for this session. */
  }

  const active = activePage();
  if (active) {
    active.data = cloneState(state);
    active.updatedAt = Date.now();
    saveLibrary();
  }
}

/* Saved pages */

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return { activeId: null, pages: [] };
    return normalizeLibrary(JSON.parse(raw));
  } catch {
    return { activeId: null, pages: [] };
  }
}

function normalizeLibrary(raw) {
  const next = { activeId: null, pages: [] };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pages)) return next;

  const seen = new Set();
  for (const item of raw.pages.slice(0, MAX_PAGES)) {
    if (!item || typeof item !== 'object') continue;

    let id = String(item.id ?? '').trim();
    if (!id || seen.has(id)) id = uid();
    seen.add(id);

    const name = String(item.name ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_PAGE_NAME) || 'Untitled page';
    next.pages.push({
      id,
      name,
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      data: normalize(item.data),
    });
  }

  if (typeof raw.activeId === 'string' && next.pages.some((page) => page.id === raw.activeId)) {
    next.activeId = raw.activeId;
  }

  return next;
}

function saveLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    /* Keep working in memory if storage is unavailable. */
  }
}

function activePage() {
  if (!library.activeId) return null;
  return library.pages.find((page) => page.id === library.activeId) ?? null;
}

/* Money */

let formatter = { key: '', format: null };

function money(value) {
  const rounded = Math.round(toNumber(value) * 100) / 100;
  const hasCents = Math.abs(rounded % 1) > 0.0001;
  const key = `${state.currency}:${hasCents}`;

  if (formatter.key !== key) {
    formatter = {
      key,
      format: new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: state.currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: hasCents ? 2 : 0,
      }),
    };
  }

  return formatter.format.format(rounded);
}

function currencySymbol() {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: state.currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}

/* Calculations */

function monthlyIncome() {
  return state.income.reduce((total, item) => {
    const frequency = FREQ_MAP.get(item.freq) ?? FREQ_MAP.get('monthly');
    return total + item.amount * frequency.factor;
  }, 0);
}

function monthlyExpenses() {
  return state.categories.reduce((total, item) => total + item.amount, 0);
}

function monthlySavings(income = monthlyIncome()) {
  if (state.savings.mode === 'percent') {
    return income * clamp(state.savings.value, 0, 100) / 100;
  }
  return Math.max(0, state.savings.value);
}

/* Rendering */

function incomeRow(item) {
  const options = FREQUENCIES.map(({ value, label }) => (
    `<option value="${value}"${item.freq === value ? ' selected' : ''}>${label}</option>`
  )).join('');

  return `
    <div class="row income-row" data-id="${escapeHtml(item.id)}">
      <input class="field name" data-field="name" type="text" value="${escapeHtml(item.name)}" placeholder="Paycheck" aria-label="Income name" autocomplete="off">
      <div class="money">
        <span class="prefix" data-currency>${currencySymbol()}</span>
        <input class="field num" data-field="amount" type="number" min="0" step="1" inputmode="decimal" value="${item.amount || ''}" placeholder="0" aria-label="Income amount">
      </div>
      <select class="field select" data-field="freq" aria-label="Income frequency">${options}</select>
      <button type="button" class="icon" data-action="remove" aria-label="Remove income">&times;</button>
    </div>`;
}

function categoryRow(item) {
  return `
    <div class="row cat-row" data-id="${escapeHtml(item.id)}">
      <input class="field name" data-field="name" type="text" value="${escapeHtml(item.name)}" placeholder="Groceries" aria-label="Category name" autocomplete="off">
      <div class="money">
        <span class="prefix" data-currency>${currencySymbol()}</span>
        <input class="field num" data-field="amount" type="number" min="0" step="1" inputmode="decimal" value="${item.amount || ''}" placeholder="0" aria-label="Monthly budget for ${escapeHtml(item.name || 'category')}">
      </div>
      <button type="button" class="icon" data-action="remove" aria-label="Remove category">&times;</button>
    </div>`;
}

function renderCurrency() {
  const select = $('#currency');
  select.innerHTML = CURRENCIES.map((code) => `<option value="${code}">${code}</option>`).join('');
  select.value = state.currency;
}

function renderIncome() {
  const list = $('#incomeList');
  if (!state.income.length) {
    list.innerHTML = '<p class="empty">No income yet. Add your paycheck, a side gig, or any other money coming in.</p>';
    return;
  }
  list.innerHTML = state.income.map(incomeRow).join('');
}

function renderCategories() {
  const list = $('#categoryList');
  if (!state.categories.length) {
    list.innerHTML = '<p class="empty">No categories yet. Add the things you spend on — rent, groceries, eating out.</p>';
    return;
  }
  list.innerHTML = state.categories.map(categoryRow).join('');
}

function renderSavings() {
  $$('.seg button').forEach((button) => {
    const active = button.dataset.mode === state.savings.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const percent = state.savings.mode === 'percent';
  $('#savValue').value = state.savings.value;
  $('#savPrefix').hidden = percent;
  $('#savSuffix').hidden = !percent;
}

function renderGoal() {
  $('#goalCurrent').value = state.goal.current || '';
  $('#goalTarget').value = state.goal.target || '';
  $('#goalDate').value = state.goal.date || '';
}

function renderAll() {
  renderCurrency();
  renderIncome();
  renderCategories();
  renderSavings();
  renderGoal();
  renderPages();
  update();
}

/* Live totals */

function update() {
  const income = monthlyIncome();
  const expenses = monthlyExpenses();
  const savings = monthlySavings(income);
  const assigned = expenses + savings;
  const leftover = income - assigned;
  const over = leftover < -0.005;

  $('#sumIncome').textContent = money(income);
  $('#sumExpenses').textContent = money(expenses);
  $('#sumSavings').textContent = money(savings);
  $('#incomeTotal').textContent = money(income);
  $('#expenseTotal').textContent = money(expenses);
  $('#savingsTotal').textContent = money(savings);

  $('#leftoverLabel').textContent = over ? 'Over budget' : 'Left to budget';
  $('#leftover').textContent = money(Math.abs(leftover));
  $('#summary').classList.toggle('over', over);

  if (income <= 0) {
    $('#status').textContent = 'Add your income to get started.';
  } else if (over) {
    $('#status').textContent = `Trim ${money(-leftover)} to balance this month.`;
  } else if (leftover > 0.005) {
    $('#status').textContent = `${money(leftover)} still unassigned this month.`;
  } else {
    $('#status').textContent = 'Every dollar has a job.';
  }

  const share = income > 0 ? (assigned / income) * 100 : 0;
  $('#assignedPct').textContent = income > 0 ? `${Math.round(share)}% assigned` : 'Nothing assigned yet';
  $('#assignedSum').textContent = income > 0 ? `${money(assigned)} of ${money(income)}` : money(assigned);

  $('#barExpenses').style.width = `${income > 0 ? Math.min(100, (expenses / income) * 100) : 0}%`;
  $('#barSavings').style.width = `${income > 0 ? Math.min(100, (savings / income) * 100) : 0}%`;

  if (state.savings.mode === 'percent') {
    $('#savHint').textContent = income > 0
      ? `${clamp(state.savings.value, 0, 100)}% of ${money(income)} monthly income.`
      : 'A share of your monthly income, set aside first.';
  } else {
    $('#savHint').textContent = income > 0
      ? `${Math.round((savings / income) * 100)}% of your monthly income.`
      : 'A fixed amount set aside each month.';
  }

  const symbol = currencySymbol();
  $$('[data-currency]').forEach((node) => { node.textContent = symbol; });

  updateGoal();
}

/* Savings goal */

function updateGoal() {
  const today = currentMonthKey();
  const monthly = monthlySavings();
  const { current, target, date } = state.goal;
  const months = date ? monthsBetween(today, date) : 0;
  const projected = current + monthly * Math.max(0, months);
  const reached = target > 0 && current >= target;
  const progress = target > 0 ? clamp((current / target) * 100, 0, 100) : 0;

  $('#goalProgress').textContent = target <= 0
    ? 'No goal set'
    : reached
      ? 'Goal reached'
      : `${money(current)} of ${money(target)}`;
  $('#goalBar').style.width = `${progress}%`;
  $('#goalMonthly').textContent = money(monthly);
  $('#goalDate').min = today;

  if (target <= 0) {
    $('#goalReached').textContent = '—';
  } else if (reached) {
    $('#goalReached').textContent = 'Reached';
  } else if (monthly > 0) {
    const monthsToGoal = Math.ceil((target - current) / monthly);
    $('#goalReached').textContent = monthLabel(monthKeyOffset(today, monthsToGoal));
  } else {
    $('#goalReached').textContent = '—';
  }

  if (date) {
    $('#goalProjectedLabel').textContent = `By ${monthLabel(date)}`;
    $('#goalProjected').textContent = money(projected);
  } else {
    $('#goalProjectedLabel').textContent = 'Projected';
    $('#goalProjected').textContent = '—';
  }

  let note;
  if (!date) {
    note = 'Pick a target month to see where your savings would be.';
  } else if (target <= 0) {
    note = `At ${money(monthly)}/mo, you'd have ${money(projected)} by ${monthLabel(date)}. Set a goal amount to track progress.`;
  } else if (reached) {
    note = `Goal already reached. At ${money(monthly)}/mo, you'd have ${money(projected)} by ${monthLabel(date)}.`;
  } else if (monthly <= 0) {
    note = 'Add a monthly savings amount above to project growth.';
  } else if (months <= 0) {
    note = 'Pick a later target month to plan your monthly savings.';
  } else if (projected >= target) {
    const extra = projected - target;
    note = extra < 0.01
      ? `You'd hit your goal right on target by ${monthLabel(date)}.`
      : `You'd be ${money(extra)} over your goal by ${monthLabel(date)}.`;
  } else {
    const required = Math.ceil((target - current) / months);
    note = `${money(target - projected)} short by ${monthLabel(date)}. Raise your monthly savings to ${money(required)} to hit it.`;
  }

  $('#goalNote').textContent = note;
}

/* Saved pages */

const COPY_ICON = `
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.5"></rect>
    <path d="M3.25 10.75V3.25h7.5"></path>
  </svg>`;

function blankState(currency = 'USD') {
  return {
    ...defaultState(),
    currency,
    savings: { mode: 'percent', value: 0 },
    goal: { current: 0, target: 0, date: '' },
  };
}

function pageHasData(data) {
  return data.income.length > 0
    || data.categories.length > 0
    || data.goal.current > 0
    || data.goal.target > 0;
}

function nextPageName() {
  let index = library.pages.length + 1;
  let name = `Budget ${index}`;
  while (library.pages.some((page) => page.name === name)) {
    index += 1;
    name = `Budget ${index}`;
  }
  return name;
}

function uniquePageName(value) {
  const base = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_PAGE_NAME) || 'Untitled page';
  if (!library.pages.some((page) => page.name === base)) return base;

  let index = 2;
  let name;
  do {
    const suffix = ` ${index}`;
    name = `${base.slice(0, MAX_PAGE_NAME - suffix.length).trimEnd()}${suffix}`;
    index += 1;
  } while (library.pages.some((page) => page.name === name));
  return name;
}

function copyPageName(name) {
  const match = name.match(/^(.*) copy(?: (\d+))?$/);
  if (!match) return uniquePageName(`${name} copy`);

  const base = match[1];
  const index = Number(match[2] ?? 1) + 1;
  return uniquePageName(`${base} copy ${index}`);
}

function pageMeta(data) {
  const income = data.income.length;
  const categories = data.categories.length;
  if (!income && !categories) return 'Empty';
  return `${income} income · ${categories} ${categories === 1 ? 'category' : 'categories'}`;
}

function renderPages() {
  const list = $('#pageList');
  const count = $('#pageCount');
  const hint = $('#pagesHint');
  if (!list || !count || !hint) return;

  count.textContent = String(library.pages.length);
  if (!library.pages.length) {
    hint.textContent = 'Save the current budget to keep a version you can reopen.';
  } else if (library.activeId) {
    hint.textContent = 'Edits save to the open page automatically.';
  } else {
    hint.textContent = 'Open a page to edit it, or save this page as a new one.';
  }

  if (!library.pages.length) {
    list.innerHTML = '<li class="pages-empty">No saved pages yet.</li>';
    return;
  }

  list.innerHTML = library.pages.map((page) => {
    const active = page.id === library.activeId;
    return `
      <li class="page-item${active ? ' active' : ''}" data-id="${escapeHtml(page.id)}">
        <button type="button" class="page-open" data-action="open"${active ? ' aria-current="page"' : ''} title="${escapeHtml(page.name)}">
          <span class="page-name">${escapeHtml(page.name)}</span>
          <span class="page-meta">${pageMeta(page.data)}</span>
        </button>
        <div class="page-tools">
          <button type="button" class="page-tool" data-action="duplicate" title="Duplicate ${escapeHtml(page.name)}" aria-label="Duplicate ${escapeHtml(page.name)}">${COPY_ICON}</button>
          <button type="button" class="page-tool page-tool-delete" data-action="delete" title="Delete ${escapeHtml(page.name)}" aria-label="Delete ${escapeHtml(page.name)}">&times;</button>
        </div>
      </li>`;
  }).join('');
}

function saveCurrentPage() {
  if (library.pages.length >= MAX_PAGES) {
    window.alert(`You can save up to ${MAX_PAGES} pages.`);
    return;
  }

  const active = activePage();
  const suggested = active
    ? copyPageName(active.name)
    : nextPageName();
  const input = window.prompt('Name this saved page', suggested);
  if (input === null) return;

  const page = {
    id: uid(),
    name: uniquePageName(String(input).trim() || suggested),
    updatedAt: Date.now(),
    data: cloneState(state),
  };

  library.pages.push(page);
  library.activeId = page.id;
  saveLibrary();
  saveState();
  renderPages();
}

function canReplaceCurrent() {
  if (library.activeId || !pageHasData(state)) return true;
  return window.confirm('Replace the current unsaved page? It has not been saved to the sidebar.');
}

function openPage(id) {
  const page = library.pages.find((entry) => entry.id === id);
  if (!page || page.id === library.activeId || !canReplaceCurrent()) return;

  library.activeId = page.id;
  state = normalize(page.data);
  saveLibrary();
  saveState();
  renderAll();
}

function duplicatePage(id) {
  const original = library.pages.find((entry) => entry.id === id);
  if (!original) return;

  if (library.pages.length >= MAX_PAGES) {
    window.alert(`You can save up to ${MAX_PAGES} pages.`);
    return;
  }
  if (!canReplaceCurrent()) return;

  const copy = {
    id: uid(),
    name: copyPageName(original.name),
    updatedAt: Date.now(),
    data: cloneState(original.data),
  };

  library.pages.push(copy);
  library.activeId = copy.id;
  state = normalize(copy.data);
  saveLibrary();
  saveState();
  renderAll();
}

function deletePage(id) {
  const page = library.pages.find((entry) => entry.id === id);
  if (!page) return;

  const active = page.id === library.activeId;
  const message = active
    ? `Delete the open page "${page.name}"? The editor will be cleared and this cannot be undone.`
    : `Delete "${page.name}"? This cannot be undone.`;
  if (!window.confirm(message)) return;

  library.pages = library.pages.filter((entry) => entry.id !== id);
  if (!active) {
    saveLibrary();
    renderPages();
    return;
  }

  library.activeId = null;
  saveLibrary();
  state = blankState(state.currency);
  saveState();
  renderAll();
}

function clearCurrentPage() {
  if (!window.confirm('Clear this page? Saved pages will stay in the sidebar.')) return;

  library.activeId = null;
  saveLibrary();
  state = blankState(state.currency);
  saveState();
  renderAll();
}

function handlePageAction(event) {
  const button = event.target.closest('[data-action]');
  const item = button && button.closest('.page-item');
  const page = item && library.pages.find((entry) => entry.id === item.dataset.id);
  if (!button || !page) return;

  if (button.dataset.action === 'open') openPage(page.id);
  else if (button.dataset.action === 'duplicate') duplicatePage(page.id);
  else if (button.dataset.action === 'delete') deletePage(page.id);
}

function bindPages() {
  $('#pageList').addEventListener('click', handlePageAction);
  $('#savePageBtn').addEventListener('click', saveCurrentPage);
}

/* Events */

function bindIncome() {
  const list = $('#incomeList');

  list.addEventListener('input', (event) => {
    const row = event.target.closest('.row');
    const item = row && state.income.find((entry) => entry.id === row.dataset.id);
    if (!item) return;

    const field = event.target.dataset.field;
    if (field === 'name') {
      item.name = event.target.value;
    } else if (field === 'amount') {
      item.amount = Math.max(0, toNumber(event.target.value));
    } else {
      return;
    }

    saveState();
    update();
  });

  list.addEventListener('change', (event) => {
    if (event.target.dataset.field !== 'freq') return;

    const row = event.target.closest('.row');
    const item = row && state.income.find((entry) => entry.id === row.dataset.id);
    if (!item || !FREQ_MAP.has(event.target.value)) return;

    item.freq = event.target.value;
    saveState();
    update();
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="remove"]');
    if (!button) return;

    const row = button.closest('.row');
    state.income = state.income.filter((entry) => entry.id !== row.dataset.id);
    saveState();
    renderIncome();
    renderPages();
    update();
  });
}

function bindCategories() {
  const list = $('#categoryList');

  list.addEventListener('input', (event) => {
    const row = event.target.closest('.row');
    const item = row && state.categories.find((entry) => entry.id === row.dataset.id);
    if (!item) return;

    const field = event.target.dataset.field;
    if (field === 'name') {
      item.name = event.target.value;
      const amount = row.querySelector('[data-field="amount"]');
      if (amount) amount.setAttribute('aria-label', `Monthly budget for ${item.name || 'category'}`);
    } else if (field === 'amount') {
      item.amount = Math.max(0, toNumber(event.target.value));
    } else {
      return;
    }

    saveState();
    update();
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="remove"]');
    if (!button) return;

    const row = button.closest('.row');
    state.categories = state.categories.filter((entry) => entry.id !== row.dataset.id);
    saveState();
    renderCategories();
    renderPages();
    update();
  });
}

function bindControls() {
  $('#addIncome').addEventListener('click', () => {
    state.income.push({ id: uid(), name: '', amount: 0, freq: 'monthly' });
    saveState();
    renderIncome();
    renderPages();
    update();
    const rows = $$('#incomeList .income-row');
    rows.at(-1)?.querySelector('.name')?.focus();
  });

  $('#addCategory').addEventListener('click', () => {
    state.categories.push({ id: uid(), name: '', amount: 0 });
    saveState();
    renderCategories();
    renderPages();
    update();
    const rows = $$('#categoryList .cat-row');
    rows.at(-1)?.querySelector('.name')?.focus();
  });

  $$('.seg button').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      if (mode === state.savings.mode) return;

      const income = monthlyIncome();
      const current = monthlySavings(income);

      if (mode === 'amount') {
        state.savings.value = Math.round(current);
      } else {
        state.savings.value = income > 0
          ? clamp(Math.round((current / income) * 100), 0, 100)
          : 20;
      }

      state.savings.mode = mode;
      saveState();
      renderSavings();
      update();
    });
  });

  $('#savValue').addEventListener('input', (event) => {
    const value = Math.max(0, toNumber(event.target.value));
    state.savings.value = state.savings.mode === 'percent' ? Math.min(value, 100) : value;
    saveState();
    update();
  });

  $('#savValue').addEventListener('change', (event) => {
    event.target.value = state.savings.value;
  });

  $('#goalCurrent').addEventListener('input', (event) => {
    state.goal.current = Math.max(0, toNumber(event.target.value));
    saveState();
    update();
  });

  $('#goalTarget').addEventListener('input', (event) => {
    state.goal.target = Math.max(0, toNumber(event.target.value));
    saveState();
    update();
  });

  $('#goalDate').addEventListener('change', (event) => {
    const value = event.target.value;
    state.goal.date = MONTH_RE.test(value) ? value : '';
    saveState();
    update();
  });

  $('#currency').addEventListener('change', (event) => {
    state.currency = event.target.value;
    saveState();
    update();
  });

  $('#clearPageBtn').addEventListener('click', clearCurrentPage);
}

/* Start */

bindIncome();
bindCategories();
bindControls();
bindPages();
renderAll();
