/* ============================================================
   Northstar Goals — app shell, auth, sync, routing, actions
   ============================================================ */
(function (NG) {
  'use strict';

  const {
    $, $$, esc, makeId, todayISO, isValidISODate, weekdayOfISO, nextWeekdayOnOrAfter,
    daysBetween, clamp, formatShortDate, formatLongDate, formatMonthYear, formatMoney,
    currencySymbol, configureAmountInput, parseAmountInput, displayWeight, toKg, roundKg,
    weightText, ICONS, CURRENCIES, JAR_COLORS, PERSON_COLORS, JAR_COLOR_NAMES,
    PERSON_COLOR_NAMES, peopleList, nextPersonOrder, defaultData, defaultPerson,
    normalizeData, catchUpAll, jarTotal, firstOccurrenceOnOrAfter, runRule,
    weightStats, sortedWeighIns
  } = NG;

  const V = NG.views;
  const DATA_KEY = 'northstar.data.v1';
  const REV_KEY = 'northstar.revision.v1';
  const THEME_KEY = 'northstar.theme.v1';
  const LOCAL_DEMO = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    && new URLSearchParams(location.search).has('local');

  let data = defaultData();
  let route = null;
  let currentRouteKey = '';
  let draftJarColor = JAR_COLORS[0];
  let draftPersonColor = PERSON_COLORS[0];
  let draftPersonUnit = 'kg';
  let confirmAction = null;

  const auth = { token: '', ready: false };
  const cloud = {
    revision: 0,
    updatedAt: '',
    dirty: false,
    saving: false,
    conflict: false,
    error: '',
    applying: false,
    timer: 0,
    pollTimer: 0,
    retryDelay: 0,
    offline: false
  };

  NG.state.data = data;
  NG.state.auth = auth;
  NG.state.cloud = cloud;
  NG.state.localDemo = LOCAL_DEMO;

  /* ---------- local cache ---------- */
  function loadLocal() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.people) return null;
      const revision = Number(localStorage.getItem(REV_KEY)) || 0;
      return { data: normalizeData(parsed), revision };
    } catch (error) {
      return null;
    }
  }

  function cacheData() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      localStorage.setItem(REV_KEY, String(cloud.revision || 0));
    } catch (error) { /* storage unavailable */ }
  }

  function clearLocalData() {
    try {
      localStorage.removeItem(DATA_KEY);
      localStorage.removeItem(REV_KEY);
    } catch (error) { /* storage unavailable */ }
  }

  function cacheTheme() {
    try { localStorage.setItem(THEME_KEY, data.settings.theme); } catch (error) { /* storage unavailable */ }
  }

  function setData(next) {
    data = next;
    NG.state.data = data;
  }

  /* ---------- theme ---------- */
  function resolvedTheme() {
    const choice = data.settings.theme;
    if (choice === 'light' || choice === 'dark') return choice;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f0f12' : '#f5f3ee');
  }

  function chooseTheme(choice) {
    if (!['system', 'light', 'dark'].includes(choice)) return;
    data.settings.theme = choice;
    saveData();
    applyTheme();
    updateHeader();
    if (route && route.name === 'settings') render();
  }

  /* ---------- save + sync ---------- */
  function saveData(options = {}) {
    cacheTheme();
    cacheData();
    NG.state.data = data;

    if (LOCAL_DEMO || !auth.ready || !auth.token || cloud.offline) {
      updateSyncUi();
      return;
    }

    if (cloud.applying) return;
    cloud.dirty = true;
    cloud.error = '';
    updateSyncUi();
    scheduleFlush(options.immediate ? 0 : 550);
  }

  function scheduleFlush(delay) {
    if (cloud.timer) window.clearTimeout(cloud.timer);
    cloud.timer = window.setTimeout(() => {
      cloud.timer = 0;
      flushSave();
    }, Math.max(0, delay || 0));
  }

  async function flushSave() {
    if (!auth.token || cloud.saving || cloud.conflict || !cloud.dirty || LOCAL_DEMO) return;

    const snapshot = JSON.stringify(data);
    const sentRevision = cloud.revision;
    cloud.saving = true;
    updateSyncUi();

    try {
      const result = await NorthstarAuth.save(auth.token, data, sentRevision);

      if (result && result.error === 'conflict') {
        cloud.saving = false;
        cloud.conflict = true;
        cloud.dirty = false;
        updateSyncUi();
        return;
      }

      if (result && result.error === 'session_expired') {
        cloud.saving = false;
        handleSessionExpired();
        return;
      }

      if (result && result.error) {
        throw new Error(result.error);
      }

      cloud.revision = Number(result.revision) || cloud.revision + 1;
      cloud.updatedAt = result.updated_at || '';
      cloud.error = '';
      cloud.dirty = JSON.stringify(data) !== snapshot;
      cloud.saving = false;
      cloud.retryDelay = 0;
      cacheData();
      updateSyncUi();

      if (cloud.dirty) scheduleFlush(350);
    } catch (error) {
      cloud.saving = false;
      cloud.error = error && error.message ? error.message : 'Could not save.';
      cloud.retryDelay = Math.min(30000, Math.max(4000, (cloud.retryDelay || 2000) * 1.6));
      updateSyncUi();
      scheduleFlush(cloud.retryDelay);
    }
  }

  async function pullCloud(manual = false) {
    if (!auth.token || LOCAL_DEMO || cloud.saving || cloud.dirty || cloud.conflict) {
      if (manual && cloud.dirty) flushSave();
      return;
    }

    try {
      const result = await NorthstarAuth.load(auth.token);
      if (result && result.error === 'session_expired') {
        handleSessionExpired();
        return;
      }
      if (result && result.error) throw new Error(result.error);

      cloud.error = '';
      const remoteRevision = Number(result.revision) || 0;
      if (remoteRevision !== cloud.revision) {
        applyRemote(result);
        if (manual) showToast('Loaded the latest from the cloud');
      } else {
        cloud.updatedAt = result.updated_at || cloud.updatedAt;
        updateSyncUi();
        if (manual) showToast('Already up to date');
      }
    } catch (error) {
      if (error && error.message && /session/i.test(error.message)) {
        handleSessionExpired();
        return;
      }
      cloud.error = error && error.message ? error.message : 'Offline.';
      updateSyncUi();
      if (manual) showToast('Could not reach the cloud');
    }
  }

  function applyRemote(result) {
    cloud.applying = true;
    setData(normalizeData(result.data));
    cloud.revision = Number(result.revision) || 0;
    cloud.updatedAt = result.updated_at || '';
    cloud.conflict = false;
    cloud.dirty = false;
    cacheData();
    applyTheme();
    const generated = catchUpAll(data);
    if (!document.querySelector('dialog[open]')) render();
    updateHeader();
    updateSyncUi();
    cloud.applying = false;
    if (generated) saveData();
    showToast('Updated from another device');
  }

  function startPolling() {
    if (cloud.pollTimer) return;
    cloud.pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      pullCloud(false);
    }, 25000);
  }

  function updateSyncUi() {
    const footer = $('#syncStatus');
    if (footer) {
      let text;
      if (LOCAL_DEMO) text = 'Local preview — saved in this browser';
      else if (cloud.offline) text = 'Offline copy — reconnect to sync';
      else if (!auth.token) text = 'Not signed in';
      else if (cloud.conflict) text = 'Needs attention';
      else if (cloud.saving) text = 'Saving…';
      else if (cloud.error) text = 'Offline — saved on this device';
      else if (cloud.updatedAt) text = `Synced · ${NG.formatTimestamp(cloud.updatedAt)}`;
      else text = 'Connected';
      footer.textContent = text;
    }

    const banner = $('#syncBanner');
    if (banner) banner.hidden = !cloud.conflict;

    const bannerText = $('#syncBannerText');
    if (bannerText) {
      bannerText.textContent = cloud.conflict
        ? 'Another device saved newer changes. Keep this device’s version or load the latest.'
        : '';
    }

    const stateLine = $('#cloudState');
    if (stateLine) {
      if (LOCAL_DEMO) stateLine.textContent = 'Local preview — not connected to Supabase.';
      else if (cloud.conflict) stateLine.textContent = 'Another device saved newer changes.';
      else if (cloud.saving) stateLine.textContent = 'Saving changes…';
      else if (cloud.error) stateLine.textContent = `Offline — ${cloud.error}`;
      else if (cloud.updatedAt) stateLine.textContent = `Synced · last save ${NG.formatTimestamp(cloud.updatedAt)}`;
      else if (auth.token) stateLine.textContent = 'Connected. Changes save automatically.';
      else stateLine.textContent = 'Not signed in.';
    }
  }

  function handleSessionExpired() {
    auth.token = '';
    auth.ready = false;
    cloud.dirty = false;
    cloud.saving = false;
    cloud.conflict = false;
    cloud.error = '';
    NorthstarAuth.clearSession();

    if (cloud.pollTimer) {
      window.clearInterval(cloud.pollTimer);
      cloud.pollTimer = 0;
    }

    $('#appShell').hidden = true;
    $('#authScreen').hidden = false;
    $('#authCard').innerHTML = '';
    mountAuthGate('Your session expired. Enter the PIN to continue.');
  }

  /* ---------- routing ---------- */
  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (error) { return value; }
  }

  function fallbackRoute() {
    const people = peopleList(data);
    const personId = data.people[data.settings.lastPerson] ? data.settings.lastPerson : people[0].id;
    return { name: data.settings.lastView || 'savings', personId, replace: true };
  }

  function parseRoute() {
    const raw = String(location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean).map(safeDecode);
    const fallback = fallbackRoute();

    if (!parts.length) return fallback;
    if (parts[0] === 'settings') return { name: 'settings' };

    if (parts[0] === 'savings' || parts[0] === 'weight') {
      const view = parts[0];
      const personId = parts[1] && data.people[parts[1]] ? parts[1] : fallback.personId;
      if (view === 'savings' && parts[2] === 'jar' && parts[3]) {
        const person = data.people[personId];
        const jar = person.jars.find((item) => item.id === parts[3]);
        if (jar) return { name: 'jar', personId, jarId: jar.id };
        return { name: 'savings', personId, replace: true };
      }
      return { name: view, personId, replace: personId !== parts[1] };
    }

    if (data.people[parts[0]]) {
      return { name: fallback.name, personId: parts[0], replace: true };
    }

    return fallback;
  }

  function canonicalHash(value) {
    if (!value) return '#/';
    if (value.name === 'settings') return '#/settings';
    if (value.name === 'jar') return `#/savings/${encodeURIComponent(value.personId)}/jar/${encodeURIComponent(value.jarId)}`;
    return `#/${value.name}/${encodeURIComponent(value.personId)}`;
  }

  function routeKey(value) {
    if (!value) return '';
    if (value.name === 'settings') return 'settings';
    if (value.name === 'jar') return `${value.personId}/jar/${value.jarId}`;
    return `${value.name}/${value.personId}`;
  }

  function rememberRoutePerson() {
    if (!route || route.name === 'settings' || !route.personId) return;
    let changed = false;
    if (data.settings.lastPerson !== route.personId) {
      data.settings.lastPerson = route.personId;
      changed = true;
    }
    const view = route.name === 'weight' ? 'weight' : 'savings';
    if (data.settings.lastView !== view) {
      data.settings.lastView = view;
      changed = true;
    }
    if (changed) saveData();
  }

  function updateHeader() {
    const theme = resolvedTheme();
    const themeButton = $('#themeToggle');
    if (themeButton) {
      themeButton.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
      themeButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }

    const settingsLink = $('#settingsLink');
    if (settingsLink) {
      if (route && route.name === 'settings') settingsLink.setAttribute('aria-current', 'page');
      else settingsLink.removeAttribute('aria-current');
    }

    const personId = route && route.personId ? route.personId : data.settings.lastPerson;
    const person = data.people[personId];
    const navSavings = $('#navSavings');
    const navWeight = $('#navWeight');
    if (navSavings) {
      navSavings.href = `#/savings/${encodeURIComponent(personId)}`;
      navSavings.removeAttribute('aria-current');
      if (route && route.name === 'savings') navSavings.setAttribute('aria-current', 'page');
    }
    if (navWeight) {
      navWeight.href = `#/weight/${encodeURIComponent(personId)}`;
      navWeight.removeAttribute('aria-current');
      if (route && route.name === 'weight') navWeight.setAttribute('aria-current', 'page');
    }

    const switchSlot = $('#personSwitch');
    if (switchSlot) {
      if (route && route.name === 'settings') {
        switchSlot.innerHTML = '';
      } else {
        const view = route && route.name === 'weight' ? 'weight' : 'savings';
        switchSlot.innerHTML = V.personSwitchHTML(route && route.personId ? route.personId : personId, view);
      }
    }

    if (person) {
      document.documentElement.style.setProperty('--person-accent', person.accent);
    }

    if (route) {
      const active = data.people[route.personId];
      if (route.name === 'settings') document.title = 'Settings · Northstar';
      else if (route.name === 'jar') {
        const jar = active && active.jars.find((item) => item.id === route.jarId);
        document.title = `${jar ? jar.name : 'Goal'} · Northstar`;
      } else if (route.name === 'weight') document.title = `${active ? active.name : 'Goals'} · Weight`;
      else document.title = `${active ? active.name : 'Goals'} · Savings`;
    }
  }

  function render(options = {}) {
    const previousKey = currentRouteKey;
    const scrollY = window.scrollY;
    route = parseRoute();
    NG.state.route = route;

    if (route.replace) {
      history.replaceState(null, '', canonicalHash(route));
    }

    const generated = catchUpAll(data);
    if (generated) saveData();

    const view = $('#view');
    if (!view) return;

    if (route.name === 'settings') {
      delete document.documentElement.dataset.person;
      view.innerHTML = V.settingsPageHTML();
    } else if (route.name === 'weight') {
      document.documentElement.dataset.person = route.personId;
      view.innerHTML = V.weightPageHTML(data.people[route.personId]);
    } else if (route.name === 'jar') {
      document.documentElement.dataset.person = route.personId;
      const person = data.people[route.personId];
      const jar = person.jars.find((item) => item.id === route.jarId);
      view.innerHTML = jar ? V.jarPageHTML(person, jar) : V.savingsPageHTML(person);
    } else {
      document.documentElement.dataset.person = route.personId;
      view.innerHTML = V.savingsPageHTML(data.people[route.personId]);
    }

    updateHeader();
    updateSyncUi();

    const key = routeKey(route);
    if (options.scrollTop || !previousKey || key !== previousKey) {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, scrollY);
    }
    currentRouteKey = key;

    if (route.name === 'weight') V.setupChart();
    else V.teardownChart();

    if (route.name === 'savings') {
      const person = data.people[route.personId];
      const amount = $('#quickAmount');
      if (amount) configureAmountInput(amount, person.currency);
    }

    if (generated) {
      window.setTimeout(() => {
        showToast(`${generated} recurring contribution${generated === 1 ? '' : 's'} added`);
      }, 350);
    }
  }

  /* ---------- auth boot ---------- */
  function gateOptions(message) {
    return {
      mount: $('#authCard'),
      eyebrow: 'Northstar goals',
      title: 'Enter your PIN',
      subtitle: 'One PIN opens the hub and this tracker on every device.',
      setupTitle: 'Create your PIN',
      setupSubtitle: 'Choose a 6–12 digit PIN. It protects your goals, weigh-ins, and the hub.',
      setupData: () => {
        const local = loadLocal();
        return local ? local.data : defaultData();
      },
      offlineData: (() => {
        const local = loadLocal();
        return local ? local.data : null;
      })(),
      onUnlock: enterApp
    };
  }

  function mountAuthGate(message) {
    if (!window.NorthstarAuth) {
      $('#authCard').innerHTML = '<div class="gate-card"><h1 class="gate-title">Supabase client missing</h1><p class="gate-text">shared/auth.js did not load. Check the file path.</p></div>';
      return;
    }
    const options = gateOptions(message);
    if (message) options.subtitle = message;
    NorthstarAuth.mountGate(options);
  }

  function enterApp(result) {
    if (result) {
      auth.token = result.token || '';
      auth.ready = true;
      cloud.revision = Number(result.revision) || 0;
      cloud.updatedAt = result.updated_at || '';
      cloud.offline = !!result.offline;
      const source = result.data || (loadLocal() || {}).data || defaultData();
      setData(normalizeData(source));
      const generated = catchUpAll(data);
      if (generated) {
        // The next save carries the generated entries.
        cloud.dirty = true;
      }
      cacheData();
      applyTheme();
    }

    $('#authScreen').hidden = true;
    $('#appShell').hidden = false;

    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      history.replaceState(null, '', canonicalHash(fallbackRoute()));
    }

    render({ scrollTop: true });
    rememberRoutePerson();
    updateSyncUi();

    if (auth.token) startPolling();

    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker, { once: true });

    if (cloud.dirty) scheduleFlush(400);
  }

  function lockApp() {
    if (LOCAL_DEMO) {
      window.location.reload();
      return;
    }

    const session = NorthstarAuth.getSession();
    NorthstarAuth.clearSession();
    clearLocalData();

    if (cloud.pollTimer) {
      window.clearInterval(cloud.pollTimer);
      cloud.pollTimer = 0;
    }

    if (session && session.token && !LOCAL_DEMO) {
      NorthstarAuth.signOut(session.token).catch(() => {});
    }

    window.location.reload();
  }

  /* ---------- toasts ---------- */
  function showToast(message, options = {}) {
    const container = $('#toasts');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast__text">${esc(message)}</span>`;

    if (options.actionLabel && typeof options.onAction === 'function') {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast__action';
      action.textContent = options.actionLabel;
      action.addEventListener('click', () => {
        options.onAction();
        removeToast(toast);
      });
      toast.appendChild(action);
    }

    container.appendChild(toast);
    window.requestAnimationFrame(() => toast.classList.add('is-in'));

    toast._remove = () => removeToast(toast);
    window.setTimeout(() => removeToast(toast), options.duration || 3600);
  }

  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    if (toast._remove) toast._remove = null;
    toast.classList.remove('is-in');
    window.setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  }

  /* ---------- sheets ---------- */
  function openSheet(id, options = {}) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (!options.stack) {
      $$('dialog[open]').forEach((item) => {
        if (item !== dialog) item.close();
      });
    }
    if (!dialog.open) {
      try { dialog.showModal(); } catch (error) { dialog.setAttribute('open', ''); }
    }
    document.body.classList.add('modal-open');

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      window.setTimeout(() => {
        if (!dialog.open) return;
        const firstField = dialog.querySelector('input:not([type="hidden"]):not([type="file"]), select, textarea');
        if (firstField) firstField.focus({ preventScroll: true });
      }, 40);
    }
  }

  function closeSheet(id) {
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) dialog.close();
  }

  function closeAllDialogs() {
    $$('dialog[open]').forEach((dialog) => dialog.close());
  }

  function setError(id, message) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message || '';
    element.hidden = !message;
  }

  function askConfirm(config) {
    $('#confirmTitle').textContent = config.title || 'Are you sure?';
    $('#confirmMessage').textContent = config.message || '';
    $('#confirmAccept').textContent = config.confirmLabel || 'Delete';
    confirmAction = typeof config.onConfirm === 'function' ? config.onConfirm : null;
    openSheet('confirmDialog', { stack: true });
  }

  /* ---------- jar dialog ---------- */
  function renderJarSwatches() {
    const container = $('#jarColors');
    if (!container) return;
    container.innerHTML = JAR_COLORS.map((color) => `<button class="swatch" type="button" data-action="jar-color" data-color="${color}" style="--sw:${color}" aria-label="${JAR_COLOR_NAMES[color] || 'Accent'}" aria-pressed="${draftJarColor === color}"></button>`).join('');
  }

  function openJarDialog(personId, jar = null) {
    const person = data.people[personId];
    if (!person) return;
    draftJarColor = jar ? jar.color : JAR_COLORS[person.jars.length % JAR_COLORS.length];
    $('#jarPersonId').value = personId;
    $('#jarId').value = jar ? jar.id : '';
    $('#jarDialogTitle').textContent = jar ? 'Edit savings goal' : 'New savings goal';
    $('#jarDialogSubtitle').textContent = jar
      ? 'Update the name, target, date, or accent.'
      : `Saving toward something in ${person.currency}.`;
    $('#jarSubmit').textContent = jar ? 'Save changes' : 'Create goal';
    $('#jarName').value = jar ? jar.name : '';
    $('#jarTarget').value = jar ? jar.target : '';
    $('#jarTargetDate').value = jar ? jar.targetDate : '';
    $('#jarCurrencySymbol').textContent = currencySymbol(person.currency);
    configureAmountInput($('#jarTarget'), person.currency);
    renderJarSwatches();
    setError('jarError', '');
    openSheet('jarDialog');
  }

  function saveJar(event) {
    event.preventDefault();
    const personId = $('#jarPersonId').value;
    const person = data.people[personId];
    if (!person) return;

    const id = $('#jarId').value;
    const name = $('#jarName').value.trim();
    const target = parseAmountInput($('#jarTarget').value, person.currency);
    const targetDate = $('#jarTargetDate').value;

    if (!name) {
      setError('jarError', 'Give the goal a name.');
      $('#jarName').focus();
      return;
    }
    if (target == null || target <= 0) {
      setError('jarError', 'Enter a target greater than zero.');
      $('#jarTarget').focus();
      return;
    }
    if (targetDate && !isValidISODate(targetDate)) {
      setError('jarError', 'Choose a valid target date, or leave it empty.');
      $('#jarTargetDate').focus();
      return;
    }

    if (id) {
      const jar = person.jars.find((item) => item.id === id);
      if (!jar) return;
      jar.name = name;
      jar.target = target;
      jar.targetDate = targetDate;
      jar.color = draftJarColor;
      showToast('Goal updated');
    } else {
      person.jars.unshift({
        id: makeId(),
        name,
        target,
        targetDate,
        color: draftJarColor,
        createdAt: new Date().toISOString(),
        contributions: [],
        rules: []
      });
      showToast('Goal created');
    }

    saveData();
    closeSheet('jarDialog');
    render();
  }

  /* ---------- contributions ---------- */
  function openContributionDialog(personId, jarId, contribution = null) {
    const person = data.people[personId];
    const jar = person && person.jars.find((item) => item.id === jarId);
    if (!person || !jar) return;

    $('#contributionPersonId').value = personId;
    $('#contributionJarId').value = jarId;
    $('#contributionId').value = contribution ? contribution.id : '';
    $('#contributionDialogTitle').textContent = contribution ? 'Edit contribution' : 'Add contribution';
    $('#contributionSubtitle').textContent = `${jar.name} · ${formatMoney(jarTotal(jar), person.currency)} saved`;
    $('#contributionCurrency').textContent = currencySymbol(person.currency);
    $('#contributionAmount').value = contribution ? contribution.amount : '';
    $('#contributionDate').value = contribution ? contribution.date : todayISO();
    $('#contributionDate').max = todayISO();
    $('#contributionNote').value = contribution ? contribution.note : '';
    $('#contributionDelete').hidden = !contribution;
    $('#contributionHint').hidden = !(contribution && contribution.source === 'auto');
    configureAmountInput($('#contributionAmount'), person.currency);
    setError('contributionError', '');
    openSheet('contributionDialog');
  }

  function saveContribution(event) {
    event.preventDefault();
    const personId = $('#contributionPersonId').value;
    const jarId = $('#contributionJarId').value;
    const person = data.people[personId];
    const jar = person && person.jars.find((item) => item.id === jarId);
    if (!person || !jar) return;

    const id = $('#contributionId').value;
    const amount = parseAmountInput($('#contributionAmount').value, person.currency);
    const date = $('#contributionDate').value;
    const note = $('#contributionNote').value.trim().slice(0, 100);

    if (amount == null || amount <= 0) {
      setError('contributionError', 'Enter an amount greater than zero.');
      $('#contributionAmount').focus();
      return;
    }
    if (!isValidISODate(date) || date > todayISO()) {
      setError('contributionError', 'Choose a valid date up to today.');
      $('#contributionDate').focus();
      return;
    }

    const wasComplete = jarTotal(jar) >= jar.target;

    if (id) {
      const entry = jar.contributions.find((item) => item.id === id);
      if (!entry) return;
      entry.amount = amount;
      entry.date = date;
      entry.note = note;
      showToast('Contribution updated');
    } else {
      jar.contributions.push({
        id: makeId(),
        date,
        amount,
        note,
        source: 'manual',
        ruleId: '',
        occurrence: '',
        createdAt: new Date().toISOString()
      });
      showToast('Contribution added');
    }

    const isComplete = jarTotal(jar) >= jar.target;
    if (!wasComplete && isComplete) showToast(`Goal complete — ${jar.name}`);

    saveData();
    closeSheet('contributionDialog');
    render();
  }

  function saveQuickContribution(event) {
    event.preventDefault();
    if (!route || route.name !== 'savings') return;
    const person = data.people[route.personId];
    if (!person) return;
    const jarId = $('#quickJar') ? $('#quickJar').value : '';
    const jar = person.jars.find((item) => item.id === jarId);
    if (!jar) return;

    const amount = parseAmountInput($('#quickAmount').value, person.currency);
    const date = $('#quickDate').value;
    const note = $('#quickNote').value.trim().slice(0, 100);
    setError('quickError', '');

    if (amount == null || amount <= 0) {
      setError('quickError', 'Enter an amount greater than zero.');
      $('#quickAmount').focus();
      return;
    }
    if (!isValidISODate(date) || date > todayISO()) {
      setError('quickError', 'Choose a valid date up to today.');
      $('#quickDate').focus();
      return;
    }

    const wasComplete = jarTotal(jar) >= jar.target;
    jar.contributions.push({
      id: makeId(),
      date,
      amount,
      note,
      source: 'manual',
      ruleId: '',
      occurrence: '',
      createdAt: new Date().toISOString()
    });
    const isComplete = jarTotal(jar) >= jar.target;
    saveData();
    render();
    showToast(!wasComplete && isComplete ? `Goal complete — ${jar.name}` : `${formatMoney(amount, person.currency)} added to ${jar.name}`);
  }

  function deleteContribution() {
    const personId = $('#contributionPersonId').value;
    const jarId = $('#contributionJarId').value;
    const contributionId = $('#contributionId').value;
    const person = data.people[personId];
    const jar = person && person.jars.find((item) => item.id === jarId);
    if (!person || !jar) return;

    const index = jar.contributions.findIndex((item) => item.id === contributionId);
    if (index < 0) return;
    const removed = jar.contributions.splice(index, 1)[0];

    saveData();
    closeSheet('contributionDialog');
    render();
    showToast('Contribution deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        jar.contributions.splice(Math.min(index, jar.contributions.length), 0, removed);
        saveData();
        render();
      }
    });
  }

  /* ---------- recurring rules ---------- */
  function toggleRuleWeekday() {
    const frequency = $('#ruleFrequency').value;
    const field = $('#ruleWeekdayField');
    if (field) field.hidden = frequency === 'monthly';
  }

  function openRuleDialog(personId, jarId, rule = null) {
    const person = data.people[personId];
    const jar = person && person.jars.find((item) => item.id === jarId);
    if (!person || !jar) return;

    $('#rulePersonId').value = personId;
    $('#ruleJarId').value = jarId;
    $('#ruleId').value = rule ? rule.id : '';
    $('#ruleDialogTitle').textContent = rule ? 'Edit recurring contribution' : 'New recurring contribution';
    $('#ruleSubtitle').textContent = jar.name;
    $('#ruleCurrency').textContent = currencySymbol(person.currency);
    $('#ruleAmount').value = rule ? rule.amount : '';
    $('#ruleFrequency').value = rule ? rule.frequency : 'weekly';
    $('#ruleWeekday').value = String(rule ? rule.weekday : weekdayOfISO(todayISO()));
    $('#ruleStart').value = rule ? rule.startDate : todayISO();
    $('#ruleEnd').value = rule ? rule.endDate : '';
    $('#ruleEnd').min = $('#ruleStart').value;
    $('#ruleNote').value = rule ? rule.note : '';
    $('#ruleActive').checked = rule ? rule.active : true;
    $('#ruleDelete').hidden = !rule;
    $('#ruleHint').textContent = rule
      ? 'Changes apply going forward. Contributions already added stay the same. Pausing skips the missed period when you resume.'
      : 'Choose the weekday and start date. If the start date is in the past, missed contributions are added now.';
    configureAmountInput($('#ruleAmount'), person.currency);
    toggleRuleWeekday();
    setError('ruleError', '');
    openSheet('ruleDialog');
  }

  function saveRule(event) {
    event.preventDefault();
    const personId = $('#rulePersonId').value;
    const jarId = $('#ruleJarId').value;
    const person = data.people[personId];
    const jar = person && person.jars.find((item) => item.id === jarId);
    if (!person || !jar) return;

    const id = $('#ruleId').value;
    const amount = parseAmountInput($('#ruleAmount').value, person.currency);
    const frequency = $('#ruleFrequency').value;
    const startDateInput = $('#ruleStart').value;
    const endDate = $('#ruleEnd').value;
    const note = $('#ruleNote').value.trim().slice(0, 100);
    const active = $('#ruleActive').checked;
    const weekday = frequency === 'monthly' ? weekdayOfISO(startDateInput) : Number($('#ruleWeekday').value);

    if (amount == null || amount <= 0) {
      setError('ruleError', 'Enter an amount greater than zero.');
      $('#ruleAmount').focus();
      return;
    }
    if (!['weekly', 'biweekly', 'monthly'].includes(frequency)) {
      setError('ruleError', 'Choose a frequency.');
      return;
    }
    if (!isValidISODate(startDateInput)) {
      setError('ruleError', 'Choose a valid start date.');
      $('#ruleStart').focus();
      return;
    }

    const startDate = frequency === 'monthly'
      ? startDateInput
      : nextWeekdayOnOrAfter(startDateInput, weekday);

    if (endDate && (!isValidISODate(endDate) || endDate < startDate)) {
      setError('ruleError', 'The end date must be on or after the first contribution.');
      $('#ruleEnd').focus();
      return;
    }

    let generated = 0;
    if (id) {
      const rule = jar.rules.find((item) => item.id === id);
      if (!rule) return;
      rule.amount = amount;
      rule.frequency = frequency;
      rule.startDate = startDate;
      rule.endDate = endDate;
      rule.note = note;
      rule.active = active;
      rule.weekday = weekday;
      rule.anchorDay = Number(startDate.slice(8, 10));

      if (active) {
        rule.nextDate = firstOccurrenceOnOrAfter(rule, todayISO());
        if (rule.endDate && rule.nextDate && rule.nextDate > rule.endDate) rule.nextDate = '';
        generated = runRule(rule, jar);
      } else {
        rule.nextDate = '';
      }
      showToast(generated ? `Rule updated · ${generated} contribution${generated === 1 ? '' : 's'} added` : 'Recurring contribution updated');
    } else {
      const rule = {
        id: makeId(),
        amount,
        frequency,
        startDate,
        endDate,
        note,
        active,
        weekday,
        anchorDay: Number(startDate.slice(8, 10)),
        nextDate: active ? startDate : '',
        createdAt: new Date().toISOString()
      };
      jar.rules.push(rule);
      if (active) generated = runRule(rule, jar);
      showToast(generated
        ? `Rule created · ${generated} past contribution${generated === 1 ? '' : 's'} added`
        : active ? 'Recurring contribution created' : 'Recurring contribution created — paused');
    }

    saveData();
    closeSheet('ruleDialog');
    render();
  }

  function deleteRule() {
    const personId = $('#rulePersonId').value;
    const jarId = $('#ruleJarId').value;
    const ruleId = $('#ruleId').value;
    const person = data.people[personId];
    const jar = person && person.jars.find((item) => item.id === jarId);
    if (!person || !jar) return;
    const rule = jar.rules.find((item) => item.id === ruleId);
    if (!rule) return;

    askConfirm({
      title: 'Delete this rule?',
      message: 'Future contributions will stop. Contributions already added to the goal will stay.',
      confirmLabel: 'Delete rule',
      onConfirm: () => {
        jar.rules = jar.rules.filter((item) => item.id !== ruleId);
        saveData();
        closeSheet('ruleDialog');
        render();
        showToast('Recurring contribution deleted');
      }
    });
  }

  /* ---------- weight dialogs ---------- */
  function setWeightDialogUnits(person) {
    $$('#weightGoalDialog [data-unit], #weighInDialog [data-unit]').forEach((element) => {
      element.textContent = person.weightUnit;
    });
  }

  function updateWeightDirectionHint() {
    const personId = $('#weightPersonId').value;
    const person = data.people[personId];
    if (!person) return;
    const unit = person.weightUnit;
    const start = Number($('#weightStart').value);
    const target = Number($('#weightTarget').value);
    const hint = $('#weightDirectionHint');

    if (!Number.isFinite(start) || !Number.isFinite(target) || !$('#weightStart').value || !$('#weightTarget').value) {
      hint.textContent = `All weights are in ${unit}. You can change the unit on the weight page.`;
      return;
    }
    const difference = Math.abs(start - target);
    if (difference < 0.05) {
      hint.textContent = 'Choose a goal weight different from your starting weight.';
      return;
    }
    hint.textContent = `${target < start ? 'Lose' : 'Gain'} ${difference.toFixed(1)} ${unit} to reach your goal.`;
  }

  function openWeightGoalDialog(personId) {
    const person = data.people[personId];
    if (!person) return;
    const goal = person.weightGoal;
    const unit = person.weightUnit;

    $('#weightPersonId').value = personId;
    $('#weightGoalTitle').textContent = goal ? 'Edit weight goal' : 'Set a weight goal';
    $('#weightGoalSubtitle').textContent = `${person.name} · all weights in ${unit}`;
    setWeightDialogUnits(person);
    $('#weightStart').value = goal ? displayWeight(goal.startKg, unit) : '';
    $('#weightTarget').value = goal ? displayWeight(goal.targetKg, unit) : '';
    $('#weightStartDate').value = goal ? goal.startDate : todayISO();
    $('#weightStartDate').max = todayISO();
    $('#weightGoalRemove').hidden = !goal;
    $('#weightGoalSubmit').textContent = goal ? 'Save goal' : 'Set goal';
    setError('weightGoalError', '');
    updateWeightDirectionHint();
    openSheet('weightGoalDialog');
  }

  function saveWeightGoal(event) {
    event.preventDefault();
    const personId = $('#weightPersonId').value;
    const person = data.people[personId];
    if (!person) return;

    const unit = person.weightUnit;
    const startRaw = Number($('#weightStart').value);
    const targetRaw = Number($('#weightTarget').value);
    const startDate = $('#weightStartDate').value;

    if (!Number.isFinite(startRaw) || !startRaw || startRaw <= 0 || !Number.isFinite(targetRaw) || !targetRaw || targetRaw <= 0) {
      setError('weightGoalError', 'Enter both a starting weight and a goal weight.');
      return;
    }
    if (Math.abs(startRaw - targetRaw) < 0.05) {
      setError('weightGoalError', 'Choose a goal weight different from your starting weight.');
      $('#weightTarget').focus();
      return;
    }
    const startKg = roundKg(toKg(startRaw, unit));
    const targetKg = roundKg(toKg(targetRaw, unit));
    if (startKg < 1 || startKg > 500 || targetKg < 1 || targetKg > 500) {
      setError('weightGoalError', 'Enter a weight between 1 and 500 kg (about 2–1,100 lb).');
      return;
    }
    if (!isValidISODate(startDate) || startDate > todayISO()) {
      setError('weightGoalError', 'Choose a start date up to today.');
      $('#weightStartDate').focus();
      return;
    }

    person.weightGoal = { startKg, targetKg, startDate };
    saveData();
    closeSheet('weightGoalDialog');
    render();
    showToast('Weight goal saved');
  }

  function removeWeightGoal() {
    const personId = $('#weightPersonId').value;
    const person = data.people[personId];
    if (!person) return;
    askConfirm({
      title: 'Remove weight goal?',
      message: 'This also deletes all weigh-in history for this person. Export a backup first if you want to keep it.',
      confirmLabel: 'Remove goal',
      onConfirm: () => {
        person.weightGoal = null;
        person.weighIns = [];
        saveData();
        closeSheet('weightGoalDialog');
        render();
        showToast('Weight goal removed');
      }
    });
  }

  function openWeighInDialog(personId, entry = null) {
    const person = data.people[personId];
    if (!person || !person.weightGoal) return;
    const goal = person.weightGoal;
    const unit = person.weightUnit;
    const latest = NG.latestWeighIn(person);
    const startingValue = latest ? latest.kg : goal.startKg;

    $('#weighPersonId').value = personId;
    $('#weighId').value = entry ? entry.id : '';
    $('#weighInTitle').textContent = entry ? 'Edit weigh-in' : 'Log a weigh-in';
    $('#weighInSubtitle').textContent = `${person.name} · all weights in ${unit}`;
    setWeightDialogUnits(person);
    $('#weighValue').value = entry ? displayWeight(entry.kg, unit) : displayWeight(startingValue, unit);
    $('#weighDate').value = entry ? entry.date : todayISO();
    $('#weighDate').min = goal.startDate;
    $('#weighDate').max = todayISO();
    $('#weighNote').value = entry ? entry.note : '';
    $('#weighDelete').hidden = !entry;
    $('#weighSubmit').textContent = entry ? 'Save changes' : 'Save weigh-in';
    setError('weighInError', '');
    openSheet('weighInDialog');
  }

  function saveWeighIn(event) {
    event.preventDefault();
    const personId = $('#weighPersonId').value;
    const person = data.people[personId];
    if (!person || !person.weightGoal) return;

    const unit = person.weightUnit;
    const goal = person.weightGoal;
    const id = $('#weighId').value;
    const rawWeight = Number($('#weighValue').value);
    const date = $('#weighDate').value;

    if (!Number.isFinite(rawWeight) || rawWeight <= 0) {
      setError('weighInError', 'Enter a valid weight.');
      $('#weighValue').focus();
      return;
    }
    const kg = roundKg(toKg(rawWeight, unit));
    if (kg < 1 || kg > 500) {
      setError('weighInError', 'Enter a weight between 1 and 500 kg (about 2–1,100 lb).');
      return;
    }
    if (!isValidISODate(date) || date > todayISO()) {
      setError('weighInError', 'Choose a valid date up to today.');
      $('#weighDate').focus();
      return;
    }
    if (date < goal.startDate) {
      setError('weighInError', `Choose a date on or after your start date (${formatShortDate(goal.startDate)}).`);
      $('#weighDate').focus();
      return;
    }

    const sameDate = person.weighIns.find((item) => item.date === date && item.id !== id);
    if (id) {
      if (sameDate) {
        setError('weighInError', 'There is already a weigh-in for that date. Edit that one instead.');
        return;
      }
      const entry = person.weighIns.find((item) => item.id === id);
      if (!entry) return;
      entry.kg = kg;
      entry.date = date;
      entry.note = $('#weighNote').value.trim().slice(0, 100);
      showToast('Weigh-in updated');
    } else if (sameDate) {
      sameDate.kg = kg;
      sameDate.note = $('#weighNote').value.trim().slice(0, 100);
      sameDate.createdAt = new Date().toISOString();
      showToast('Weigh-in updated');
    } else {
      person.weighIns.push({
        id: makeId(),
        date,
        kg,
        note: $('#weighNote').value.trim().slice(0, 100),
        createdAt: new Date().toISOString()
      });
      showToast('Weigh-in logged');
    }

    person.weighIns.sort((a, b) => a.date.localeCompare(b.date));
    saveData();
    closeSheet('weighInDialog');
    render();
  }

  function deleteWeighIn() {
    const personId = $('#weighPersonId').value;
    const weighId = $('#weighId').value;
    const person = data.people[personId];
    if (!person) return;
    const index = person.weighIns.findIndex((item) => item.id === weighId);
    if (index < 0) return;
    const removed = person.weighIns.splice(index, 1)[0];

    saveData();
    closeSheet('weighInDialog');
    render();
    showToast('Weigh-in deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        person.weighIns.splice(Math.min(index, person.weighIns.length), 0, removed);
        person.weighIns.sort((a, b) => a.date.localeCompare(b.date));
        saveData();
        render();
      }
    });
  }

  function openHistoryDialog(personId) {
    const person = data.people[personId];
    if (!person) return;
    const unit = person.weightUnit;
    const entries = [...person.weighIns].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    $('#historySubtitle').textContent = `${person.name} · ${entries.length} weigh-in${entries.length === 1 ? '' : 's'} in ${unit}`;
    if (!entries.length) {
      $('#historyList').innerHTML = '<div class="empty-inline">No weigh-ins yet. Log your first one to start the trend.</div>';
    } else {
      const groups = new Map();
      for (const entry of entries) {
        const key = entry.date.slice(0, 7);
        if (!groups.has(key)) groups.set(key, { label: formatMonthYear(entry.date), entries: [] });
        groups.get(key).entries.push(entry);
      }
      $('#historyList').innerHTML = Array.from(groups.values()).map((group) => `
        <div class="month-group">
          <div class="month-head"><span>${group.label}</span><span>${group.entries.length} ${group.entries.length === 1 ? 'entry' : 'entries'}</span></div>
          <div class="tx-list">${group.entries.map((entry) => `
            <button class="tx" type="button" data-action="edit-weighin" data-id="${entry.id}" aria-label="Edit weigh-in for ${formatShortDate(entry.date)}">
              <span class="tx__main">
                <span class="tx__title">${weightText(entry.kg, unit)}</span>
                <span class="tx__date">${formatLongDate(entry.date)}${entry.note ? ` · ${esc(entry.note)}` : ''}</span>
              </span>
              <span class="tx__edit">${ICONS.pencil}</span>
            </button>`).join('')}</div>
        </div>`).join('');
    }
    openSheet('historyDialog');
  }

  /* ---------- people ---------- */
  function renderPersonColors() {
    const container = $('#personColors');
    if (!container) return;
    container.innerHTML = PERSON_COLORS.map((color) => `<button class="swatch" type="button" data-action="person-color" data-color="${color}" style="--sw:${color}" aria-label="${PERSON_COLOR_NAMES[color] || 'Accent'}" aria-pressed="${draftPersonColor === color}"></button>`).join('');
  }

  function setPersonUnitButtons(unit) {
    $$('#personUnit button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.unitValue === unit));
    });
  }

  function openPersonDialog(personId = '') {
    const editing = personId ? data.people[personId] : null;
    const people = peopleList(data);
    draftPersonUnit = editing ? editing.weightUnit : 'kg';
    draftPersonColor = editing ? editing.accent : PERSON_COLORS[people.length % PERSON_COLORS.length];

    $('#personId').value = editing ? editing.id : '';
    $('#personDialogTitle').textContent = editing ? 'Edit person' : 'Add a person';
    $('#personDialogSubtitle').textContent = editing
      ? 'Rename this person or change their currency and unit.'
      : 'Each person gets their own goals and weigh-ins.';
    $('#personName').value = editing ? editing.name : '';
    $('#personCurrency').innerHTML = V.currencyOptionsHTML(editing ? editing.currency : 'USD');
    $('#personSubmit').textContent = editing ? 'Save changes' : 'Add person';
    $('#personDelete').hidden = !editing || people.length <= 1;
    setPersonUnitButtons(draftPersonUnit);
    renderPersonColors();
    setError('personError', '');
    openSheet('personDialog');
  }

  function savePerson(event) {
    event.preventDefault();
    const id = $('#personId').value;
    const name = $('#personName').value.trim();
    const currency = $('#personCurrency').value;
    const unit = draftPersonUnit;
    const accent = draftPersonColor;

    if (!name) {
      setError('personError', 'Give this person a name.');
      $('#personName').focus();
      return;
    }
    if (!CURRENCIES[currency]) {
      setError('personError', 'Choose a currency.');
      return;
    }

    if (id) {
      const person = data.people[id];
      if (!person) return;
      const currencyChanged = person.currency !== currency;
      person.name = name;
      person.currency = currency;
      person.weightUnit = unit;
      person.accent = accent;
      saveData();
      closeSheet('personDialog');
      render();
      showToast(currencyChanged ? `${name} updated · amounts were not converted` : `${name} updated`);
    } else {
      const newId = makeId();
      const person = defaultPerson(newId, name, currency, unit, accent, nextPersonOrder(data));
      data.people[newId] = person;
      saveData();
      closeSheet('personDialog');
      location.hash = `#/savings/${encodeURIComponent(newId)}`;
      showToast(`${name} added`);
    }
  }

  function deletePerson(personId) {
    const person = data.people[personId];
    if (!person) return;
    if (peopleList(data).length <= 1) {
      showToast('Keep at least one person');
      return;
    }

    askConfirm({
      title: `Remove ${person.name}?`,
      message: 'This deletes their savings goals, contributions, weight goal, and weigh-ins from every device. This cannot be undone.',
      confirmLabel: 'Remove person',
      onConfirm: () => {
        delete data.people[personId];
        saveData();
        const first = peopleList(data)[0];
        if (route && route.personId === personId) {
          location.hash = `#/${data.settings.lastView}/${encodeURIComponent(first.id)}`;
        } else {
          render();
        }
        showToast(`${person.name} removed`);
      }
    });
  }

  function chooseUnit(personId, unit) {
    if (unit !== 'lb' && unit !== 'kg') return;
    const person = data.people[personId];
    if (!person || person.weightUnit === unit) return;
    person.weightUnit = unit;
    saveData();
    render();
    showToast(`${person.name}: weights now in ${unit}`);
  }

  /* ---------- PIN ---------- */
  async function changePin(event) {
    event.preventDefault();
    if (!auth.token) {
      setError('pinError', 'Sign in again to change the PIN.');
      return;
    }

    const currentPin = $('#pinCurrent').value.trim();
    const newPin = $('#pinNew').value.trim();
    const confirmPin = $('#pinConfirm').value.trim();
    setError('pinError', '');

    if (!currentPin) {
      setError('pinError', 'Enter your current PIN.');
      $('#pinCurrent').focus();
      return;
    }
    if (!/^[0-9]{6,12}$/.test(newPin)) {
      setError('pinError', 'The new PIN must be 6 to 12 digits.');
      $('#pinNew').focus();
      return;
    }
    if (newPin !== confirmPin) {
      setError('pinError', 'The new PINs do not match.');
      $('#pinConfirm').focus();
      return;
    }

    const button = $('#pinForm button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const result = await NorthstarAuth.changePin(auth.token, currentPin, newPin);
      if (result && result.error) {
        if (result.error === 'invalid_pin') {
          const left = Number(result.attempts_remaining);
          setError('pinError', `Current PIN is not right.${Number.isFinite(left) && left > 0 ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ''}`);
        } else if (result.error === 'locked') {
          setError('pinError', 'Too many tries. Wait a few minutes and try again.');
        } else if (result.error === 'session_expired') {
          handleSessionExpired();
        } else {
          setError('pinError', 'Could not change the PIN.');
        }
        return;
      }
      $('#pinCurrent').value = '';
      $('#pinNew').value = '';
      $('#pinConfirm').value = '';
      showToast('PIN changed · other devices signed out');
    } catch (error) {
      setError('pinError', error.message || 'Could not change the PIN.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  /* ---------- backup / install ---------- */
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `northstar-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Backup downloaded');
  }

  function importBackup(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('That file is too large to be a Northstar backup.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result || ''));
      } catch (error) {
        showToast('That file is not valid JSON.');
        return;
      }
      if (!parsed || typeof parsed !== 'object' || !parsed.people || typeof parsed.people !== 'object') {
        showToast('That does not look like a Northstar backup.');
        return;
      }
      askConfirm({
        title: 'Import this backup?',
        message: 'This replaces all goals, contributions, weight goals, and weigh-ins currently stored in this workspace.',
        confirmLabel: 'Import backup',
        onConfirm: () => {
          setData(normalizeData(parsed));
          catchUpAll(data);
          saveData();
          applyTheme();
          render({ scrollTop: true });
          showToast('Backup imported');
        }
      });
    };
    reader.onerror = () => showToast('Could not read that file.');
    reader.readAsText(file);
  }

  function resetAllData() {
    askConfirm({
      title: 'Reset everything?',
      message: 'This deletes all goals, contributions, recurring rules, weight goals, and weigh-ins from every device. This cannot be undone.',
      confirmLabel: 'Reset everything',
      onConfirm: () => {
        setData(defaultData());
        saveData();
        applyTheme();
        location.hash = `#/savings/${encodeURIComponent(data.settings.lastPerson)}`;
        render({ scrollTop: true });
        showToast('All data reset');
      }
    });
  }

  async function installApp() {
    if (!NG.state.ui.installPrompt) {
      showToast('Use your browser menu to add Northstar to your home screen.');
      return;
    }
    NG.state.ui.installPrompt.prompt();
    try {
      await NG.state.ui.installPrompt.userChoice;
    } catch (error) { /* dismissed */ }
    NG.state.ui.installPrompt = null;
    if (route && route.name === 'settings') render();
  }

  /* ---------- sync actions ---------- */
  async function reloadLatest() {
    if (!auth.token) return;
    askConfirm({
      title: 'Reload the latest copy?',
      message: 'Changes saved on this device that have not reached the cloud will be replaced by the newer copy.',
      confirmLabel: 'Reload latest',
      onConfirm: async () => {
        try {
          const result = await NorthstarAuth.load(auth.token);
          if (result && result.error) throw new Error(result.error);
          applyRemote(result);
        } catch (error) {
          showToast('Could not reload from the cloud');
        }
      }
    });
  }

  async function keepMine() {
    if (!auth.token) return;
    try {
      const latest = await NorthstarAuth.load(auth.token);
      if (latest && latest.error) throw new Error(latest.error);
      cloud.revision = Number(latest.revision) || cloud.revision;
      cloud.conflict = false;
      cloud.dirty = true;
      cloud.error = '';
      updateSyncUi();
      await flushSave();
      showToast('Saved this device\'s version');
    } catch (error) {
      showToast('Could not reach the cloud');
    }
  }

  /* ---------- actions ---------- */
  function handleAction(action, element) {
    const person = route && route.personId ? data.people[route.personId] : null;

    switch (action) {
      case 'toggle-theme':
        chooseTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
        break;
      case 'set-theme':
        chooseTheme(element.dataset.themeChoice);
        break;
      case 'set-unit':
        chooseUnit(element.dataset.person, element.dataset.unitValue);
        break;
      case 'new-jar':
        if (person) openJarDialog(person.id);
        break;
      case 'edit-jar': {
        if (!person) break;
        const jar = person.jars.find((item) => item.id === element.dataset.jar);
        if (jar) openJarDialog(person.id, jar);
        break;
      }
      case 'delete-jar': {
        if (!person) break;
        const jar = person.jars.find((item) => item.id === element.dataset.jar);
        if (!jar) break;
        askConfirm({
          title: `Delete ${jar.name}?`,
          message: 'This removes the goal, its contributions, and its recurring rules from every device.',
          confirmLabel: 'Delete goal',
          onConfirm: () => {
            person.jars = person.jars.filter((item) => item.id !== jar.id);
            saveData();
            if (route && route.name === 'jar' && route.jarId === jar.id) {
              location.hash = `#/savings/${encodeURIComponent(person.id)}`;
            } else {
              render();
            }
            showToast('Goal deleted');
          }
        });
        break;
      }
      case 'jar-color':
        if (JAR_COLORS.includes(element.dataset.color)) {
          draftJarColor = element.dataset.color;
          renderJarSwatches();
        }
        break;
      case 'add-contribution': {
        if (!person) break;
        const jar = person.jars.find((item) => item.id === element.dataset.jar);
        if (jar) openContributionDialog(person.id, jar.id);
        break;
      }
      case 'edit-contribution': {
        if (!person) break;
        const jar = person.jars.find((item) => item.id === element.dataset.jar);
        const entry = jar && jar.contributions.find((item) => item.id === element.dataset.id);
        if (jar && entry) openContributionDialog(person.id, jar.id, entry);
        break;
      }
      case 'new-rule': {
        if (!person) break;
        const jar = person.jars.find((item) => item.id === element.dataset.jar);
        if (jar) openRuleDialog(person.id, jar.id);
        break;
      }
      case 'edit-rule': {
        if (!person) break;
        const jar = person.jars.find((item) => item.id === element.dataset.jar);
        const rule = jar && jar.rules.find((item) => item.id === element.dataset.id);
        if (jar && rule) openRuleDialog(person.id, jar.id, rule);
        break;
      }
      case 'weight-goal':
        if (person) openWeightGoalDialog(person.id);
        break;
      case 'log-weight':
        if (!person) break;
        if (person.weightGoal) openWeighInDialog(person.id);
        else openWeightGoalDialog(person.id);
        break;
      case 'edit-weighin': {
        if (!person) break;
        const weighIn = person.weighIns.find((item) => item.id === element.dataset.id);
        if (weighIn) openWeighInDialog(person.id, weighIn);
        break;
      }
      case 'weight-history':
        if (person) openHistoryDialog(person.id);
        break;
      case 'range':
        if (!person || !['3m', '6m', '1y'].includes(element.dataset.range)) break;
        NG.state.ui.chartRange[person.id] = element.dataset.range;
        $$('.range button').forEach((button) => button.setAttribute('aria-pressed', String(button === element)));
        const caption = $('.chart-caption');
        if (caption) {
          caption.textContent = element.dataset.range === '3m' ? 'Last 3 months' : element.dataset.range === '6m' ? 'Last 6 months' : 'Last 12 months';
        }
        V.setupChart();
        break;
      case 'new-person':
        openPersonDialog('');
        break;
      case 'edit-person':
        openPersonDialog(element.dataset.person);
        break;
      case 'delete-person':
        deletePerson(element.dataset.person);
        break;
      case 'person-color':
        if (PERSON_COLORS.includes(element.dataset.color)) {
          draftPersonColor = element.dataset.color;
          renderPersonColors();
        }
        break;
      case 'person-unit':
        if (element.dataset.unitValue === 'kg' || element.dataset.unitValue === 'lb') {
          draftPersonUnit = element.dataset.unitValue;
          setPersonUnitButtons(draftPersonUnit);
        }
        break;
      case 'export-data':
        exportData();
        break;
      case 'import-data': {
        const input = $('#importFile');
        if (input) {
          input.value = '';
          input.click();
        }
        break;
      }
      case 'reset-data':
        resetAllData();
        break;
      case 'install-app':
        installApp();
        break;
      case 'lock-app':
        lockApp();
        break;
      case 'sync-now':
        if (cloud.dirty) flushSave();
        else pullCloud(true);
        break;
      case 'reload-cloud':
        reloadLatest();
        break;
      case 'save-mine':
        keepMine();
        break;
      default:
        break;
    }
  }

  /* ---------- events ---------- */
  function bindEvents() {
    const staticForms = [
      ['jarForm', 'jarError', saveJar],
      ['contributionForm', 'contributionError', saveContribution],
      ['ruleForm', 'ruleError', saveRule],
      ['weightGoalForm', 'weightGoalError', saveWeightGoal],
      ['weighInForm', 'weighInError', saveWeighIn],
      ['personForm', 'personError', savePerson]
    ];

    staticForms.forEach(([formId, errorId, handler]) => {
      const form = document.getElementById(formId);
      if (!form) return;
      form.addEventListener('submit', handler);
      form.addEventListener('input', () => setError(errorId, ''));
      form.addEventListener('change', () => setError(errorId, ''));
    });

    document.addEventListener('submit', (event) => {
      if (event.target.id === 'quickContributionForm') saveQuickContribution(event);
      else if (event.target.id === 'pinForm') changePin(event);
    });

    const contributionDelete = $('#contributionDelete');
    if (contributionDelete) contributionDelete.addEventListener('click', deleteContribution);

    const ruleDelete = $('#ruleDelete');
    if (ruleDelete) ruleDelete.addEventListener('click', deleteRule);

    const weighDelete = $('#weighDelete');
    if (weighDelete) weighDelete.addEventListener('click', deleteWeighIn);

    const weightGoalRemove = $('#weightGoalRemove');
    if (weightGoalRemove) weightGoalRemove.addEventListener('click', removeWeightGoal);

    const personDelete = $('#personDelete');
    if (personDelete) {
      personDelete.addEventListener('click', () => {
        const id = $('#personId').value;
        if (!id) return;
        closeSheet('personDialog');
        deletePerson(id);
      });
    }

    const confirmAccept = $('#confirmAccept');
    if (confirmAccept) {
      confirmAccept.addEventListener('click', () => {
        const action = confirmAction;
        confirmAction = null;
        closeSheet('confirmDialog');
        if (action) window.setTimeout(action, 0);
      });
    }

    const importFile = $('#importFile');
    if (importFile) {
      importFile.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (file) importBackup(file);
      });
    }

    const weightStart = $('#weightStart');
    const weightTarget = $('#weightTarget');
    if (weightStart) weightStart.addEventListener('input', updateWeightDirectionHint);
    if (weightTarget) weightTarget.addEventListener('input', updateWeightDirectionHint);

    const ruleStart = $('#ruleStart');
    if (ruleStart) {
      ruleStart.addEventListener('change', () => {
        const start = ruleStart.value;
        const end = $('#ruleEnd');
        if (!end) return;
        end.min = start || '';
        if (end.value && start && end.value < start) end.value = '';
      });
    }

    const ruleFrequency = $('#ruleFrequency');
    if (ruleFrequency) ruleFrequency.addEventListener('change', toggleRuleWeekday);

    $$('dialog').forEach((dialog) => {
      dialog.addEventListener('close', () => {
        if (dialog.id === 'confirmDialog') confirmAction = null;
        if (!document.querySelector('dialog[open]')) document.body.classList.remove('modal-open');
      });
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target && event.target.closest ? event.target : null;
      if (!target) return;

      const closer = target.closest('[data-close]');
      if (closer) closeSheet(closer.dataset.close);

      const actionElement = target.closest('[data-action]');
      if (!actionElement || actionElement.disabled) return;
      handleAction(actionElement.dataset.action, actionElement);
    });

    window.addEventListener('hashchange', () => {
      closeAllDialogs();
      document.body.classList.remove('modal-open');
      render({ scrollTop: true });
      rememberRoutePerson();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !auth.ready) return;
      const generated = catchUpAll(data);
      if (generated) saveData();
      if (!document.querySelector('dialog[open]')) render();
      if (auth.token && !cloud.dirty) pullCloud(false);
    });

    window.addEventListener('online', () => {
      cloud.error = '';
      updateSyncUi();
      if (cloud.dirty) flushSave();
      else if (auth.token) pullCloud(false);
    });

    window.addEventListener('offline', () => {
      if (!LOCAL_DEMO) {
        cloud.error = 'This device is offline.';
        updateSyncUi();
      }
    });

    const colorMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const handleColorChange = () => {
      if (data.settings.theme !== 'system') return;
      applyTheme();
      updateHeader();
      if (route && route.name === 'settings') render();
    };
    if (colorMedia.addEventListener) colorMedia.addEventListener('change', handleColorChange);
    else if (colorMedia.addListener) colorMedia.addListener(handleColorChange);

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      NG.state.ui.installPrompt = event;
      if (route && route.name === 'settings') render();
    });

    window.addEventListener('appinstalled', () => {
      NG.state.ui.installPrompt = null;
      showToast('Northstar installed');
      if (route && route.name === 'settings') render();
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline shell is a bonus; the app still works without it */
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    applyTheme();
    bindEvents();

    if (LOCAL_DEMO) {
      const local = loadLocal();
      if (local) {
        setData(local.data);
        cloud.revision = local.revision;
      }
      cloud.offline = true;
      auth.ready = true;
      enterApp();
      showToast('Local preview — data stays in this browser');
      return;
    }

    mountAuthGate();
  }

  boot();
})(window.NG = window.NG || {});
