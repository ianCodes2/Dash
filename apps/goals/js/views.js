/* ============================================================
   Northstar Goals — views
   ============================================================ */
(function (NG) {
  'use strict';

  const {
    esc, initial, clamp, todayISO, formatShortDate, formatLongDate,
    formatMonthYear, formatMoney, formatMoneyExact, currencySymbol,
    weightText, displayWeight, weekdayShort, ordinal, formatTimestamp,
    ICONS, CURRENCIES, JAR_COLORS, JAR_COLOR_NAMES, PERSON_COLORS,
    peopleList, jarTotal, jarPercent, personTotal, personTarget, personPercent,
    nextRuleForJar, ruleFrequencyLabel, ruleSubtext, ruleStatus, sortRules,
    groupContributions, jarPace, weightStats, deltaSummary, sortedWeighIns
  } = NG;

  const state = NG.state;

  function personSwitchHTML(activeId, view) {
    const options = peopleList(state.data).map((person) => `
      <a class="person-switch__option" style="--person-accent:${person.accent}" href="#/${view}/${encodeURIComponent(person.id)}"${person.id === activeId ? ' aria-current="page"' : ''}>
        <span class="person-switch__avatar">${esc(initial(person.name))}</span>
        <span>${esc(person.name)}</span>
      </a>`).join('');

    return `<nav class="person-switch" aria-label="Choose person">
      ${options}
      <button class="person-switch__add" type="button" data-action="new-person" aria-label="Add a person" title="Add a person">${ICONS.plus}</button>
    </nav>`;
  }

  /* ---------- savings ---------- */
  function quickAddHTML(person) {
    if (!person.jars.length) return '';
    const options = person.jars.map((jar) => `<option value="${esc(jar.id)}">${esc(jar.name)} · ${esc(formatMoney(jarTotal(jar), person.currency))}</option>`).join('');
    return `<section class="quick-add" aria-labelledby="quickAddTitle">
      <div class="quick-add__head">
        <div>
          <h2 id="quickAddTitle">Add money</h2>
          <p>Pick the goal and drop in today's contribution.</p>
        </div>
      </div>
      <form class="quick-add__form" id="quickContributionForm" novalidate>
        <label class="quick-field">
          <span>Date</span>
          <input class="input" id="quickDate" type="date" value="${todayISO()}" max="${todayISO()}">
        </label>
        <label class="quick-field quick-field--amount">
          <span>Amount</span>
          <span class="money-field">
            <span class="money-field__symbol">${esc(currencySymbol(person.currency))}</span>
            <input class="input money-field__input" id="quickAmount" type="number" inputmode="decimal" placeholder="0.00">
          </span>
        </label>
        <label class="quick-field quick-field--goal">
          <span>Goal</span>
          <select class="input select" id="quickJar">${options}</select>
        </label>
        <label class="quick-field quick-field--note">
          <span>Note <span class="field__optional">Optional</span></span>
          <input class="input" id="quickNote" type="text" maxlength="100" placeholder="e.g. Weekly transfer" autocomplete="off">
        </label>
        <button class="btn btn--primary quick-add__submit" type="submit">${ICONS.plus} Add contribution</button>
      </form>
      <p class="form-error" id="quickError" role="alert" hidden></p>
    </section>`;
  }

  function emptyJarsHTML() {
    return `<div class="empty-card">
      <div class="empty-card__icon">${ICONS.jar}</div>
      <h3>No savings goals yet</h3>
      <p>Create a goal for each thing you're saving toward. Every contribution moves the bar.</p>
      <button class="btn btn--primary btn--sm" type="button" data-action="new-jar">${ICONS.plus} Create your first goal</button>
    </div>`;
  }

  function jarCardHTML(person, jar) {
    const total = jarTotal(jar);
    const pct = jarPercent(jar);
    const next = nextRuleForJar(jar);
    const contributionCount = jar.contributions.length;
    const autoText = next
      ? `Auto ${formatMoney(next.amount, person.currency)} · ${NG.relativeDate(next.nextDate)}`
      : `${contributionCount} contribution${contributionCount === 1 ? '' : 's'}`;
    const href = `#/savings/${encodeURIComponent(person.id)}/jar/${encodeURIComponent(jar.id)}`;
    const pace = jarPace(jar, person.currency);

    return `<article class="jar-card" style="--jar-color:${jar.color}">
      <a class="jar-card__link" href="${href}" aria-label="Open ${esc(jar.name)}">
        <div class="jar-card__head">
          <span class="jar-card__dot"></span>
          <span class="jar-card__name">${esc(jar.name)}</span>
        </div>
        <div class="jar-card__amounts">
          <span class="jar-card__saved">${formatMoney(total, person.currency)}</span>
          <span class="jar-card__target">of ${formatMoney(jar.target, person.currency)}</span>
        </div>
        <div class="bar jar-card__bar" aria-hidden="true"><span class="bar__fill" style="width:${clamp(pct, 0, 100)}%"></span></div>
        <div class="jar-card__foot">
          <span class="jar-card__pct">${pct}%</span>
          <span class="jar-card__auto">${esc(autoText)}</span>
        </div>
        <div class="jar-card__meta">
          <span>${jar.targetDate ? `By ${esc(formatShortDate(jar.targetDate))}` : 'No target date'}</span>
          <span>${esc(pace)}</span>
        </div>
      </a>
      <button class="jar-card__add" type="button" data-action="add-contribution" data-jar="${jar.id}" aria-label="Add money to ${esc(jar.name)}">${ICONS.plus}</button>
    </article>`;
  }

  function savingsPageHTML(person) {
    const total = personTotal(person);
    const target = personTarget(person);
    const pct = personPercent(person);
    const jarCount = person.jars.length;

    return `<section class="hero" style="--accent:${person.accent}" aria-label="${esc(person.name)} savings overview">
      <div class="hero__head">
        <span class="avatar" style="--person-accent:${person.accent}">${esc(initial(person.name))}</span>
        <div class="hero__identity">
          <h1 class="hero__name">${esc(person.name)}</h1>
          <span class="currency-chip">${esc(person.currency)}</span>
        </div>
      </div>
      <div class="hero__amount-row">
        <span class="hero__label">Total saved</span>
        <div class="hero__amount">${formatMoney(total, person.currency)}</div>
        <p class="hero__meta">${jarCount
          ? `${jarCount} goal${jarCount === 1 ? '' : 's'} · ${pct}% of ${formatMoney(target, person.currency)}`
          : 'No goals yet — start with a small one.'}</p>
      </div>
      <div class="bar hero__bar" aria-hidden="true"><span class="bar__fill" style="width:${clamp(pct, 0, 100)}%"></span></div>
    </section>

    ${quickAddHTML(person)}

    <section class="section" aria-labelledby="savingsTitle">
      <div class="section__head">
        <h2 class="section__title" id="savingsTitle">Savings goals <span class="section__count">${jarCount}</span></h2>
        <button class="btn btn--soft btn--sm" type="button" data-action="new-jar">${ICONS.plus} New goal</button>
      </div>
      <div class="jar-list">
        ${jarCount ? person.jars.map((jar) => jarCardHTML(person, jar)).join('') : emptyJarsHTML()}
      </div>
    </section>`;
  }

  function txRowHTML(person, jar, entry) {
    const title = entry.note || (entry.source === 'auto' ? 'Recurring contribution' : 'Contribution');
    const autoBadge = entry.source === 'auto' ? '<span class="badge">Auto</span>' : '';
    return `<button class="tx" type="button" data-action="edit-contribution" data-jar="${jar.id}" data-id="${entry.id}" aria-label="Edit ${esc(title)} on ${formatShortDate(entry.date)}">
      <span class="tx__main">
        <span class="tx__title">${esc(title)} ${autoBadge}</span>
        <span class="tx__date">${formatLongDate(entry.date)}</span>
      </span>
      <span class="tx__amount">${formatMoney(entry.amount, person.currency)}</span>
      <span class="tx__edit">${ICONS.pencil}</span>
    </button>`;
  }

  function ruleRowHTML(person, jar, rule) {
    const status = ruleStatus(rule);
    return `<button class="rule" type="button" data-action="edit-rule" data-jar="${jar.id}" data-id="${rule.id}" aria-label="Edit recurring rule of ${formatMoney(rule.amount, person.currency)}">
      <span class="rule__icon">${ICONS.repeat}</span>
      <span class="rule__main">
        <span class="rule__title">${formatMoney(rule.amount, person.currency)} · ${esc(ruleFrequencyLabel(rule))}</span>
        <span class="rule__sub">${esc(ruleSubtext(rule))}</span>
      </span>
      <span class="badge badge--${status.key}">${status.label}</span>
      <span class="rule__chev">${ICONS.chevronRight}</span>
    </button>`;
  }

  function emptyContributionsHTML(person, jar) {
    return `<div class="empty-inline">
      <span>No contributions yet. Every goal starts somewhere.</span>
      <div><button class="btn btn--soft btn--sm" type="button" data-action="add-contribution" data-jar="${jar.id}">${ICONS.plus} Add the first one</button></div>
    </div>`;
  }

  function emptyRulesHTML(person, jar) {
    return `<div class="empty-inline">
      <span>No recurring contributions yet. Set one up so you don't have to remember.</span>
      <div><button class="btn btn--soft btn--sm" type="button" data-action="new-rule" data-jar="${jar.id}">${ICONS.repeat} Create a rule</button></div>
    </div>`;
  }

  function jarPageHTML(person, jar) {
    const total = jarTotal(jar);
    const pct = jarPercent(jar);
    const reached = total >= jar.target;
    const over = total - jar.target;
    const groups = groupContributions(jar);
    const rules = sortRules(jar.rules);
    const contributionCount = jar.contributions.length;
    const meta = `${contributionCount} contribution${contributionCount === 1 ? '' : 's'} · ${person.currency}`;
    const pace = jarPace(jar, person.currency);

    return `<div class="detail">
      <a class="back-link" href="#/savings/${encodeURIComponent(person.id)}">${ICONS.arrowLeft} ${esc(person.name)}'s goals</a>

      <header class="detail__head">
        <div>
          <h1 class="detail__title">${esc(jar.name)}</h1>
          <p class="detail__meta">${meta}${jar.targetDate ? ` · by ${esc(formatShortDate(jar.targetDate))}` : ''}</p>
        </div>
        <div class="detail__tools">
          <button class="icon-btn" type="button" data-action="edit-jar" data-jar="${jar.id}" aria-label="Edit goal">${ICONS.pencil}</button>
          <button class="icon-btn" type="button" data-action="delete-jar" data-jar="${jar.id}" aria-label="Delete goal">${ICONS.trash}</button>
        </div>
      </header>

      <section class="jar-hero" style="--jar-color:${jar.color}" aria-label="${esc(jar.name)} progress">
        <span class="jar-hero__label">Saved</span>
        <div class="jar-hero__amount">${formatMoney(total, person.currency)}</div>
        <div class="jar-hero__meta">
          of ${formatMoney(jar.target, person.currency)} · ${pct}%${reached ? ` <span class="reached-pill">${ICONS.check} Goal reached</span>` : over > 0 ? ` · ${formatMoney(over, person.currency)} over target` : ''}
        </div>
        ${pace ? `<div class="jar-hero__pace">${esc(pace)}</div>` : ''}
        <div class="bar jar-hero__bar" aria-hidden="true"><span class="bar__fill" style="width:${clamp(pct, 0, 100)}%"></span></div>
        <div class="jar-hero__actions">
          <button class="btn btn--primary" type="button" data-action="add-contribution" data-jar="${jar.id}">${ICONS.plus} Add money</button>
          <button class="btn btn--ghost" type="button" data-action="new-rule" data-jar="${jar.id}">${ICONS.repeat} Recurring</button>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="contributionsTitle">
        <div class="section__head">
          <h2 class="section__title" id="contributionsTitle">Contributions <span class="section__count">${contributionCount}</span></h2>
          <button class="btn btn--ghost btn--sm" type="button" data-action="add-contribution" data-jar="${jar.id}">${ICONS.plus} Add</button>
        </div>
        ${groups.length ? groups.map((group) => `
          <div class="month-group">
            <div class="month-head"><span>${group.label}</span><span>${formatMoney(group.total, person.currency)}</span></div>
            <div class="tx-list">${group.entries.map((entry) => txRowHTML(person, jar, entry)).join('')}</div>
          </div>`).join('') : emptyContributionsHTML(person, jar)}
      </section>

      <section class="detail-section" aria-labelledby="recurringTitle">
        <div class="section__head">
          <h2 class="section__title" id="recurringTitle">Recurring</h2>
          <button class="btn btn--ghost btn--sm" type="button" data-action="new-rule" data-jar="${jar.id}">${ICONS.plus} New rule</button>
        </div>
        ${rules.length ? `<div class="rule-list">${rules.map((rule) => ruleRowHTML(person, jar, rule)).join('')}</div>` : emptyRulesHTML(person, jar)}
      </section>
    </div>`;
  }

  /* ---------- weight ---------- */
  function emptyWeightHTML(person) {
    return `<div class="empty-card">
      <div class="empty-card__icon">${ICONS.scale}</div>
      <h3>Set a weight goal</h3>
      <p>Start with a current weight and a target. Then log one weigh-in a week and watch the trend.</p>
      <button class="btn btn--primary btn--sm" type="button" data-action="weight-goal">Set up weight goal</button>
    </div>`;
  }

  function recentWeighInRows(person) {
    const unit = person.weightUnit;
    const entries = [...person.weighIns].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    }).slice(0, 3);

    return `<div class="recent">${entries.map((entry) => `
      <button class="recent__row" type="button" data-action="edit-weighin" data-id="${entry.id}" aria-label="Edit weigh-in for ${formatShortDate(entry.date)}">
        <span class="recent__date">${formatShortDate(entry.date)}</span>
        <span class="recent__weight">${weightText(entry.kg, unit)}</span>
        <span class="recent__edit">${ICONS.pencil}</span>
      </button>`).join('')}</div>`;
  }

  function weightCardHTML(person, stats) {
    const unit = person.weightUnit;
    const range = state.ui.chartRange[person.id] || '3m';
    const latest = stats.latest;
    const rangeLabels = { '3m': 'Last 3 months', '6m': 'Last 6 months', '1y': 'Last 12 months' };
    const weekText = stats.weekLogged
      ? (!latest ? 'Starting weight set this week' : (deltaSummary(stats, unit) || 'Weigh-in logged this week'))
      : 'This week’s weigh-in is due';

    return `<article class="weight-card${stats.complete ? ' weight-card--reached' : ''}" style="--accent:${person.accent}">
      <div class="weight-top">
        <div>
          <span class="stat-label">Current</span>
          <div class="weight-current">${displayWeight(stats.currentKg, unit)}<span>${unit}</span></div>
        </div>
        <button class="weight-goal" type="button" data-action="weight-goal" aria-label="Edit weight goal">
          <span>Goal</span>
          <strong>${displayWeight(stats.goal.targetKg, unit)} ${unit}</strong>
        </button>
      </div>

      <div class="weight-progress">
        <div class="weight-progress__meta">
          <span><strong>${stats.pct}%</strong> of the way</span>
          <span>${stats.complete ? 'Goal reached' : `${weightText(stats.toGoKg, unit)} to go`}</span>
        </div>
        <div class="bar" aria-hidden="true"><span class="bar__fill" style="width:${stats.pct}%"></span></div>
      </div>

      <div class="weight-week${stats.weekLogged ? ' is-done' : ''}">
        <span class="weight-week__dot"></span>
        ${esc(weekText)}
      </div>

      <div class="chart-toolbar">
        <span class="chart-caption">${rangeLabels[range]}</span>
        <div class="range" role="group" aria-label="Chart range">
          ${['3m', '6m', '1y'].map((key) => `<button type="button" data-action="range" data-range="${key}" aria-pressed="${range === key}">${key === '3m' ? '3M' : key === '6m' ? '6M' : '1Y'}</button>`).join('')}
        </div>
      </div>

      <div class="chart" id="weightChart" role="img" aria-label="Weight trend chart"></div>

      ${person.weighIns.length
        ? recentWeighInRows(person)
        : `<p class="weight-hint">Log once a week — same day if you can. Small trends beat daily noise.</p>`}
    </article>`;
  }

  function weightSectionHTML(person) {
    const stats = weightStats(person);
    if (!stats) {
      return `<section class="section" aria-labelledby="weightTitle">
        <div class="section__head">
          <h2 class="section__title" id="weightTitle">Weight</h2>
        </div>
        ${emptyWeightHTML(person)}
      </section>`;
    }

    return `<section class="section" aria-labelledby="weightTitle">
      <div class="section__head">
        <h2 class="section__title" id="weightTitle">Weight</h2>
        <div class="section__actions">
          <button class="btn btn--ghost btn--sm" type="button" data-action="weight-history">History</button>
          <button class="btn btn--primary btn--sm" type="button" data-action="log-weight">${ICONS.plus} Log</button>
        </div>
      </div>
      ${weightCardHTML(person, stats)}
    </section>`;
  }

  function weightPageHTML(person) {
    return `<div class="page-head">
      <div>
        <p class="page-head__eyebrow">Weight</p>
        <h1 class="page-head__title">${esc(person.name)}</h1>
        <p class="page-head__sub">${person.weightUnit === 'lb' ? 'Pounds' : 'Kilograms'} · weekly weigh-ins</p>
      </div>
      <div class="unit-toggle" role="group" aria-label="Weight unit">
        <button type="button" data-action="set-unit" data-person="${esc(person.id)}" data-unit-value="kg" aria-pressed="${person.weightUnit === 'kg'}">kg</button>
        <button type="button" data-action="set-unit" data-person="${esc(person.id)}" data-unit-value="lb" aria-pressed="${person.weightUnit === 'lb'}">lb</button>
      </div>
    </div>
    ${weightSectionHTML(person)}`;
  }

  /* ---------- settings ---------- */
  function currencyOptionsHTML(selected) {
    return Object.keys(CURRENCIES).map((code) => `<option value="${code}"${code === selected ? ' selected' : ''}>${code} · ${CURRENCIES[code].symbol}</option>`).join('');
  }

  function personSettingsHTML(person) {
    return `<div class="person-settings" style="--person-accent:${person.accent}">
      <div class="person-settings__head">
        <span class="avatar avatar--sm">${esc(initial(person.name))}</span>
        <div class="person-settings__identity">
          <strong>${esc(person.name)}</strong>
          <span>${esc(person.currency)} · ${esc(person.weightUnit)} · ${person.jars.length} goal${person.jars.length === 1 ? '' : 's'}</span>
        </div>
        <div class="person-settings__tools">
          <button class="icon-btn" type="button" data-action="edit-person" data-person="${esc(person.id)}" aria-label="Edit ${esc(person.name)}">${ICONS.pencil}</button>
          <button class="icon-btn" type="button" data-action="delete-person" data-person="${esc(person.id)}" aria-label="Remove ${esc(person.name)}"${peopleList(state.data).length <= 1 ? ' disabled' : ''}>${ICONS.trash}</button>
        </div>
      </div>
    </div>`;
  }

  function cloudStateLine() {
    const cloud = state.cloud;
    const auth = state.auth;
    if (state.localDemo) return 'Local preview — not connected to Supabase.';
    if (!auth.token) return 'Not signed in.';
    if (cloud.conflict) return 'Another device saved newer changes.';
    if (cloud.saving) return 'Saving changes…';
    if (cloud.error) return `Offline — ${cloud.error}`;
    if (cloud.updatedAt) return `Synced · last save ${formatTimestamp(cloud.updatedAt)}`;
    return 'Connected. Changes save automatically.';
  }

  function settingsPageHTML() {
    const people = peopleList(state.data);
    const canPin = !state.localDemo && state.auth.token;
    const person = state.route && state.route.personId ? state.data.people[state.route.personId] : people[0];

    return `<div class="settings">
      <a class="back-link" href="#/${state.data.settings.lastView}/${encodeURIComponent(state.data.settings.lastPerson)}">${ICONS.arrowLeft} Back</a>
      <h1 class="settings__title">Settings</h1>
      <p class="settings__sub">People, PIN, sync, and backups. Changes save to every device.</p>

      <section class="settings-card" aria-labelledby="appearanceTitle">
        <div class="settings-card__head">
          <h2 id="appearanceTitle">Appearance</h2>
          <p>Follow your device, or pick a side.</p>
        </div>
        <div class="settings-row">
          <div class="settings-row__main">
            <span class="settings-row__title">Theme</span>
            <span class="settings-row__sub">System uses your phone setting.</span>
          </div>
          <div class="theme-seg" role="group" aria-label="Theme">
            ${['system', 'light', 'dark'].map((choice) => `<button type="button" data-action="set-theme" data-theme-choice="${choice}" aria-pressed="${state.data.settings.theme === choice}">${choice[0].toUpperCase() + choice.slice(1)}</button>`).join('')}
          </div>
        </div>
      </section>

      <section class="settings-card" aria-labelledby="peopleTitle">
        <div class="settings-card__head settings-card__head--row">
          <div>
            <h2 id="peopleTitle">People</h2>
            <p>Each person has their own goals, currency, and weight unit.</p>
          </div>
          <button class="btn btn--soft btn--sm" type="button" data-action="new-person">${ICONS.plus} Add</button>
        </div>
        <div class="settings-people">
          ${people.map((item) => personSettingsHTML(item)).join('')}
        </div>
        <p class="settings-note">Changing a currency changes the symbol and number formatting only. It does not convert amounts you have already saved.</p>
      </section>

      <section class="settings-card" aria-labelledby="securityTitle">
        <div class="settings-card__head">
          <h2 id="securityTitle">PIN &amp; security</h2>
          <p>One shared PIN opens the hub and this tracker.</p>
        </div>
        ${canPin ? `
          <form class="pin-form" id="pinForm" novalidate>
            <div class="field-row">
              <label class="field">
                <span class="field__label">Current PIN</span>
                <input class="input" id="pinCurrent" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" pattern="[0-9]*" placeholder="Current">
              </label>
              <label class="field">
                <span class="field__label">New PIN</span>
                <input class="input" id="pinNew" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" pattern="[0-9]*" placeholder="6–12 digits">
              </label>
            </div>
            <label class="field">
              <span class="field__label">Confirm new PIN</span>
              <input class="input" id="pinConfirm" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" pattern="[0-9]*" placeholder="Repeat the new PIN">
            </label>
            <p class="form-error" id="pinError" role="alert" hidden></p>
            <div class="settings-actions">
              <button class="btn btn--primary" type="submit">Change PIN</button>
              <button class="btn btn--ghost" type="button" data-action="lock-app">${ICONS.lock} Lock this device</button>
            </div>
            <p class="settings-note">Changing the PIN signs out other devices. This device stays signed in.</p>
          </form>` : `<p class="settings-note">${state.localDemo ? 'PIN changes are available when the app is connected to Supabase.' : 'Unlock again to manage the PIN.'}</p>`}
      </section>

      <section class="settings-card" aria-labelledby="cloudTitle">
        <div class="settings-card__head">
          <h2 id="cloudTitle">Sync</h2>
          <p>Supabase keeps both phones on the same data.</p>
        </div>
        <div class="settings-row">
          <div class="settings-row__main">
            <span class="settings-row__title">${state.localDemo ? 'Local preview' : 'Cloud workspace'}</span>
            <span class="settings-row__sub" id="cloudState">${esc(cloudStateLine())}</span>
          </div>
          <span class="badge badge--${state.localDemo ? 'paused' : state.cloud.error ? 'paused' : 'active'}">${state.localDemo ? 'Local' : state.cloud.error ? 'Offline' : 'Live'}</span>
        </div>
        <div class="settings-actions">
          <button class="btn btn--ghost" type="button" data-action="sync-now"${state.localDemo ? ' disabled' : ''}>${ICONS.cloud} Sync now</button>
          <button class="btn btn--ghost" type="button" data-action="lock-app">${ICONS.lock} Sign out</button>
        </div>
        <p class="settings-note">The browser never talks to the tables directly. The PIN is checked inside Postgres, and only the workspace functions are exposed.</p>
      </section>

      <section class="settings-card" aria-labelledby="dataTitle">
        <div class="settings-card__head">
          <h2 id="dataTitle">Data</h2>
          <p>Back up before clearing browser data or switching phones.</p>
        </div>
        <div class="settings-actions">
          <button class="btn btn--ghost" type="button" data-action="export-data">${ICONS.download} Export JSON</button>
          <button class="btn btn--ghost" type="button" data-action="import-data">${ICONS.upload} Import JSON</button>
          <button class="btn btn--danger-text" type="button" data-action="reset-data">${ICONS.trash} Reset all</button>
        </div>
        <p class="settings-note">Recurring rules catch up automatically the next time the app opens. Exported backups include goals, contributions, rules, weight goals, and weigh-ins.</p>
      </section>

      <section class="settings-card" aria-labelledby="phoneTitle">
        <div class="settings-card__head">
          <h2 id="phoneTitle">On your phone</h2>
          <p>Use it like an app when it is hosted online.</p>
        </div>
        ${state.ui.installPrompt
          ? `<div class="settings-row">
              <div class="settings-row__main">
                <span class="settings-row__title">Install Northstar</span>
                <span class="settings-row__sub">Full screen, with offline shell support.</span>
              </div>
              <button class="btn btn--soft btn--sm" type="button" data-action="install-app">${ICONS.smartphone} Install</button>
            </div>`
          : ''}
        <p class="install-hint">iPhone: open in Safari, tap <kbd>Share</kbd> → <kbd>Add to Home Screen</kbd>.<br>Android: open the browser menu and choose <kbd>Install app</kbd>.</p>
      </section>

      <p class="settings-version">Northstar Goals v3${person ? ` · ${esc(person.name)}` : ''}</p>
    </div>`;
  }

  /* ---------- chart ---------- */
  function drawWeightChart() {
    const route = state.route;
    if (!route || route.name !== 'weight') return;
    const person = state.data.people[route.personId];
    const container = document.getElementById('weightChart');
    if (!person || !person.weightGoal || !container) return;

    const goal = person.weightGoal;
    const unit = person.weightUnit;
    const range = state.ui.chartRange[person.id] || '3m';
    const months = range === '3m' ? 3 : range === '6m' ? 6 : 12;
    const today = todayISO();
    const cutoff = NG.addMonthsISO(today, -months, Number(today.slice(8, 10)));
    const entries = person.weighIns
      .filter((entry) => entry.date >= cutoff && entry.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    const points = [];
    if (goal.startDate >= cutoff && goal.startDate <= today && !entries.some((entry) => entry.date === goal.startDate)) {
      points.push({ date: goal.startDate, kg: goal.startKg, baseline: true });
    }
    for (const entry of entries) points.push({ date: entry.date, kg: entry.kg, baseline: false });
    points.sort((a, b) => a.date.localeCompare(b.date));

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 20 || height < 20) return;

    if (!points.length) {
      container.innerHTML = `<div class="chart__empty"><span>No weigh-ins in this range.</span><button class="btn btn--soft btn--sm" type="button" data-action="log-weight">Log a weigh-in</button></div>`;
      container.setAttribute('aria-label', 'No weigh-ins in the selected range');
      return;
    }

    const targetValue = NG.weightInUnit(goal.targetKg, unit);
    const values = points.map((point) => NG.weightInUnit(point.kg, unit)).concat([targetValue]);
    let low = Math.min(...values);
    let high = Math.max(...values);
    const spread = Math.max(high - low, 0.8);
    low -= Math.max(spread * 0.18, 0.4);
    high += Math.max(spread * 0.18, 0.4);

    const padLeft = width < 330 ? 37 : 42;
    const padRight = 10;
    const padTop = 17;
    const padBottom = 23;
    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);
    const totalDays = Math.max(1, NG.daysBetween(cutoff, today));

    const xFor = (iso) => padLeft + (NG.daysBetween(cutoff, iso) / totalDays) * plotW;
    const yFor = (value) => padTop + (1 - ((value - low) / (high - low))) * plotH;

    const coords = points.map((point) => ({
      x: xFor(point.date),
      y: yFor(NG.weightInUnit(point.kg, unit)),
      point
    }));

    const linePath = coords.map((coord, index) => `${index ? 'L' : 'M'}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(' ');
    const bottom = padTop + plotH;
    const areaPath = coords.length > 1
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)} ${bottom.toFixed(1)} L${coords[0].x.toFixed(1)} ${bottom.toFixed(1)} Z`
      : '';

    const yTicks = [high, (high + low) / 2, low];
    const midpoint = NG.addDaysISO(cutoff, Math.round(totalDays / 2));
    const xTicks = [cutoff, midpoint, today];
    const targetY = yFor(targetValue);
    const gradientId = `weight-fill-${person.id}`;

    const grid = yTicks.map((value) => {
      const y = yFor(value);
      return `<line class="grid-line" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${padLeft + plotW}" y2="${y.toFixed(1)}"/>`;
    }).join('');

    const yLabels = yTicks.map((value) => {
      const y = yFor(value);
      return `<text x="${padLeft - 8}" y="${(y + 3.2).toFixed(1)}" text-anchor="end">${value.toFixed(1)}</text>`;
    }).join('');

    const xLabels = xTicks.map((iso, index) => {
      const x = index === 0 ? padLeft : index === xTicks.length - 1 ? padLeft + plotW : xFor(iso);
      const anchor = index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle';
      return `<text x="${x.toFixed(1)}" y="${height - 5}" text-anchor="${anchor}">${NG.formatDate(iso, { month: 'short', day: 'numeric' })}</text>`;
    }).join('');

    const dots = coords.map((coord, index) => {
      const isLast = index === coords.length - 1;
      const radius = isLast ? 3.9 : 2.8;
      const fill = coord.point.baseline ? 'var(--surface)' : 'var(--accent)';
      const title = `${formatLongDate(coord.point.date)} — ${weightText(coord.point.kg, unit)}`;
      return `<circle cx="${coord.x.toFixed(1)}" cy="${coord.y.toFixed(1)}" r="${radius}" fill="${fill}" stroke="var(--accent)" stroke-width="${isLast ? 2 : 1.7}"><title>${esc(title)}</title></circle>`;
    }).join('');

    const targetLabelY = targetY < padTop + 12 ? targetY + 12 : targetY - 5;
    const last = coords[coords.length - 1];
    const lastAnchor = last.x > padLeft + plotW - 62 ? 'end' : last.x < padLeft + 54 ? 'start' : 'middle';
    const lastLabelX = lastAnchor === 'end' ? last.x - 4 : lastAnchor === 'start' ? last.x + 4 : last.x;
    const lastLabelY = last.y < padTop + 14 ? last.y + 17 : last.y - 10;
    const lastLabel = `${displayWeight(last.point.kg, unit)} ${unit}`;
    const emptyNote = entries.length === 0
      ? `<text class="chart-note" x="${(padLeft + plotW / 2).toFixed(1)}" y="${(bottom - 7).toFixed(1)}" text-anchor="middle">Log a weigh-in to start your trend</text>`
      : '';

    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Weight trend from ${NG.formatDate(cutoff)} to ${NG.formatDate(today)}">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity=".2"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      ${yLabels}
      <line class="goal-line" x1="${padLeft}" y1="${targetY.toFixed(1)}" x2="${padLeft + plotW}" y2="${targetY.toFixed(1)}"/>
      <text class="goal-label" x="${padLeft + plotW}" y="${targetLabelY.toFixed(1)}" text-anchor="end">Goal ${targetValue.toFixed(1)}</text>
      ${areaPath ? `<path d="${areaPath}" fill="url(#${gradientId})"/>` : ''}
      ${coords.length > 1 ? `<path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${dots}
      <text class="last-value" x="${lastLabelX.toFixed(1)}" y="${lastLabelY.toFixed(1)}" text-anchor="${lastAnchor}">${lastLabel}</text>
      ${emptyNote}
      ${xLabels}
    </svg>`;

    const latest = NG.latestWeighIn(person);
    container.setAttribute('aria-label', latest
      ? `Weight trend. Latest ${weightText(latest.kg, unit)}. Goal ${weightText(goal.targetKg, unit)}.`
      : `Weight goal ${weightText(goal.targetKg, unit)}. No weigh-ins yet.`);
  }

  function setupChart() {
    const container = document.getElementById('weightChart');
    if (!container) {
      teardownChart();
      return;
    }
    drawWeightChart();
    if ('ResizeObserver' in window) {
      if (!state.ui.chartObserver) {
        state.ui.chartObserver = new ResizeObserver(() => {
          cancelAnimationFrame(state.ui.chartFrame);
          state.ui.chartFrame = requestAnimationFrame(drawWeightChart);
        });
      }
      state.ui.chartObserver.disconnect();
      state.ui.chartObserver.observe(container);
    }
  }

  function teardownChart() {
    if (state.ui.chartObserver) state.ui.chartObserver.disconnect();
  }

  NG.views = {
    personSwitchHTML,
    savingsPageHTML,
    jarPageHTML,
    weightPageHTML,
    settingsPageHTML,
    currencyOptionsHTML,
    setupChart,
    teardownChart
  };
})(window.NG = window.NG || {});
