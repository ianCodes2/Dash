/* Apply Kit — page-side matcher, filler, and picker bridge. */
(() => {
  "use strict";
  if (window.__applyKit) return;

  const schema = window.ApplyKitSchema;
  const rules = window.ApplyKitRules;
  const ui = window.ApplyKitUI;

  if (!rules) {
    console.warn("Apply Kit: rules.js was not injected.");
    return;
  }
  if (!ui) {
    console.warn("Apply Kit: picker.js was not injected.");
    return;
  }

  const SECTIONS = schema?.sections || [];
  const FIELDS = schema?.fields || [];
  const FIELD_BY_KEY = new Map(FIELDS.map((field) => [field.key, field]));
  const {
    SENSITIVE_KEYS,
    SKIP_TYPES,
    SKIP_TEXT_RE,
    SIGNAL_WEIGHTS,
    AUTOCOMPLETE_MAP,
    RULES
  } = rules;

  const normalize = rules.simpleNormalize;
  const rootIds = new WeakMap();
  let rootIdSeq = 0;
  let undoStack = [];

  function idFor(object) {
    if (!object) return "";
    if (!rootIds.has(object)) {
      rootIdSeq += 1;
      rootIds.set(object, `ak-root-${rootIdSeq}`);
    }
    return rootIds.get(object);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function uniqueJoin(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
      const text = cleanText(value);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out.join(" ");
  }

  function getRoot(el) {
    return el.getRootNode ? el.getRootNode() : document;
  }

  function queryInRoot(root, selector) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function getLabelText(el) {
    const parts = [];
    if (el.labels) {
      for (const label of el.labels) parts.push(label.innerText || label.textContent);
    }
    const wrapping = el.closest?.("label");
    if (wrapping) parts.push(wrapping.innerText || wrapping.textContent);
    const root = getRoot(el);
    if (el.id) {
      const forLabel = queryInRoot(root, `label[for="${cssEscape(el.id)}"]`);
      if (forLabel) parts.push(forLabel.innerText || forLabel.textContent);
    }
    return uniqueJoin(parts);
  }

  function getAriaText(el) {
    const parts = [];
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) parts.push(ariaLabel);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const root = getRoot(el);
      for (const id of labelledBy.split(/\s+/)) {
        if (!id) continue;
        const node = root.getElementById?.(id) || queryInRoot(root, `[id="${cssEscape(id)}"]`);
        if (node) parts.push(node.innerText || node.textContent);
      }
    }
    const description = el.getAttribute("aria-description");
    if (description) parts.push(description);
    return uniqueJoin(parts);
  }

  function getAutomationText(el) {
    return uniqueJoin([
      el.getAttribute("data-field"),
      el.getAttribute("data-testid"),
      el.getAttribute("data-automation-id"),
      el.getAttribute("data-qa"),
      el.getAttribute("data-name"),
      el.getAttribute("data-label")
    ]);
  }

  function getNearbyText(el) {
    const parts = [];
    const previous = el.previousElementSibling;
    if (previous) {
      const text = cleanText(previous.innerText || previous.textContent);
      if (text && text.length < 110) parts.push(text);
    }
    const parent = el.parentElement;
    if (parent) {
      const clone = parent.cloneNode(true);
      clone.querySelectorAll("input, textarea, select, button, option, script, style, svg").forEach((node) => node.remove());
      const text = cleanText(clone.textContent);
      if (text && text.length < 150) parts.push(text);
    }
    return uniqueJoin(parts);
  }

  function getSectionText(el) {
    const parts = [];
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) parts.push(legend.innerText || legend.textContent);
    }

    const container = el.closest('section, article, [role="group"], [class*="section"], [class*="form-group"], [class*="field"]');
    if (container) {
      const heading = container.querySelector("h1, h2, h3, h4, h5, h6, legend, [role='heading']");
      if (heading) parts.push(heading.innerText || heading.textContent);
    }

    let node = el.parentElement;
    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      let previous = node.previousElementSibling;
      while (previous) {
        if (/^H[1-6]$/.test(previous.tagName) || previous.getAttribute?.("role") === "heading") {
          parts.push(previous.innerText || previous.textContent);
          break;
        }
        previous = previous.previousElementSibling;
      }
      if (parts.length) break;
    }

    return uniqueJoin(parts);
  }

  function getTextWithoutOptions(container) {
    if (!container) return "";
    const clone = container.cloneNode(true);
    clone.querySelectorAll("input, textarea, select, button, option, script, style, svg, label").forEach((node) => node.remove());
    return cleanText(clone.textContent).slice(0, 160);
  }

  function getRadioQuestion(radios) {
    const first = radios[0];
    if (!first) return "";

    const fieldset = first.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) return cleanText(legend.innerText || legend.textContent);
    }

    const group = first.closest('[role="radiogroup"]');
    if (group) {
      const aria = getAriaText(group);
      if (aria) return aria;
    }

    const container = first.closest('fieldset, [role="radiogroup"], [class*="form-group"], [class*="field"], [class*="question"], div');
    const withoutOptions = getTextWithoutOptions(container);
    if (withoutOptions) return withoutOptions;

    return getSectionText(first) || getNearbyText(first);
  }

  function getOptionLabel(el) {
    if (el.labels && el.labels.length) {
      return uniqueJoin([...el.labels].map((label) => label.innerText || label.textContent));
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return cleanText(aria);
    const wrapping = el.closest("label");
    if (wrapping) return cleanText(wrapping.innerText || wrapping.textContent);
    const root = getRoot(el);
    if (el.id) {
      const forLabel = queryInRoot(root, `label[for="${cssEscape(el.id)}"]`);
      if (forLabel) return cleanText(forLabel.innerText || forLabel.textContent);
    }
    const next = el.nextElementSibling;
    if (next && /^(SPAN|DIV|P)$/.test(next.tagName)) {
      const text = cleanText(next.innerText || next.textContent);
      if (text) return text;
    }
    return cleanText(el.value);
  }

  function getSignals(el) {
    return {
      label: getLabelText(el),
      aria: getAriaText(el),
      placeholder: el.getAttribute("placeholder") || "",
      name: el.getAttribute("name") || "",
      id: el.id || "",
      title: el.getAttribute("title") || "",
      automation: getAutomationText(el),
      nearby: getNearbyText(el),
      section: getSectionText(el)
    };
  }

  function getRadioSignals(radios) {
    const first = radios[0];
    const question = getRadioQuestion(radios);
    const firstOption = getOptionLabel(first);
    const nearby = getNearbyText(first);
    return {
      label: question,
      aria: getAriaText(first.closest('[role="radiogroup"]') || first),
      placeholder: "",
      name: first.name || "",
      id: first.id || "",
      title: first.getAttribute("title") || "",
      automation: getAutomationText(first),
      nearby: nearby && normalize(nearby) !== normalize(firstOption) ? nearby : "",
      section: getSectionText(first)
    };
  }

  function getInputType(el) {
    if (el.tagName !== "INPUT") return "";
    return (el.getAttribute("type") || "text").toLowerCase();
  }

  function kindOf(el) {
    if (!el) return "";
    if (el.tagName === "SELECT") return "select";
    if (el.tagName === "TEXTAREA") return "textarea";
    if (el.type === "radio") return "radio";
    if (el.isContentEditable) return "contenteditable";
    return getInputType(el) || "text";
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    try {
      if (!el.getClientRects().length) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (Number(style.opacity) === 0) return false;
    } catch {
      return false;
    }
    return true;
  }

  function isEligibleControl(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.hidden) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    if (!isVisible(el)) return false;
    if (el.tagName === "INPUT") {
      const type = getInputType(el);
      if (SKIP_TYPES.has(type)) return false;
    }
    return true;
  }

  function isSkipField(el, signals) {
    const text = normalize([
      signals.label,
      signals.aria,
      signals.placeholder,
      signals.name,
      signals.id,
      signals.title,
      signals.automation,
      signals.nearby
    ].join(" "));
    if (SKIP_TEXT_RE.test(text)) return true;
    if (el.tagName === "INPUT") {
      const type = getInputType(el);
      if (type === "password" || type === "search" || type === "checkbox" || type === "file") return true;
    }
    return false;
  }

  function collectPage() {
    const controls = [];
    const fileInputs = [];
    const radioCandidates = [];
    const seenControls = new Set();
    const seenRadios = new Set();

    function walk(root) {
      const nodes = root.querySelectorAll('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
      for (const el of nodes) {
        if (el.getRootNode()?.host?.hasAttribute?.("data-apply-kit")) continue;

        if (el.tagName === "INPUT") {
          const type = getInputType(el);
          if (type === "file") {
            if (isVisible(el) && !el.disabled) fileInputs.push(el);
            continue;
          }
          if (type === "radio") {
            if (!seenRadios.has(el)) {
              seenRadios.add(el);
              radioCandidates.push(el);
            }
            continue;
          }
          if (SKIP_TYPES.has(type)) continue;
        }

        if (seenControls.has(el) || !isEligibleControl(el)) continue;
        seenControls.add(el);
        controls.push(el);
      }

      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }

    walk(document);

    const groups = new Map();
    for (const radio of radioCandidates) {
      if (!isEligibleControl(radio)) continue;
      const fieldset = radio.closest("fieldset");
      const key = [
        radio.name || "no-name",
        radio.form ? idFor(radio.form) : "",
        fieldset ? idFor(fieldset) : "",
        idFor(getRoot(radio))
      ].join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(radio);
    }

    const radioGroups = [];
    for (const radios of groups.values()) {
      if (radios.length < 2) continue;
      radioGroups.push({
        radios,
        name: radios[0].name || "",
        question: getRadioQuestion(radios),
        signals: getRadioSignals(radios)
      });
    }

    return { controls, radioGroups, fileInputs };
  }

  function describeElement(el) {
    const signals = getSignals(el);
    return cleanText(signals.label || signals.aria || signals.placeholder || signals.name || el.tagName.toLowerCase()).slice(0, 70);
  }

  function customAnswers(profile) {
    return Array.isArray(profile?.customAnswers) ? profile.customAnswers : [];
  }

  function valueForKey(profile, key) {
    if (!key) return "";
    if (key === "fullName") {
      return uniqueJoin([profile.firstName, profile.middleName, profile.lastName]);
    }
    if (key === "fullAddress") {
      const cityState = uniqueJoin([profile.city, profile.state].filter(Boolean).join(", "));
      return [profile.address1, profile.address2, cityState, profile.postalCode, profile.country]
        .map(cleanText)
        .filter(Boolean)
        .join(", ");
    }
    if (key === "cityState") {
      return [profile.city, profile.state].map(cleanText).filter(Boolean).join(", ");
    }
    if (key === "phoneFull") {
      return [profile.phoneCountry, profile.phone].map(cleanText).filter(Boolean).join(" ");
    }
    if (key.startsWith("custom:")) {
      const index = Number(key.slice("custom:".length));
      return cleanText(customAnswers(profile)[index]?.value);
    }
    return cleanText(profile?.[key]);
  }

  function metaForKey(key, profile) {
    if (key.startsWith("custom:")) {
      const index = Number(key.slice("custom:".length));
      const answer = customAnswers(profile)[index];
      return { label: cleanText(answer?.label) || "Custom answer", sensitive: false };
    }
    const field = FIELD_BY_KEY.get(key);
    return {
      label: field?.label || key,
      sensitive: Boolean(field?.sensitive || SENSITIVE_KEYS.has(key))
    };
  }

  function addScore(scores, key, value, reason) {
    const current = scores.get(key);
    if (!current || value > current.score) scores.set(key, { score: value, reason });
  }

  function scoreSignals(signals, profile, kind, el) {
    const scores = new Map();
    const combined = normalize([
      signals.label,
      signals.aria,
      signals.placeholder,
      signals.name,
      signals.id,
      signals.title,
      signals.automation,
      signals.nearby,
      signals.section
    ].join(" "));

    if (el && kind !== "radio") {
      const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
      for (const token of autocomplete.split(/\s+/)) {
        const key = AUTOCOMPLETE_MAP[token];
        if (key) addScore(scores, key, 112, "autocomplete");
      }
      const type = getInputType(el);
      if (type === "email") addScore(scores, "email", 132, "type");
      if (type === "tel" && !/\b(country code|dialing code|phone code)\b/i.test(combined)) {
        addScore(scores, "phone", 132, "type");
      }
    }

    for (const rule of RULES) {
      if (rule.kinds && !rule.kinds.includes(kind)) continue;
      if (rule.veto && rule.veto.test(combined)) continue;
      if (rule.requires && !rule.requires.test(combined)) continue;

      if (rule.types && el && kind !== "radio" && rule.key !== "dateOfBirth") {
        if (rule.types.includes(getInputType(el))) {
          addScore(scores, rule.key, 132 + (rule.priority || 0), "type");
        }
      }

      for (const term of rule.terms || []) {
        const termNormalized = normalize(term);
        if (!termNormalized) continue;
        const pattern = new RegExp(`\\b${escapeRegExp(termNormalized)}\\b`, "i");
        for (const [signalName, weight] of Object.entries(SIGNAL_WEIGHTS)) {
          const text = signals[signalName];
          if (!text) continue;
          const normalized = normalize(text);
          if (!normalized || !pattern.test(normalized)) continue;
          let score = weight + Math.min(termNormalized.length, 18) * 0.9 + (rule.priority || 0);
          if (normalized === termNormalized) score += 14;
          if (signalName === "nearby" || signalName === "section") score = Math.min(score, 52);
          addScore(scores, rule.key, score, `${signalName}:${term}`);
        }
      }

      for (const term of rule.exact || []) {
        const termNormalized = normalize(term);
        if (!termNormalized) continue;
        for (const [signalName, weight] of Object.entries(SIGNAL_WEIGHTS)) {
          const text = signals[signalName];
          if (!text) continue;
          if (normalize(text) !== termNormalized) continue;
          addScore(scores, rule.key, weight + (rule.priority || 0) + 10, `${signalName}:${term}`);
        }
      }
    }

    customAnswers(profile).forEach((answer, index) => {
      const answerValue = cleanText(answer?.value);
      if (!answerValue) return;
      const answerLabel = normalize(answer.label);
      const keywords = String(answer.keywords || "")
        .split(",")
        .map((keyword) => normalize(keyword))
        .filter(Boolean);

      for (const [signalName, weight] of Object.entries(SIGNAL_WEIGHTS)) {
        const text = signals[signalName];
        if (!text) continue;
        const normalized = normalize(text);
        if (!normalized) continue;

        if (answerLabel && normalized === answerLabel) {
          addScore(scores, `custom:${index}`, 150, `custom:${signalName}`);
        } else if (answerLabel && normalized.includes(answerLabel)) {
          addScore(scores, `custom:${index}`, 128, `custom:${signalName}`);
        }

        for (const keyword of keywords) {
          if (!keyword) continue;
          const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
          if (pattern.test(normalized)) {
            addScore(scores, `custom:${index}`, weight + 18, `custom-keyword:${signalName}`);
          }
        }
      }
    });

    const usable = [...scores.entries()].filter(([key]) => valueForKey(profile, key));
    if (!usable.length) return null;
    usable.sort((a, b) => b[1].score - a[1].score);

    const [topKey, top] = usable[0];
    const second = usable.find(([key]) => key !== topKey);
    if (top.score < 55) return null;
    if (second && top.score - second[1].score < 7) return null;

    const meta = metaForKey(topKey, profile);
    return {
      key: topKey,
      score: top.score,
      reason: top.reason,
      label: meta.label,
      sensitive: meta.sensitive
    };
  }

  function matchField(el, profile) {
    const signals = getSignals(el);
    if (isSkipField(el, signals)) return null;
    return scoreSignals(signals, profile, kindOf(el), el);
  }

  function matchRadioGroup(group, profile) {
    return scoreSignals(group.signals, profile, "radio", group.radios[0]);
  }

  function isEmptyControl(el) {
    if (!el) return true;
    if (el.isContentEditable) return !cleanText(el.textContent);
    if (el.tagName === "SELECT") {
      if (!el.value) return true;
      const option = el.options[el.selectedIndex];
      const text = cleanText(option?.textContent);
      return /^(select|choose|please select|please choose|select one|select an option|choose an option|--|—|none)(\.{3}|…)?$/i.test(text);
    }
    return !cleanText(el.value);
  }

  function fire(el, type) {
    let event;
    try {
      event = type === "input" && typeof InputEvent === "function"
        ? new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText" })
        : new Event(type, { bubbles: true, composed: true });
    } catch {
      event = new Event(type, { bubbles: true, composed: true });
    }
    el.dispatchEvent(event);
  }

  function rememberValue(el) {
    if (el.isContentEditable) {
      undoStack.push({ kind: "content", el, html: el.innerHTML });
      return;
    }
    undoStack.push({ kind: "value", el, value: el.value });
  }

  function rememberRadio(radio) {
    const root = getRoot(radio);
    let group = [radio];
    if (radio.name) {
      try {
        group = [...root.querySelectorAll(`input[type="radio"][name="${cssEscape(radio.name)}"]`)];
      } catch {
        group = [radio];
      }
    }
    undoStack.push({
      kind: "radio",
      group: group.map((el) => ({ el, checked: el.checked }))
    });
  }

  function setNativeValue(el, value) {
    if (el.isContentEditable) {
      el.focus({ preventScroll: true });
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      let inserted = false;
      try {
        inserted = document.execCommand("insertText", false, value);
      } catch {
        inserted = false;
      }
      if (!inserted) el.textContent = value;
      fire(el, "input");
      fire(el, "change");
      return;
    }

    const prototype = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    fire(el, "input");
    fire(el, "change");
    fire(el, "blur");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toDateInput(value) {
    const text = cleanText(value);
    if (!text || /^(present|current|now)$/i.test(text)) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    let match = text.match(/^(\d{4})-(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-01`;
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return `${match[3]}-${pad2(match[1])}-${pad2(match[2])}`;
    match = text.match(/^(\d{1,2})\/(\d{4})$/);
    if (match) return `${match[2]}-${pad2(match[1])}-01`;
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }
    return "";
  }

  function toMonthInput(value) {
    const text = cleanText(value);
    if (!text) return "";
    if (/^\d{4}-\d{2}$/.test(text)) return text;
    const date = toDateInput(text);
    return date ? date.slice(0, 7) : "";
  }

  function adaptValue(el, key, rawValue) {
    let value = cleanText(rawValue);
    if (!value) return "";
    if (el.isContentEditable) return value;

    const type = getInputType(el);
    if (type === "date") return toDateInput(value);
    if (type === "month") return toMonthInput(value);
    if (type === "number") {
      const numeric = value.replace(/[^0-9.-]/g, "");
      return numeric || "";
    }
    if (el.tagName === "SELECT" || type === "radio" || type === "checkbox") return value;
    return value;
  }

  function matchChoice(options, value, key) {
    const normalizedValue = normalize(value);
    if (!normalizedValue) return null;

    const normalizedOptions = options
      .map((option, index) => ({
        ...option,
        index,
        normalizedValue: normalize(option.value),
        normalizedText: normalize(option.text)
      }))
      .filter((option) => !option.disabled);

    let match = normalizedOptions.find((option) =>
      option.normalizedValue === normalizedValue || option.normalizedText === normalizedValue
    );
    if (match) return match;

    // Treat spacing differences as equal: "Non-binary" vs "Nonbinary", "U S A" vs "USA".
    const compactValue = normalizedValue.replace(/\s+/g, "");
    match = normalizedOptions.find((option) =>
      option.normalizedValue.replace(/\s+/g, "") === compactValue ||
      option.normalizedText.replace(/\s+/g, "") === compactValue
    );
    if (match) return match;

    match = normalizedOptions.find((option) =>
      option.normalizedValue.startsWith(normalizedValue) ||
      option.normalizedText.startsWith(normalizedValue) ||
      option.normalizedValue.includes(normalizedValue) ||
      option.normalizedText.includes(normalizedValue)
    );
    if (match) return match;

    const aliases = rules.getAliases(value, key);
    for (const alias of aliases) {
      if (!alias || alias === normalizedValue) continue;
      match = normalizedOptions.find((option) =>
        option.normalizedValue === alias ||
        option.normalizedText === alias ||
        option.normalizedText.includes(alias) ||
        option.normalizedValue.includes(alias)
      );
      if (match) return match;
    }

    if (normalizedValue === "yes") {
      return normalizedOptions.find((option) =>
        /\byes\b/i.test(option.text) ||
        /authorized|authorised|eligible|willing|able to|i am authorized|i am eligible/i.test(option.text)
      ) || null;
    }

    if (normalizedValue === "no") {
      return normalizedOptions.find((option) =>
        /\bno\b/i.test(option.text) ||
        /not authorized|not authorised|do not require|no sponsorship|not willing|unable to relocate|do not need sponsorship/i.test(option.text)
      ) || null;
    }

    return null;
  }

  function applyText(el, value) {
    rememberValue(el);
    setNativeValue(el, value);
    return true;
  }

  function applySelect(el, value, key) {
    const options = [...el.options].map((option) => ({
      value: option.value,
      text: option.textContent || "",
      disabled: option.disabled
    }));
    const match = matchChoice(options, value, key);
    if (!match) return false;

    rememberValue(el);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(el, match.value);
    else el.value = match.value;
    if (el.value !== match.value) el.selectedIndex = match.index;
    fire(el, "input");
    fire(el, "change");
    return true;
  }

  function applyRadioGroup(radios, value, key) {
    const options = radios.map((radio) => ({
      radio,
      value: radio.value,
      text: getOptionLabel(radio),
      disabled: radio.disabled
    }));
    const match = matchChoice(options, value, key);
    if (!match) return false;

    rememberRadio(match.radio);
    if (!match.radio.checked) {
      try {
        match.radio.click();
      } catch {
        /* ignore */
      }
      if (!match.radio.checked) {
        match.radio.checked = true;
        fire(match.radio, "input");
        fire(match.radio, "change");
      }
    }
    return true;
  }

  function groupRadios(radio) {
    const root = getRoot(radio);
    if (!radio.name) return [radio];
    try {
      return [...root.querySelectorAll(`input[type="radio"][name="${cssEscape(radio.name)}"]`)];
    } catch {
      return [radio];
    }
  }

  function undoLastFill() {
    if (!undoStack.length) return false;

    for (const entry of undoStack.slice().reverse()) {
      if (entry.kind === "value") {
        if (!entry.el?.isConnected) continue;
        const prototype = entry.el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : entry.el.tagName === "SELECT"
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (setter) setter.call(entry.el, entry.value);
        else entry.el.value = entry.value;
        fire(entry.el, "input");
        fire(entry.el, "change");
      } else if (entry.kind === "content") {
        if (!entry.el?.isConnected) continue;
        entry.el.innerHTML = entry.html;
        fire(entry.el, "input");
        fire(entry.el, "change");
      } else if (entry.kind === "radio") {
        for (const item of entry.group) {
          if (!item.el?.isConnected) continue;
          item.el.checked = item.checked;
          fire(item.el, "change");
        }
      }
    }

    undoStack = [];
    ui.showToast({ message: "Autofill undone.", duration: 4500 });
    return true;
  }

  function applyValue(el, value, key) {
    if (!el) return false;
    if (el.tagName === "SELECT") return applySelect(el, value, key);
    if (el.type === "radio") return applyRadioGroup(groupRadios(el), value, key);
    const adapted = adaptValue(el, key, value);
    if (!adapted) return false;
    return applyText(el, adapted);
  }

  function fillMessage(result) {
    if (result.filled > 0) {
      let message = `Filled ${result.filled} field${result.filled === 1 ? "" : "s"}`;
      if (result.skipped > 0) message += ` · ${result.skipped} left alone`;
      if (result.sensitiveSkipped > 0) message += ` · ${result.sensitiveSkipped} sensitive skipped`;
      if (result.fileInputs > 0) message += " · resume upload is manual";
      return message;
    }
    if (result.found === 0) {
      if (result.fileInputs > 0) return "Resume/CV upload needs a manual click.";
      return "No fillable fields found on this page.";
    }
    if (result.sensitiveSkipped > 0) {
      return "Only sensitive fields were found, and sensitive filling is turned off.";
    }
    return "Fields found, but nothing was empty.";
  }

  function buildPickerItems(profile) {
    const items = [];
    const add = (key, label, value, sectionTitle, sensitive) => {
      const text = cleanText(value);
      if (!text) return;
      items.push({
        key,
        label,
        value: text,
        sectionTitle,
        sensitive: Boolean(sensitive)
      });
    };

    const personalTitle = SECTIONS.find((section) => section.id === "personal")?.title || "Personal";
    add("fullName", "Full name", valueForKey(profile, "fullName"), personalTitle, false);
    add("fullAddress", "Full address", valueForKey(profile, "fullAddress"), personalTitle, false);
    add("cityState", "City, state", valueForKey(profile, "cityState"), personalTitle, false);
    add("phoneFull", "Phone with country code", valueForKey(profile, "phoneFull"), personalTitle, false);

    for (const section of SECTIONS) {
      for (const field of section.fields) {
        add(
          field.key,
          field.label,
          valueForKey(profile, field.key),
          section.title,
          Boolean(field.sensitive || section.sensitive)
        );
      }
    }

    customAnswers(profile).forEach((answer, index) => {
      add(
        `custom:${index}`,
        cleanText(answer?.label) || "Custom answer",
        answer?.value,
        "Custom answers",
        false
      );
    });

    return items;
  }

  function isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === "TEXTAREA") return !target.disabled && !target.readOnly;
    if (target.tagName === "SELECT") return !target.disabled;
    if (target.tagName === "INPUT") {
      const type = getInputType(target);
      if (["hidden", "file", "checkbox", "submit", "button", "reset", "image", "range", "color", "search", "password"].includes(type)) {
        return false;
      }
      return !target.disabled && !target.readOnly;
    }
    return false;
  }

  function getDeepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function flash(el) {
    if (!el?.style) return;
    const previousOutline = el.style.outline;
    const previousOffset = el.style.outlineOffset;
    el.style.outline = "2px solid #2f6f5e";
    el.style.outlineOffset = "2px";
    setTimeout(() => {
      if (!el.isConnected) return;
      el.style.outline = previousOutline;
      el.style.outlineOffset = previousOffset;
    }, 1100);
  }

  function showPicker(profile, settings) {
    const target = getDeepActiveElement();
    if (!isEditableTarget(target)) {
      return { shown: false, reason: "no-field" };
    }

    const items = buildPickerItems(profile);
    if (!items.length) {
      ui.showToast({
        message: "Your Apply Kit profile is empty. Add your details first.",
        duration: 6000
      });
      return { shown: true, reason: "empty" };
    }

    ui.openPicker({
      target,
      fieldLabel: describeElement(target),
      items,
      onChoose(item) {
        if (!target.isConnected) {
          return { ok: false, error: "That field is no longer on the page." };
        }
        const ok = applyValue(target, item.value, item.key);
        if (!ok) {
          const isChoice = target.tagName === "SELECT" || target.type === "radio";
          return {
            ok: false,
            error: isChoice
              ? "This field has no matching option for that value. Try another value."
              : "This field can’t accept that value."
          };
        }
        flash(target);
        return { ok: true };
      }
    });

    return { shown: true };
  }

  function showHint(message) {
    ui.showToast({
      message: cleanText(message) || "Click a form field first.",
      duration: 6000
    });
    return true;
  }

  function fillPage(profile = {}, settings = {}) {
    const options = {
      onlyEmpty: true,
      fillSensitive: true,
      ...(schema?.defaults || {}),
      ...settings
    };

    undoStack = [];
    const { controls, radioGroups, fileInputs } = collectPage();
    const filledKeys = new Set();
    const unmatched = [];
    let found = 0;
    let filled = 0;
    let skipped = 0;
    let sensitiveSkipped = 0;

    const recordUnmatched = (el) => {
      if (unmatched.length >= 8) return;
      const label = describeElement(el);
      if (label) unmatched.push(label);
    };

    for (const el of controls) {
      const signals = getSignals(el);
      if (isSkipField(el, signals)) continue;
      found += 1;

      const match = scoreSignals(signals, profile, kindOf(el), el);
      if (!match) {
        skipped += 1;
        recordUnmatched(el);
        continue;
      }
      if (match.sensitive && !options.fillSensitive) {
        sensitiveSkipped += 1;
        continue;
      }
      if (filledKeys.has(match.key)) {
        skipped += 1;
        continue;
      }
      if (options.onlyEmpty && !isEmptyControl(el)) {
        skipped += 1;
        continue;
      }

      const value = valueForKey(profile, match.key);
      if (!value) {
        skipped += 1;
        recordUnmatched(el);
        continue;
      }

      if (applyValue(el, value, match.key)) {
        filled += 1;
        filledKeys.add(match.key);
      } else {
        skipped += 1;
        recordUnmatched(el);
      }
    }

    for (const group of radioGroups) {
      found += 1;
      const match = scoreSignals(group.signals, profile, "radio", group.radios[0]);
      if (!match) {
        skipped += 1;
        recordUnmatched(group.radios[0]);
        continue;
      }
      if (match.sensitive && !options.fillSensitive) {
        sensitiveSkipped += 1;
        continue;
      }
      if (filledKeys.has(match.key)) {
        skipped += 1;
        continue;
      }
      if (options.onlyEmpty && group.radios.some((radio) => radio.checked)) {
        skipped += 1;
        continue;
      }

      const value = valueForKey(profile, match.key);
      if (!value) {
        skipped += 1;
        recordUnmatched(group.radios[0]);
        continue;
      }

      if (applyRadioGroup(group.radios, value, match.key)) {
        filled += 1;
        filledKeys.add(match.key);
      } else {
        skipped += 1;
        recordUnmatched(group.radios[0]);
      }
    }

    const result = {
      found,
      filled,
      skipped,
      sensitiveSkipped,
      fileInputs: fileInputs.length,
      unmatched
    };

    if (found > 0 || fileInputs.length > 0) {
      ui.showToast({
        message: fillMessage(result),
        onUndo: filled > 0 ? undoLastFill : undefined,
        duration: 12000
      });
    }

    return result;
  }

  window.__applyKit = {
    version: 1,
    fillPage,
    showPicker,
    showHint,
    undoLastFill
  };
})();
