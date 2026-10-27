/* Apply Kit — shadow-DOM picker and toast UI. */
(() => {
  "use strict";
  if (window.ApplyKitUI) return;

  const HOST_STYLE = `
    :host {
      color-scheme: light dark;
      --paper: #f7f4ed;
      --paper-deep: #f0ece2;
      --ink: #24221e;
      --muted: #7b7468;
      --line: #e3ddd1;
      --line-strong: #d0c8b8;
      --accent: #9a5a2a;
      --accent-hover: #7f4922;
      --accent-soft: #f3e7d8;
      --accent-line: #dfc7aa;
      --success: #2f6f5e;
      --danger: #b64132;
      --field: #fffdf8;
      --shadow: 0 24px 70px rgba(24, 22, 18, .28), 0 3px 10px rgba(24, 22, 18, .14);
      font-family: Aptos, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --paper: #171613;
        --paper-deep: #1d1b18;
        --ink: #f3eee3;
        --muted: #a49b8d;
        --line: #312d26;
        --line-strong: #443e34;
        --accent: #e0a36b;
        --accent-hover: #eab27e;
        --accent-soft: #33281e;
        --accent-line: #5a422b;
        --success: #9dcbb8;
        --danger: #ef8b7c;
        --field: #1d1b18;
        --shadow: 0 24px 70px rgba(0, 0, 0, .55), 0 3px 10px rgba(0, 0, 0, .35);
      }
    }

    * { box-sizing: border-box; }
    button, input { font: inherit; }
    button { border: 0; }
    kbd {
      display: inline-grid;
      place-items: center;
      min-width: 17px;
      height: 16px;
      padding: 0 4px;
      border: 1px solid var(--line-strong);
      border-bottom-width: 2px;
      border-radius: 4px;
      color: var(--ink);
      background: var(--paper-deep);
      font-family: inherit;
      font-size: 8.5px;
      font-weight: 650;
      line-height: 1;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(24, 22, 18, .34);
      -webkit-backdrop-filter: blur(2px);
      backdrop-filter: blur(2px);
      pointer-events: auto;
    }

    .panel {
      position: fixed;
      top: 50%;
      left: 50%;
      display: flex;
      flex-direction: column;
      width: min(440px, calc(100vw - 24px));
      max-height: min(660px, calc(100vh - 32px));
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 16px;
      outline: 0;
      color: var(--ink);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, .34), transparent 120px),
        var(--paper);
      box-shadow: var(--shadow);
      transform: translate(-50%, -50%);
      pointer-events: auto;
    }

    @media (prefers-color-scheme: dark) {
      .panel {
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .035), transparent 120px),
          var(--paper);
      }
    }

    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      flex: none;
      padding: 16px 16px 11px;
    }

    .eyebrow {
      margin: 0 0 2px;
      color: var(--accent);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: .09em;
      text-transform: uppercase;
    }

    .title {
      margin: 0;
      font-size: 16px;
      font-weight: 680;
      letter-spacing: -.015em;
      line-height: 1.2;
    }

    .subtitle {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 11.5px;
      line-height: 1.35;
    }

    .subtitle strong {
      color: var(--ink);
      font-weight: 600;
    }

    .close {
      display: grid;
      place-items: center;
      flex: none;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      color: var(--muted);
      background: transparent;
      cursor: pointer;
    }

    .close:hover {
      color: var(--ink);
      background: var(--paper-deep);
    }

    .close:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    .search-wrap {
      flex: none;
      padding: 0 16px 11px;
    }

    .search {
      width: 100%;
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--line-strong);
      border-radius: 10px;
      outline: 0;
      color: var(--ink);
      background: var(--field);
      caret-color: var(--accent);
      font-size: 13.5px;
      box-shadow: inset 0 1px 1px rgba(24, 22, 18, .04);
    }

    .search::placeholder { color: var(--muted); opacity: .66; }
    .search:focus {
      border-color: var(--accent);
      box-shadow:
        inset 0 1px 1px rgba(24, 22, 18, .04),
        0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
    }

    .list {
      flex: 1;
      min-height: 90px;
      padding: 2px 8px 10px;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--line-strong) transparent;
    }

    .list::-webkit-scrollbar { width: 9px; }
    .list::-webkit-scrollbar-track { background: transparent; }
    .list::-webkit-scrollbar-thumb {
      border: 3px solid transparent;
      border-radius: 99px;
      background: var(--line-strong);
      background-clip: content-box;
    }

    .section + .section { margin-top: 4px; }

    .section-title {
      position: sticky;
      top: 0;
      z-index: 1;
      margin: 0;
      padding: 9px 10px 5px;
      color: var(--muted);
      background: linear-gradient(180deg, var(--paper) 72%, transparent);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: .09em;
      text-transform: uppercase;
    }

    .item {
      display: block;
      width: 100%;
      padding: 8px 10px 9px;
      border: 1px solid transparent;
      border-radius: 9px;
      color: var(--ink);
      background: transparent;
      text-align: left;
      cursor: pointer;
    }

    .item:hover {
      background: color-mix(in srgb, var(--paper-deep) 70%, transparent);
    }

    .item.selected {
      border-color: var(--accent-line);
      background: var(--accent-soft);
      box-shadow: inset 3px 0 0 var(--accent);
    }

    .item-top {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .item-label {
      min-width: 0;
      overflow: hidden;
      color: var(--muted);
      font-size: 9.5px;
      font-weight: 650;
      letter-spacing: .055em;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .tag {
      flex: none;
      padding: 1px 5px;
      border-radius: 999px;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 11%, transparent);
      font-size: 8px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .item-value {
      display: -webkit-box;
      margin-top: 2px;
      overflow: hidden;
      color: var(--ink);
      font-size: 12.8px;
      line-height: 1.38;
      overflow-wrap: anywhere;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .item.selected .item-value { color: var(--ink); }

    .empty {
      padding: 30px 18px;
      color: var(--muted);
      font-size: 12.5px;
      text-align: center;
    }

    .error {
      margin: 0 16px 10px;
      padding: 8px 10px;
      border-radius: 8px;
      color: var(--danger);
      background: color-mix(in srgb, var(--danger) 10%, transparent);
      font-size: 11.5px;
      line-height: 1.35;
    }

    .error[hidden] { display: none; }

    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex: none;
      padding: 9px 16px 10px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 9.5px;
      letter-spacing: .01em;
    }

    .foot-hint {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: min(520px, calc(100vw - 24px));
      padding: 9px 10px 9px 13px;
      border: 1px solid var(--line);
      border-radius: 12px;
      color: var(--ink);
      background: var(--paper);
      box-shadow: var(--shadow);
      pointer-events: auto;
    }

    .toast-message {
      min-width: 0;
      color: var(--ink);
      font-size: 12px;
      line-height: 1.35;
    }

    .toast-action, .toast-close {
      flex: none;
      border-radius: 7px;
      color: var(--accent);
      background: transparent;
      font-size: 11.5px;
      font-weight: 650;
      cursor: pointer;
    }

    .toast-action {
      padding: 5px 8px;
      background: var(--accent-soft);
    }

    .toast-action:hover { color: var(--accent-hover); }

    .toast-close {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1;
    }

    .toast-close:hover { color: var(--ink); background: var(--paper-deep); }

    .toast button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation: none !important; }
    }
  `;

  function makeHost(tag) {
    const host = document.createElement(tag);
    host.setAttribute("data-apply-kit", "true");
    host.style.setProperty("all", "initial", "important");
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("pointer-events", "none", "important");
    host.style.setProperty("font-family", 'Aptos, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif', "important");
    host.style.setProperty("font-size", "14px", "important");
    host.style.setProperty("line-height", "1.4", "important");
    host.style.setProperty("color-scheme", "light dark", "important");
    return host;
  }

  function addStyle(shadow) {
    const style = document.createElement("style");
    style.textContent = HOST_STYLE;
    shadow.appendChild(style);
  }

  let activePicker = null;
  let activeToast = null;

  function closeActivePicker(restoreFocus = true) {
    if (!activePicker) return;
    const { host, target } = activePicker;
    activePicker = null;
    host.remove();
    if (restoreFocus && target && target.isConnected) {
      try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }

  function openPicker({ target, fieldLabel, items, onChoose }) {
    closeActivePicker(false);
    closeToast();

    const host = makeHost("apply-kit-picker");
    const shadow = host.attachShadow({ mode: "open" });
    addStyle(shadow);

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.addEventListener("click", () => closeActivePicker(true));

    const panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Choose a profile value");
    panel.tabIndex = -1;
    panel.addEventListener("click", (event) => event.stopPropagation());

    const head = document.createElement("header");
    head.className = "head";

    const headText = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Apply Kit";
    const title = document.createElement("h2");
    title.className = "title";
    title.textContent = "Choose a value";
    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = "Filling ";
    const fieldStrong = document.createElement("strong");
    fieldStrong.textContent = fieldLabel || "this field";
    subtitle.appendChild(fieldStrong);
    headText.append(eyebrow, title, subtitle);

    const closeButton = document.createElement("button");
    closeButton.className = "close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close picker");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => closeActivePicker(true));

    head.append(headText, closeButton);

    const searchWrap = document.createElement("div");
    searchWrap.className = "search-wrap";
    const search = document.createElement("input");
    search.className = "search";
    search.type = "search";
    search.placeholder = "Search your details…";
    search.autocomplete = "off";
    search.spellcheck = false;
    search.setAttribute("aria-label", "Search profile values");
    searchWrap.appendChild(search);

    const error = document.createElement("div");
    error.className = "error";
    error.setAttribute("role", "alert");
    error.hidden = true;

    const list = document.createElement("div");
    list.className = "list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Profile values");

    const foot = document.createElement("footer");
    foot.className = "foot";
    const count = document.createElement("span");
    const hint = document.createElement("span");
    hint.className = "foot-hint";
    hint.innerHTML = "<kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> choose <kbd>Esc</kbd> close";
    foot.append(count, hint);

    const live = document.createElement("span");
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");

    panel.append(head, searchWrap, error, list, foot, live);
    shadow.append(backdrop, panel);
    document.documentElement.appendChild(host);

    let filtered = items.slice();
    let selectedIndex = filtered.length ? 0 : -1;
    let itemElements = [];

    activePicker = { host, target, close: () => closeActivePicker(true) };

    function groupItems(source) {
      const groups = [];
      const byTitle = new Map();
      for (const item of source) {
        const sectionTitle = item.sectionTitle || "Details";
        if (!byTitle.has(sectionTitle)) {
          const group = { title: sectionTitle, items: [] };
          byTitle.set(sectionTitle, group);
          groups.push(group);
        }
        byTitle.get(sectionTitle).items.push(item);
      }
      return groups;
    }

    function updateSelected(scroll = false) {
      for (let i = 0; i < itemElements.length; i += 1) {
        const el = itemElements[i];
        el.classList.toggle("selected", i === selectedIndex);
        el.setAttribute("aria-selected", i === selectedIndex ? "true" : "false");
      }
      if (scroll && selectedIndex >= 0 && itemElements[selectedIndex]) {
        itemElements[selectedIndex].scrollIntoView({ block: "nearest" });
      }
    }

    function choose(item) {
      if (!item) return;
      let result;
      try {
        result = onChoose(item);
      } catch (err) {
        result = { ok: false, error: String(err?.message || err) };
      }
      if (result && result.ok === false) {
        error.textContent = result.error || "That value could not be applied to this field.";
        error.hidden = false;
        live.textContent = error.textContent;
        return;
      }
      closeActivePicker(true);
    }

    function render() {
      const query = search.value.trim().toLowerCase();
      filtered = query
        ? items.filter((item) => `${item.sectionTitle} ${item.label} ${item.value}`.toLowerCase().includes(query))
        : items.slice();

      if (!filtered.length) selectedIndex = -1;
      else if (selectedIndex < 0 || selectedIndex >= filtered.length) selectedIndex = 0;

      list.replaceChildren();
      itemElements = [];
      error.hidden = true;

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No matching values. Try another search or add more details in the profile.";
        list.appendChild(empty);
        count.textContent = "0 values";
        live.textContent = empty.textContent;
        return;
      }

      for (const group of groupItems(filtered)) {
        const section = document.createElement("section");
        section.className = "section";
        const heading = document.createElement("h3");
        heading.className = "section-title";
        heading.textContent = group.title;
        section.appendChild(heading);

        for (const item of group.items) {
          const index = filtered.indexOf(item);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "item";
          button.tabIndex = -1;
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", "false");
          button.dataset.index = String(index);

          const top = document.createElement("span");
          top.className = "item-top";
          const label = document.createElement("span");
          label.className = "item-label";
          label.textContent = item.label;
          top.appendChild(label);
          if (item.sensitive) {
            const tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = "sensitive";
            top.appendChild(tag);
          }

          const value = document.createElement("span");
          value.className = "item-value";
          value.textContent = item.value;

          button.append(top, value);
          button.addEventListener("mouseenter", () => {
            selectedIndex = index;
            updateSelected(false);
          });
          button.addEventListener("click", () => choose(item));
          itemElements.push(button);
          section.appendChild(button);
        }
        list.appendChild(section);
      }

      count.textContent = `${filtered.length} value${filtered.length === 1 ? "" : "s"}`;
      live.textContent = `${filtered.length} value${filtered.length === 1 ? "" : "s"} available`;
      updateSelected(false);
    }

    search.addEventListener("input", () => {
      selectedIndex = 0;
      render();
    });

    search.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (selectedIndex < filtered.length - 1) selectedIndex += 1;
        else selectedIndex = 0;
        updateSelected(true);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (selectedIndex > 0) selectedIndex -= 1;
        else selectedIndex = filtered.length - 1;
        updateSelected(true);
      } else if (event.key === "Enter") {
        event.preventDefault();
        choose(filtered[selectedIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeActivePicker(true);
      }
    });

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeActivePicker(true);
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = [...shadow.querySelectorAll("button, input")].filter((el) => !el.disabled && el.tabIndex !== -1);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = shadow.activeElement;
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    });

    render();
    requestAnimationFrame(() => {
      try { search.focus({ preventScroll: true }); } catch { /* ignore */ }
    });
  }

  function closeToast() {
    if (!activeToast) return;
    activeToast.remove();
    activeToast = null;
  }

  function showToast({ message, undoLabel = "Undo", onUndo, duration = 12000 }) {
    closeToast();
    const host = makeHost("apply-kit-toast");
    host.style.setProperty("inset", "auto", "important");
    host.style.setProperty("left", "50%", "important");
    host.style.setProperty("bottom", "20px", "important");
    host.style.setProperty("transform", "translateX(-50%)", "important");
    host.style.setProperty("width", "max-content", "important");
    host.style.setProperty("max-width", "calc(100vw - 24px)", "important");

    const shadow = host.attachShadow({ mode: "open" });
    addStyle(shadow);

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const text = document.createElement("span");
    text.className = "toast-message";
    text.textContent = message;
    toast.appendChild(text);

    let timer = null;
    const dismiss = () => {
      if (timer) clearTimeout(timer);
      closeToast();
    };

    if (typeof onUndo === "function") {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "toast-action";
      action.textContent = undoLabel;
      action.addEventListener("click", () => {
        dismiss();
        try { onUndo(); } catch { /* ignore */ }
      });
      toast.appendChild(action);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", dismiss);
    toast.appendChild(close);

    shadow.appendChild(toast);
    document.documentElement.appendChild(host);
    activeToast = host;

    if (duration > 0) {
      timer = setTimeout(dismiss, duration);
    }
  }

  window.ApplyKitUI = {
    openPicker,
    closePicker: closeActivePicker,
    showToast,
    closeToast
  };
})();
