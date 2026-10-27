/* ============================================================
   Northstar Goals — data model, normalization, recurring rules
   ============================================================ */
(function (NG) {
  'use strict';

  const {
    PERSON_COLORS, JAR_COLORS, CURRENCIES,
    makeId, safeId, todayISO, isValidISODate, weekdayOfISO,
    nextWeekdayOnOrAfter, addDaysISO, addMonthsISO, daysBetween,
    clamp, roundAmount, roundKg, formatMoney, formatShortDate, formatDate
  } = NG;

  const DATA_VERSION = 3;

  /* ---------- defaults ---------- */
  function defaultPerson(id, name, currency, weightUnit, accent, order) {
    return {
      id,
      name,
      currency,
      weightUnit,
      accent,
      order: Number.isFinite(order) ? order : 0,
      createdAt: new Date().toISOString(),
      jars: [],
      weightGoal: null,
      weighIns: []
    };
  }

  function defaultData() {
    return {
      version: DATA_VERSION,
      settings: { theme: 'system', lastPerson: 'ian', lastView: 'savings' },
      people: {
        ian: defaultPerson('ian', 'Ian', 'USD', 'lb', PERSON_COLORS[0], 0),
        caca: defaultPerson('caca', 'Caca', 'IDR', 'kg', PERSON_COLORS[1], 1)
      }
    };
  }

  function peopleList(data) {
    return Object.values(data.people).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  }

  function nextPersonOrder(data) {
    const orders = Object.values(data.people).map((person) => Number(person.order) || 0);
    return orders.length ? Math.max(...orders) + 1 : 0;
  }

  /* ---------- normalization ---------- */
  function normalizeData(parsed) {
    const base = defaultData();
    if (!parsed || typeof parsed !== 'object') return base;

    const settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
    const sourcePeople = parsed.people && typeof parsed.people === 'object' ? parsed.people : null;
    const people = {};
    let index = 0;

    if (sourcePeople) {
      for (const [fallbackId, source] of Object.entries(sourcePeople)) {
        if (!source || typeof source !== 'object') continue;
        const person = normalizePerson(source, fallbackId, index);
        if (!person) continue;
        if (people[person.id]) person.id = makeId();
        people[person.id] = person;
        index += 1;
      }
    }

    if (!Object.keys(people).length) return base;

    base.people = people;
    base.version = DATA_VERSION;
    base.settings.theme = ['system', 'light', 'dark'].includes(settings.theme) ? settings.theme : 'system';
    base.settings.lastView = settings.lastView === 'weight' ? 'weight' : 'savings';
    base.settings.lastPerson = people[settings.lastPerson]
      ? settings.lastPerson
      : Object.keys(people)[0];
    return base;
  }

  function normalizePerson(source, fallbackId, index) {
    const id = safeId(source.id) ? source.id : safeId(fallbackId) ? fallbackId : makeId();
    const name = String(source.name || '').trim().slice(0, 40) || 'Person';
    const currency = CURRENCIES[source.currency] ? source.currency : 'USD';
    const weightUnit = source.weightUnit === 'lb' || source.weightUnit === 'kg' ? source.weightUnit : 'kg';
    const accent = PERSON_COLORS.includes(source.accent)
      ? source.accent
      : PERSON_COLORS[index % PERSON_COLORS.length];
    const order = Number.isInteger(source.order) && source.order >= 0 ? source.order : index;

    const person = defaultPerson(id, name, currency, weightUnit, accent, order);
    if (typeof source.createdAt === 'string') person.createdAt = source.createdAt;
    person.jars = Array.isArray(source.jars)
      ? source.jars.map((jar) => normalizeJar(jar, currency)).filter(Boolean)
      : [];
    person.weightGoal = normalizeWeightGoal(source.weightGoal);

    const entries = Array.isArray(source.weighIns)
      ? source.weighIns.map(normalizeWeighIn).filter(Boolean)
      : [];
    const byDate = new Map();
    for (const entry of entries.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
      byDate.set(entry.date, entry);
    }
    person.weighIns = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    return person;
  }

  function normalizeJar(source, currency) {
    if (!source || typeof source !== 'object') return null;
    const target = Number(source.target);
    if (!Number.isFinite(target) || target <= 0) return null;

    const id = safeId(source.id) ? source.id : makeId();
    const name = String(source.name || '').trim().slice(0, 60) || 'Untitled goal';
    const color = JAR_COLORS.includes(source.color) ? source.color : JAR_COLORS[0];
    const createdAt = typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString();
    const targetDate = isValidISODate(source.targetDate) ? source.targetDate : '';

    const contributions = Array.isArray(source.contributions)
      ? source.contributions.map((entry) => normalizeContribution(entry, currency)).filter(Boolean)
      : [];

    const seenAuto = new Set();
    const uniqueContributions = [];
    for (const contribution of contributions) {
      if (contribution.source === 'auto' && contribution.occurrence) {
        if (seenAuto.has(contribution.occurrence)) continue;
        seenAuto.add(contribution.occurrence);
      }
      uniqueContributions.push(contribution);
    }

    const rules = Array.isArray(source.rules)
      ? source.rules.map((rule) => normalizeRule(rule, currency)).filter(Boolean)
      : [];

    return {
      id,
      name,
      target: roundAmount(target, currency || 'USD'),
      targetDate,
      color,
      createdAt,
      contributions: uniqueContributions,
      rules
    };
  }

  function normalizeContribution(source, currency) {
    if (!source || typeof source !== 'object') return null;
    const amount = Number(source.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (!isValidISODate(source.date)) return null;
    const sourceKind = source.source === 'auto' ? 'auto' : 'manual';
    const ruleId = safeId(source.ruleId) ? source.ruleId : '';
    let occurrence = typeof source.occurrence === 'string' ? source.occurrence : '';
    if (!occurrence && sourceKind === 'auto' && ruleId) occurrence = `${ruleId}|${source.date}`;
    return {
      id: safeId(source.id) ? source.id : makeId(),
      date: source.date,
      amount: roundAmount(amount, currency || 'USD'),
      note: String(source.note || '').slice(0, 100),
      source: sourceKind,
      ruleId,
      occurrence,
      createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString()
    };
  }

  function normalizeRule(source, currency) {
    if (!source || typeof source !== 'object') return null;
    const amount = Number(source.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const frequency = ['weekly', 'biweekly', 'monthly'].includes(source.frequency) ? source.frequency : 'weekly';
    let startDate = isValidISODate(source.startDate) ? source.startDate : todayISO();
    const weekday = Number.isInteger(source.weekday) && source.weekday >= 0 && source.weekday <= 6
      ? source.weekday
      : weekdayOfISO(startDate);

    if (frequency !== 'monthly') startDate = nextWeekdayOnOrAfter(startDate, weekday);

    let endDate = isValidISODate(source.endDate) ? source.endDate : '';
    if (endDate && endDate < startDate) endDate = '';
    const active = source.active !== false;
    const startDay = Number(startDate.slice(8, 10));
    const anchorDay = Number.isInteger(source.anchorDay) && source.anchorDay >= 1 && source.anchorDay <= 31
      ? source.anchorDay
      : startDay;

    let nextDate = isValidISODate(source.nextDate) ? source.nextDate : '';
    if (active && !nextDate) {
      if (!endDate || endDate >= todayISO()) nextDate = startDate;
    }
    if (active && endDate && nextDate && nextDate > endDate) nextDate = '';
    if (!active) nextDate = '';

    return {
      id: safeId(source.id) ? source.id : makeId(),
      amount: roundAmount(amount, currency || 'USD'),
      frequency,
      startDate,
      endDate,
      nextDate,
      active,
      anchorDay,
      weekday,
      note: String(source.note || '').slice(0, 100),
      createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString()
    };
  }

  function normalizeWeightGoal(source) {
    if (!source || typeof source !== 'object') return null;
    const startKg = Number(source.startKg);
    const targetKg = Number(source.targetKg);
    if (!Number.isFinite(startKg) || !Number.isFinite(targetKg) || startKg <= 0 || targetKg <= 0) return null;
    return {
      startKg: roundKg(startKg),
      targetKg: roundKg(targetKg),
      startDate: isValidISODate(source.startDate) ? source.startDate : todayISO()
    };
  }

  function normalizeWeighIn(source) {
    if (!source || typeof source !== 'object') return null;
    const kg = Number(source.kg);
    if (!Number.isFinite(kg) || kg <= 0 || kg > 500) return null;
    if (!isValidISODate(source.date)) return null;
    return {
      id: safeId(source.id) ? source.id : makeId(),
      date: source.date,
      kg: roundKg(kg),
      note: String(source.note || '').slice(0, 100),
      createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString()
    };
  }

  /* ---------- recurring rules ---------- */
  function advanceRuleDate(iso, rule) {
    if (rule.frequency === 'weekly') return addDaysISO(iso, 7);
    if (rule.frequency === 'biweekly') return addDaysISO(iso, 14);
    return addMonthsISO(iso, 1, rule.anchorDay || Number(iso.slice(8, 10)));
  }

  function firstOccurrenceOnOrAfter(rule, target) {
    let cursor = rule.startDate;
    let guard = 0;
    while (cursor < target && guard < 5000) {
      cursor = advanceRuleDate(cursor, rule);
      guard += 1;
    }
    return cursor;
  }

  function runRule(rule, jar) {
    if (!rule.active || !rule.nextDate) return 0;
    const today = todayISO();
    let next = rule.nextDate;
    if (rule.startDate && next < rule.startDate) next = rule.startDate;
    let generated = 0;
    let guard = 0;

    while (next && next <= today && guard < 1500) {
      if (rule.endDate && next > rule.endDate) {
        next = '';
        break;
      }
      const occurrence = `${rule.id}|${next}`;
      if (!jar.contributions.some((entry) => entry.occurrence === occurrence)) {
        jar.contributions.push({
          id: makeId(),
          date: next,
          amount: rule.amount,
          note: rule.note || 'Recurring contribution',
          source: 'auto',
          ruleId: rule.id,
          occurrence,
          createdAt: new Date().toISOString()
        });
        generated += 1;
      }
      next = advanceRuleDate(next, rule);
      guard += 1;
    }

    if (rule.endDate && next && next > rule.endDate) next = '';
    rule.nextDate = next;
    return generated;
  }

  function catchUpAll(data) {
    let generated = 0;
    for (const person of Object.values(data.people)) {
      for (const jar of person.jars) {
        for (const rule of jar.rules) {
          if (rule.active) generated += runRule(rule, jar);
        }
      }
    }
    return generated;
  }

  /* ---------- derived savings data ---------- */
  function jarTotal(jar) {
    return jar.contributions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  }

  function jarPercent(jar) {
    if (!jar.target || jar.target <= 0) return 0;
    return Math.round((jarTotal(jar) / jar.target) * 100);
  }

  function personTotal(person) {
    return person.jars.reduce((sum, jar) => sum + jarTotal(jar), 0);
  }

  function personTarget(person) {
    return person.jars.reduce((sum, jar) => sum + Number(jar.target || 0), 0);
  }

  function personPercent(person) {
    const target = personTarget(person);
    return target > 0 ? Math.round((personTotal(person) / target) * 100) : 0;
  }

  function nextRuleForJar(jar) {
    return jar.rules
      .filter((rule) => rule.active && rule.nextDate)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0] || null;
  }

  function ruleStatus(rule) {
    if (!rule.active) return { key: 'paused', label: 'Paused' };
    if (!rule.nextDate) return { key: 'ended', label: 'Ended' };
    return { key: 'active', label: 'Active' };
  }

  function ruleFrequencyLabel(rule) {
    const day = NG.weekdayName(rule.weekday);
    if (rule.frequency === 'weekly') return `Every ${day}`;
    if (rule.frequency === 'biweekly') return `Every other ${day}`;
    return `Monthly on the ${NG.ordinal(rule.anchorDay || Number(rule.startDate.slice(8, 10)))}`;
  }

  function ruleSubtext(rule) {
    if (!rule.active) return 'Paused — no new contributions';
    if (!rule.nextDate) {
      return rule.endDate ? `Ended ${formatShortDate(rule.endDate)}` : 'Schedule complete';
    }
    const difference = daysBetween(todayISO(), rule.nextDate);
    if (difference === 0) return 'Due today';
    if (difference === 1) return 'Due tomorrow';
    if (difference > 1) return `Due in ${difference} days`;
    return `Due ${formatShortDate(rule.nextDate)}`;
  }

  function sortRules(rules) {
    const order = { active: 0, paused: 1, ended: 2 };
    return [...rules].sort((a, b) => {
      const statusA = ruleStatus(a);
      const statusB = ruleStatus(b);
      if (order[statusA.key] !== order[statusB.key]) return order[statusA.key] - order[statusB.key];
      return String(a.nextDate || '9999').localeCompare(String(b.nextDate || '9999'));
    });
  }

  function jarPace(jar, currency) {
    const remaining = Math.max(0, Number(jar.target || 0) - jarTotal(jar));
    if (remaining <= 0) return 'Goal reached';
    if (!jar.targetDate) return '';
    const days = daysBetween(todayISO(), jar.targetDate);
    if (days < 0) return 'Target date passed';
    const months = Math.max(1, days / 30.44);
    return `${formatMoneyExactPerMonth(remaining / months, currency)}/mo to hit ${formatShortDate(jar.targetDate)}`;
  }

  function formatMoneyExactPerMonth(value, currency) {
    const meta = CURRENCIES[currency] || CURRENCIES.USD;
    const rounded = meta.decimals === 0 ? Math.ceil(value / 1000) * 1000 : Math.ceil(value);
    return formatMoney(rounded, currency);
  }

  function groupContributions(jar) {
    const sorted = [...jar.contributions].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    const groups = new Map();
    for (const entry of sorted) {
      const key = entry.date.slice(0, 7);
      if (!groups.has(key)) {
        groups.set(key, { key, label: NG.formatMonthYear(entry.date), total: 0, entries: [] });
      }
      const group = groups.get(key);
      group.entries.push(entry);
      group.total += Number(entry.amount || 0);
    }
    return Array.from(groups.values());
  }

  /* ---------- weight ---------- */
  function sortedWeighIns(person) {
    return [...person.weighIns].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  }

  function latestWeighIn(person) {
    const sorted = sortedWeighIns(person);
    return sorted.length ? sorted[sorted.length - 1] : null;
  }

  function weightStats(person) {
    const goal = person.weightGoal;
    if (!goal) return null;

    const latest = latestWeighIn(person);
    const currentKg = latest ? latest.kg : goal.startKg;
    const losing = goal.targetKg < goal.startKg;
    const total = Math.abs(goal.startKg - goal.targetKg);
    const progressAmount = losing ? goal.startKg - currentKg : currentKg - goal.startKg;
    const pct = total > 0 ? Math.round(clamp(progressAmount / total, 0, 1) * 100) : 0;
    const complete = total > 0 && (losing ? currentKg <= goal.targetKg : currentKg >= goal.targetKg);
    const toGoKg = complete ? 0 : Math.max(0, losing ? currentKg - goal.targetKg : goal.targetKg - currentKg);

    let deltaKg = null;
    let deltaBasis = '';
    if (latest) {
      const earlier = sortedWeighIns(person).filter((entry) => entry.id !== latest.id && entry.date <= latest.date);
      if (earlier.length) {
        const previous = earlier[earlier.length - 1];
        deltaKg = latest.kg - previous.kg;
        deltaBasis = 'entry';
      } else if (latest.date > goal.startDate) {
        deltaKg = latest.kg - goal.startKg;
        deltaBasis = 'start';
      }
    }

    const week = NG.startOfWeekISO(todayISO());
    const weekLogged = person.weighIns.some((entry) => NG.startOfWeekISO(entry.date) === week)
      || (goal.startDate && NG.startOfWeekISO(goal.startDate) === week);

    return {
      goal,
      latest,
      currentKg,
      losing,
      total,
      pct,
      complete,
      toGoKg,
      deltaKg,
      deltaBasis,
      weekLogged
    };
  }

  function deltaSummary(stats, unit) {
    if (stats.deltaKg == null) return '';
    const delta = stats.deltaKg;
    if (Math.abs(delta) < 0.05) {
      return stats.deltaBasis === 'start' ? 'At your starting weight' : 'No change since last weigh-in';
    }
    const direction = delta < 0 ? 'down' : 'up';
    const basis = stats.deltaBasis === 'start' ? 'since your start' : 'since last weigh-in';
    return `${NG.displayWeight(Math.abs(delta), unit)} ${unit} ${direction} ${basis}`;
  }

  NG.DATA_VERSION = DATA_VERSION;
  NG.defaultPerson = defaultPerson;
  NG.defaultData = defaultData;
  NG.peopleList = peopleList;
  NG.nextPersonOrder = nextPersonOrder;
  NG.normalizeData = normalizeData;
  NG.normalizePerson = normalizePerson;
  NG.normalizeJar = normalizeJar;
  NG.normalizeContribution = normalizeContribution;
  NG.normalizeRule = normalizeRule;
  NG.normalizeWeightGoal = normalizeWeightGoal;
  NG.normalizeWeighIn = normalizeWeighIn;
  NG.advanceRuleDate = advanceRuleDate;
  NG.firstOccurrenceOnOrAfter = firstOccurrenceOnOrAfter;
  NG.runRule = runRule;
  NG.catchUpAll = catchUpAll;
  NG.jarTotal = jarTotal;
  NG.jarPercent = jarPercent;
  NG.personTotal = personTotal;
  NG.personTarget = personTarget;
  NG.personPercent = personPercent;
  NG.nextRuleForJar = nextRuleForJar;
  NG.ruleStatus = ruleStatus;
  NG.ruleFrequencyLabel = ruleFrequencyLabel;
  NG.ruleSubtext = ruleSubtext;
  NG.sortRules = sortRules;
  NG.jarPace = jarPace;
  NG.groupContributions = groupContributions;
  NG.sortedWeighIns = sortedWeighIns;
  NG.latestWeighIn = latestWeighIn;
  NG.weightStats = weightStats;
  NG.deltaSummary = deltaSummary;
})(window.NG = window.NG || {});
