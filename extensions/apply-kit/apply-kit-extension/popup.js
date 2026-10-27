/* Apply Kit — popup. */
(() => {
  "use strict";

  const schema = window.ApplyKitSchema;
  if (!schema) return;

  const STORAGE_PROFILE = "applyKitProfile";
  const STORAGE_SETTINGS = "applyKitSettings";
  const PREVIEW_KEY = "applyKitPreview";
  const isExtension = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);

  const profileName = document.getElementById("profileName");
  const profileMeta = document.getElementById("profileMeta");
  const profileBadge = document.getElementById("profileBadge");
  const avatar = document.getElementById("avatar");
  const progressBar = document.getElementById("progressBar");
  const fillButton = document.getElementById("fillButton");
  const fillButtonText = document.getElementById("fillButtonText");
  const status = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  const onlyEmpty = document.getElementById("onlyEmpty");
  const fillSensitive = document.getElementById("fillSensitive");

  let profile = {};
  let settings = { ...schema.defaults };
  let busy = false;

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

  async function saveSettings() {
    settings = {
      onlyEmpty: Boolean(onlyEmpty.checked),
      fillSensitive: Boolean(fillSensitive.checked)
    };
    if (isExtension) {
      await chrome.storage.local.set({ [STORAGE_SETTINGS]: settings });
      return;
    }
    try {
      const raw = localStorage.getItem(PREVIEW_KEY);
      const data = raw ? JSON.parse(raw) : {};
      data[STORAGE_SETTINGS] = settings;
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  function setStatus(state, text) {
    status.dataset.state = state;
    statusText.textContent = text;
  }

  function filledCount() {
    return schema.fields.filter((field) => String(profile[field.key] ?? "").trim()).length;
  }

  function isProfileEmpty() {
    return filledCount() === 0 && !(Array.isArray(profile.customAnswers)
      && profile.customAnswers.some((answer) => String(answer?.value ?? "").trim()));
  }

  function initials() {
    const first = String(profile.firstName || "").trim();
    const last = String(profile.lastName || "").trim();
    return `${first[0] || ""}${last[0] || ""}`.toUpperCase() || "AK";
  }

  function updateProfileUI() {
    const filled = filledCount();
    const total = schema.fields.length;
    const name = [profile.firstName, profile.lastName].map((part) => String(part || "").trim()).filter(Boolean).join(" ");

    profileName.textContent = name || "Your profile";
    profileName.title = name || "Your profile";
    profileMeta.textContent = `${filled} of ${total} details saved`;
    avatar.textContent = initials();
    progressBar.style.width = `${total ? Math.round((filled / total) * 100) : 0}%`;
    profileBadge.textContent = filled ? "Ready" : "Empty";
    profileBadge.dataset.state = filled ? "ready" : "empty";
    fillButtonText.textContent = isProfileEmpty() ? "Add your details first" : "Fill this page";

    if (!busy && isProfileEmpty()) {
      setStatus("warning", "Add your details to get started.");
    }
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    fillButton.disabled = nextBusy;
    fillButtonText.textContent = nextBusy
      ? "Filling…"
      : isProfileEmpty()
        ? "Add your details first"
        : "Fill this page";
  }

  function openOptions() {
    if (isExtension && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    window.open("options.html", "_blank", "noopener");
  }

  async function fillCurrentPage() {
    if (busy) return;
    if (isProfileEmpty()) {
      setStatus("warning", "Add your details first.");
      openOptions();
      return;
    }
    if (!isExtension) {
      setStatus("warning", "Open this popup from the installed extension.");
      return;
    }

    setBusy(true);
    setStatus("idle", "Scanning this page…");

    try {
      const response = await chrome.runtime.sendMessage({ type: "FILL_PAGE" });
      if (!response?.ok) throw new Error(response?.error || "Could not fill this page.");

      const result = response.result || {};
      const filled = Number(result.filled) || 0;
      const fileInputs = Number(result.fileInputs) || 0;
      const skipped = Number(result.skipped) || 0;
      const sensitiveSkipped = Number(result.sensitiveSkipped) || 0;
      const unmatched = Array.isArray(result.unmatched) ? result.unmatched.length : 0;

      if (filled > 0) {
        let message = `Filled ${filled} field${filled === 1 ? "" : "s"}.`;
        if (skipped > 0) message += ` ${skipped} left alone.`;
        if (sensitiveSkipped > 0) message += ` ${sensitiveSkipped} sensitive skipped.`;
        if (unmatched > 0) message += " Some fields need a manual pick.";
        if (fileInputs > 0) message += " Resume upload is manual.";
        setStatus("success", message);
      } else if (Number(result.found) === 0) {
        setStatus("warning", "No fillable fields found on this page.");
      } else if (sensitiveSkipped > 0) {
        setStatus("warning", "Only sensitive fields found; sensitive filling is off.");
      } else {
        setStatus("warning", "Fields found, but nothing was empty.");
      }
    } catch (error) {
      setStatus("error", error?.message || "Could not fill this page. Reload it and try again.");
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    document.getElementById("editButton").addEventListener("click", openOptions);
    fillButton.addEventListener("click", fillCurrentPage);

    for (const toggle of [onlyEmpty, fillSensitive]) {
      toggle.addEventListener("change", () => {
        saveSettings().catch(() => {
          setStatus("error", "Could not save that setting.");
        });
      });
    }
  }

  async function load() {
    try {
      const stored = await readAll();
      profile = stored[STORAGE_PROFILE] || {};
      settings = { ...schema.defaults, ...(stored[STORAGE_SETTINGS] || {}) };
      onlyEmpty.checked = settings.onlyEmpty !== false;
      fillSensitive.checked = settings.fillSensitive !== false;
      updateProfileUI();
      if (isProfileEmpty()) setStatus("warning", "Add your details to get started.");
      else setStatus("idle", "Ready. Open a job application.");
    } catch {
      updateProfileUI();
      setStatus("error", "Could not load your profile.");
    }
  }

  bindEvents();
  load();
})();
