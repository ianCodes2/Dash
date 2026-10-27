/* Apply Kit — background service worker. */
"use strict";

const STORAGE_PROFILE = "applyKitProfile";
const STORAGE_SETTINGS = "applyKitSettings";
const DEFAULT_SETTINGS = {
  onlyEmpty: true,
  fillSensitive: true
};
const CONTENT_FILES = ["schema.js", "rules.js", "picker.js", "content.js"];

async function ensureDefaults() {
  const data = await chrome.storage.local.get([STORAGE_PROFILE, STORAGE_SETTINGS]);
  const updates = {};
  if (!data[STORAGE_PROFILE]) updates[STORAGE_PROFILE] = {};
  if (!data[STORAGE_SETTINGS]) updates[STORAGE_SETTINGS] = DEFAULT_SETTINGS;
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
}

async function lockStorage() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    /* Older Chrome builds do not support setAccessLevel. */
  }
}

async function getState() {
  const data = await chrome.storage.local.get([STORAGE_PROFILE, STORAGE_SETTINGS]);
  return {
    profile: data[STORAGE_PROFILE] || {},
    settings: { ...DEFAULT_SETTINGS, ...(data[STORAGE_SETTINGS] || {}) }
  };
}

function hasProfileValue(profile) {
  if (!profile || typeof profile !== "object") return false;
  const fields = Object.entries(profile).filter(([key]) => key !== "customAnswers");
  if (fields.some(([, value]) => String(value ?? "").trim())) return true;
  return Array.isArray(profile.customAnswers)
    && profile.customAnswers.some((answer) => String(answer?.value ?? "").trim());
}

function friendlyError(error) {
  const message = String(error?.message || error || "");
  if (/cannot access|cannot be scripted|chrome:\/\/|edge:\/\/|extensions gallery|invalid url|missing host permission/i.test(message)) {
    return "This page can’t be filled. Open a normal job application page and try again.";
  }
  return "Could not reach the page. Reload it and try again.";
}

async function injectContent(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: CONTENT_FILES
    });
    return { ok: true };
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: CONTENT_FILES
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: friendlyError(error) };
    }
  }
}

async function callInFrames(tabId, method, args) {
  const call = (target) => chrome.scripting.executeScript({
    target,
    func: (methodName, methodArgs) => {
      const api = globalThis.__applyKit;
      if (!api || typeof api[methodName] !== "function") return null;
      try {
        return api[methodName](...methodArgs);
      } catch (error) {
        return { error: String(error?.message || error) };
      }
    },
    args: [method, args]
  });

  try {
    const results = await call({ tabId, allFrames: true });
    return results.map((entry) => entry.result).filter(Boolean);
  } catch {
    try {
      const results = await call({ tabId });
      return results.map((entry) => entry.result).filter(Boolean);
    } catch {
      return [];
    }
  }
}

async function showTopHint(tabId, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: (text) => {
        if (window.__applyKit?.showHint) {
          window.__applyKit.showHint(text);
          return true;
        }
        return false;
      },
      args: [message]
    });
  } catch {
    /* The page may no longer be accessible. */
  }
}

function aggregateResults(results) {
  const total = {
    found: 0,
    filled: 0,
    skipped: 0,
    sensitiveSkipped: 0,
    fileInputs: 0,
    unmatched: []
  };

  for (const result of results) {
    if (!result || result.error) continue;
    total.found += Number(result.found) || 0;
    total.filled += Number(result.filled) || 0;
    total.skipped += Number(result.skipped) || 0;
    total.sensitiveSkipped += Number(result.sensitiveSkipped) || 0;
    total.fileInputs += Number(result.fileInputs) || 0;
    if (Array.isArray(result.unmatched)) {
      for (const label of result.unmatched) {
        if (label && total.unmatched.length < 10 && !total.unmatched.includes(label)) {
          total.unmatched.push(label);
        }
      }
    }
  }

  return total;
}

async function fillTab(tabId) {
  const { profile, settings } = await getState();
  if (!hasProfileValue(profile)) {
    return { ok: false, error: "Add your details in Apply Kit first." };
  }

  const injected = await injectContent(tabId);
  if (!injected.ok) return injected;

  const results = await callInFrames(tabId, "fillPage", [profile, settings]);
  const result = aggregateResults(results);

  if (result.found === 0 && result.fileInputs === 0) {
    await showTopHint(tabId, "No fillable fields found on this page.");
  }

  return { ok: true, result };
}

async function pickTab(tabId) {
  const { profile, settings } = await getState();
  if (!hasProfileValue(profile)) {
    await showTopHint(tabId, "Add your details in Apply Kit first.");
    return { ok: false, error: "Add your details in Apply Kit first." };
  }

  const injected = await injectContent(tabId);
  if (!injected.ok) return injected;

  const results = await callInFrames(tabId, "showPicker", [profile, settings]);
  const shown = results.some((result) => result?.shown);
  if (!shown) {
    await showTopHint(tabId, "Click a form field first, then press the picker shortcut again.");
  }
  return { ok: true, shown };
}

async function flashBadge(tabId) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#b64132" });
    await chrome.action.setBadgeText({ tabId, text: "!" });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }, 5000);
  } catch {
    /* The tab may be gone. */
  }
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id || null;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults().catch(() => {});
  lockStorage();
});

chrome.runtime.onStartup.addListener(() => {
  lockStorage();
});

chrome.commands.onCommand.addListener(async (command) => {
  const tabId = await activeTabId();
  if (!tabId) return;

  if (command === "fill-page") {
    const response = await fillTab(tabId);
    if (!response.ok) await flashBadge(tabId);
  } else if (command === "show-picker") {
    const response = await pickTab(tabId);
    if (!response.ok) await flashBadge(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FILL_PAGE") {
    (async () => {
      const tabId = await activeTabId();
      if (!tabId) return { ok: false, error: "No active tab." };
      return fillTab(tabId);
    })().then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: friendlyError(error) });
    });
    return true;
  }

  if (message?.type === "SHOW_PICKER") {
    (async () => {
      const tabId = await activeTabId();
      if (!tabId) return { ok: false, error: "No active tab." };
      return pickTab(tabId);
    })().then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: friendlyError(error) });
    });
    return true;
  }

  return false;
});

lockStorage();
