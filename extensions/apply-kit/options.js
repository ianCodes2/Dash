/* Apply Kit — profile settings page. */
(() => {
  "use strict";

  const schema = window.ApplyKitSchema;
  if (!schema) return;

  const STORAGE_PROFILE = "applyKitProfile";
  const STORAGE_SETTINGS = "applyKitSettings";
  const PREVIEW_KEY = "applyKitPreview";
  const isExtension = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

  const form = document.getElementById("profileForm");
  const sectionsEl = document.getElementById("sections");
  const navEl = document.getElementById("sectionNav");
  const customList = document.getElementById("customList");
  const saveState = document.getElementById("saveState");
  const saveStateText = document.getElementById("saveStateText");
  const completion = document.getElementById("completion");
  const onlyEmpty = document.getElementById("onlyEmpty");
  const fillSensitive = document.getElementById("fillSensitive");
  const importFile = document.getElementById("importFile");

  let profile = { ...schema.getEmptyProfile(), customAnswers: [] };
  let settings = { ...schema.defaults };
  let customAnswers = [];
  let saveTimer = null;
  let saving = false;
  let pendingSave = false;
  let currentSection = "";

  const cssEscape = (value) => (window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&"));

  async function readAll() {
    if (isExtension) {
      return chrome.storage.local.get([STORAGE_PROFILE, STORAGE_SETTINGS]);
    }
    try {
      const raw = localStorage.getItem(PREVIEW_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  async function writeAll(nextProfile, nextSettings) {
    if (isExtension) {
      await chrome.storage.local.set({
        [STORAGE_PROFILE]: nextProfile,
        [STORAGE_SETTINGS]: nextSettings
      });
      return;
    }
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({
      [STORAGE_PROFILE]: nextProfile,
      [STORAGE_SETTINGS]: nextSettings,
      savedAt: new Date().toISOString()
    }));
  }

  function setSaveState(state, text) {
    if (!saveState || !saveStateText) return;
    saveState.dataset.state = state;
    saveStateText.textContent = text;
  }

  function createTag(text) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = text;
    return tag;
  }

  function createNavLink(id, title, count) {
    const link = document.createElement("a");
    link.className = "nav__link";
    link.href = `#section-${id}`;
    link.dataset.section = id;
    const label = document.createElement("span");
    label.textContent = title;
    const badge = document.createElement("span");
    badge.className = "nav__count";
    badge.dataset.navCount = id;
    badge.textContent = count;
    link.append(label, badge);
    return link;
  }

  function createField(field) {
    const wrap = document.createElement("div");
    wrap.className = `field${field.type === "textarea" ? " field--full" : ""}`;

    const label = document.createElement("label");
    label.className = "field__label";
    label.htmlFor = `field-${field.key}`;
    label.textContent = field.label;
    if (field.sensitive) label.appendChild(createTag("Sensitive"));

    let input;
    if (field.type === "textarea") {
      input = document.createElement("textarea");
      input.className = "textarea";
      input.rows = field.rows || 3;
      input.placeholder = field.placeholder || "";
    } else if (field.type === "select") {
      input = document.createElement("select");
      input.className = "select";
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Choose…";
      input.appendChild(blank);
      for (const option of field.options || []) {
        const item = document.createElement("option");
        item.value = option;
        item.textContent = option;
        input.appendChild(item);
      }
    } else {
      input = document.createElement("input");
      input.className = "input";
      input.type = field.type || "text";
      if (field.placeholder) input.placeholder = field.placeholder;
      if (["email", "tel", "url"].includes(field.type)) input.spellcheck = false;
      if (field.key === "ssn") {
        input.setAttribute("inputmode", "numeric");
        input.autocomplete = "off";
      }
    }

    input.id = `field-${field.key}`;
    input.dataset.key = field.key;
    if (field.autocomplete && field.key !== "ssn") input.autocomplete = field.autocomplete;
    else if (!input.getAttribute("autocomplete")) input.autocomplete = "off";

    wrap.append(label, input);
    return wrap;
  }

  function buildSections() {
    const navItems = [];

    for (const section of schema.sections) {
      const panel = document.createElement("section");
      panel.className = `panel${section.sensitive ? " panel--sensitive" : ""}`;
      panel.id = `section-${section.id}`;
      panel.dataset.section = section.id;

      const head = document.createElement("div");
      head.className = "panel__head";
      const headText = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = section.title;
      const description = document.createElement("p");
      description.textContent = section.subtitle;
      headText.append(title, description);
      head.appendChild(headText);

      if (section.sensitive) {
        const badge = document.createElement("span");
        badge.className = "panel__badge";
        badge.textContent = "Auto-fill controlled in Settings";
        head.appendChild(badge);
      }
      panel.appendChild(head);

      if (section.sensitive) {
        const warning = document.createElement("div");
        warning.className = "warning";
        warning.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path>
            <path d="M12 9v4"></path>
            <path d="M12 17h.01"></path>
          </svg>
          <span>These values are stored locally. They are only written to a page when sensitive filling is enabled in Fill settings, and you can always pick one manually.</span>
        `;
        panel.appendChild(warning);
      }

      const grid = document.createElement("div");
      grid.className = "field-grid";
      for (const field of section.fields) grid.appendChild(createField(field));
      panel.appendChild(grid);
      sectionsEl.appendChild(panel);

      navItems.push({
        id: section.id,
        title: section.title,
        count: `0/${section.fields.length}`
      });
    }

    navItems.push({ id: "customPanel", title: "Custom answers", count: "0" });
    navItems.push({ id: "settingsPanel", title: "Fill settings", count: "" });
    for (const item of navItems) navEl.appendChild(createNavLink(item.id, item.title, item.count));

    const panels = [...document.querySelectorAll("[data-section], #customPanel, #settingsPanel")];
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id.replace(/^section-/, ""));
      }, {
        rootMargin: "-12% 0px -68% 0px",
        threshold: [0, 0.1, 0.4]
      });
      for (const panel of panels) observer.observe(panel);
    }

    navEl.addEventListener("click", (event) => {
      const link = event.target.closest(".nav__link");
      if (!link) return;
      setActiveSection(link.dataset.section);
    });
  }

  function setActiveSection(id) {
    if (!id || id === currentSection) return;
    currentSection = id;
    for (const link of navEl.querySelectorAll(".nav__link")) {
      link.classList.toggle("active", link.dataset.section === id);
    }
  }

  function setFieldValues() {
    for (const field of schema.fields) {
      const input = form.querySelector(`[data-key="${cssEscape(field.key)}"]`);
      if (!input) continue;
      input.value = profile[field.key] ?? "";
    }
  }

  function applySettingsToForm() {
    onlyEmpty.checked = settings.onlyEmpty !== false;
    fillSensitive.checked = settings.fillSensitive !== false;
  }

  function collectProfile() {
    const next = schema.getEmptyProfile();
    for (const input of form.querySelectorAll("[data-key]")) {
      next[input.dataset.key] = input.value;
    }
    next.customAnswers = collectCustomAnswers();
    return next;
  }

  function collectSettings() {
    return {
      onlyEmpty: Boolean(onlyEmpty.checked),
      fillSensitive: Boolean(fillSensitive.checked)
    };
  }

  function readCustomRow(row) {
    return {
      label: row.querySelector("[data-custom-label]")?.value.trim() || "",
      keywords: row.querySelector("[data-custom-keywords]")?.value.trim() || "",
      value: row.querySelector("[data-custom-value]")?.value || ""
    };
  }

  function collectCustomAnswers() {
    return [...customList.querySelectorAll(".custom-row")]
      .map(readCustomRow)
      .filter((answer) => answer.label || answer.keywords || answer.value);
  }

  function createCustomRow(answer) {
    const row = document.createElement("div");
    row.className = "custom-row";

    const label = document.createElement("input");
    label.className = "input";
    label.type = "text";
    label.placeholder = "Question label — e.g. Why this company?";
    label.value = answer.label || "";
    label.dataset.customLabel = "true";
    label.setAttribute("aria-label", "Custom answer label");

    const keywords = document.createElement("input");
    keywords.className = "input";
    keywords.type = "text";
    keywords.placeholder = "Keywords — why, company, interested";
    keywords.value = answer.keywords || "";
    keywords.dataset.customKeywords = "true";
    keywords.setAttribute("aria-label", "Custom answer keywords");

    const value = document.createElement("textarea");
    value.className = "textarea custom-row__value";
    value.rows = 2;
    value.placeholder = "Your reusable answer";
    value.value = answer.value || "";
    value.dataset.customValue = "true";
    value.setAttribute("aria-label", "Custom answer value");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "custom-row__remove";
    remove.setAttribute("aria-label", "Remove custom answer");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      customAnswers = [...customList.querySelectorAll(".custom-row")]
        .filter((candidate) => candidate !== row)
        .map(readCustomRow)
        .filter((answer) => answer.label || answer.keywords || answer.value);
      renderCustomAnswers();
      setSavingSoon();
    });

    row.append(label, keywords, remove, value);
    return row;
  }

  function renderCustomAnswers() {
    customList.replaceChildren();
    if (!customAnswers.length) {
      const empty = document.createElement("div");
      empty.className = "custom-empty";
      empty.textContent = "No custom answers yet. Add one for a question that keeps showing up.";
      customList.appendChild(empty);
      return;
    }
    for (const answer of customAnswers) {
      customList.appendChild(createCustomRow(answer));
    }
  }

  function addCustomAnswer() {
    customAnswers = collectCustomAnswers();
    customAnswers.push({ label: "", keywords: "", value: "" });
    renderCustomAnswers();
    const rows = customList.querySelectorAll(".custom-row");
    rows[rows.length - 1]?.querySelector("[data-custom-label]")?.focus();
    setSavingSoon();
  }

  function updateCompletion() {
    let filled = 0;
    for (const field of schema.fields) {
      const input = form.querySelector(`[data-key="${cssEscape(field.key)}"]`);
      if (input && String(input.value || "").trim()) filled += 1;
    }
    completion.textContent = `${filled} of ${schema.fields.length} details saved`;

    for (const section of schema.sections) {
      const count = section.fields.filter((field) => {
        const input = form.querySelector(`[data-key="${cssEscape(field.key)}"]`);
        return input && String(input.value || "").trim();
      }).length;
      const badge = navEl.querySelector(`[data-nav-count="${cssEscape(section.id)}"]`);
      if (badge) badge.textContent = `${count}/${section.fields.length}`;
    }

    const customBadge = navEl.querySelector('[data-nav-count="customPanel"]');
    if (customBadge) customBadge.textContent = String(collectCustomAnswers().length);
  }

  function setSavingSoon() {
    setSaveState("saving", "Saving…");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 280);
  }

  async function saveNow() {
    if (saving) {
      pendingSave = true;
      return;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    saving = true;
    const nextProfile = collectProfile();
    const nextSettings = collectSettings();
    setSaveState("saving", "Saving…");

    try {
      await writeAll(nextProfile, nextSettings);
      profile = nextProfile;
      settings = nextSettings;
      customAnswers = nextProfile.customAnswers;
      setSaveState("saved", "Saved locally");
      updateCompletion();
    } catch {
      setSaveState("error", "Couldn’t save");
    } finally {
      saving = false;
      if (pendingSave) {
        pendingSave = false;
        setSavingSoon();
      }
    }
  }

  async function load() {
    try {
      const stored = await readAll();
      const incomingProfile = stored[STORAGE_PROFILE] || {};
      profile = { ...schema.getEmptyProfile(), ...incomingProfile };
      customAnswers = Array.isArray(incomingProfile.customAnswers) ? incomingProfile.customAnswers : [];
      profile.customAnswers = customAnswers;
      settings = { ...schema.defaults, ...(stored[STORAGE_SETTINGS] || {}) };
      setFieldValues();
      applySettingsToForm();
      renderCustomAnswers();
      updateCompletion();
      setSaveState("saved", "Saved locally");
    } catch {
      setSaveState("error", "Couldn’t load");
      renderCustomAnswers();
      updateCompletion();
    }
  }

  function exportProfile() {
    const data = {
      app: "Apply Kit",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: collectProfile(),
      settings: collectSettings()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `apply-kit-profile-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function importProfile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.profile || parsed;
      if (!incoming || typeof incoming !== "object") throw new Error("Invalid profile");

      const nextProfile = schema.getEmptyProfile();
      for (const field of schema.fields) {
        nextProfile[field.key] = String(incoming[field.key] ?? "");
      }
      nextProfile.customAnswers = Array.isArray(incoming.customAnswers)
        ? incoming.customAnswers.map((answer) => ({
            label: String(answer?.label ?? ""),
            keywords: String(answer?.keywords ?? ""),
            value: String(answer?.value ?? "")
          }))
        : [];

      const nextSettings = {
        ...schema.defaults,
        ...(parsed.settings && typeof parsed.settings === "object" ? {
          onlyEmpty: parsed.settings.onlyEmpty !== false,
          fillSensitive: parsed.settings.fillSensitive !== false
        } : {})
      };

      profile = nextProfile;
      settings = nextSettings;
      customAnswers = nextProfile.customAnswers;
      setFieldValues();
      applySettingsToForm();
      renderCustomAnswers();
      updateCompletion();
      await saveNow();
      setSaveState("saved", "Imported");
    } catch {
      setSaveState("error", "Import failed");
      alert("That file doesn’t look like an Apply Kit profile export.");
    } finally {
      importFile.value = "";
    }
  }

  async function clearProfile() {
    const ok = confirm("Clear your Apply Kit profile and settings? This cannot be undone.");
    if (!ok) return;
    profile = { ...schema.getEmptyProfile(), customAnswers: [] };
    settings = { ...schema.defaults };
    customAnswers = [];
    setFieldValues();
    applySettingsToForm();
    renderCustomAnswers();
    updateCompletion();
    await saveNow();
    setSaveState("saved", "Cleared");
  }

  function openTestForm() {
    if (isExtension && chrome.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL("test-form.html") });
      return;
    }
    window.open("test-form.html", "_blank", "noopener");
  }

  function openShortcuts() {
    if (isExtension && chrome.tabs?.create) {
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => {
        alert("Open chrome://extensions/shortcuts in a new tab to change the shortcuts.");
      });
      return;
    }
    alert("Open chrome://extensions/shortcuts in a new tab to change the shortcuts.");
  }

  function bindEvents() {
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("input", () => {
      setSavingSoon();
      updateCompletion();
    });
    form.addEventListener("change", () => {
      setSavingSoon();
      updateCompletion();
    });

    document.getElementById("addCustomButton").addEventListener("click", addCustomAnswer);
    document.getElementById("exportButton").addEventListener("click", exportProfile);
    document.getElementById("importButton").addEventListener("click", () => importFile.click());
    document.getElementById("clearButton").addEventListener("click", clearProfile);
    document.getElementById("testFormButton").addEventListener("click", openTestForm);
    document.getElementById("shortcutsButton").addEventListener("click", openShortcuts);

    importFile.addEventListener("change", () => {
      const file = importFile.files?.[0];
      if (file) importProfile(file);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && saveTimer) saveNow();
    });
  }

  buildSections();
  bindEvents();
  load();
})();
