'use strict';

const input = document.getElementById('value');
const copyButton = document.getElementById('copyButton');
const openButton = document.getElementById('openButton');
const status = document.getElementById('status');
const statusText = document.getElementById('statusText');
const announcer = document.getElementById('announcer');

const IDLE_MESSAGE = 'Paste Base64 or type and press Enter.';
let announceTimer = 0;

function setStatus(state, message) {
  status.dataset.state = state;
  statusText.textContent = message;
}

function announce(message) {
  if (!announcer) return;
  window.clearTimeout(announceTimer);
  announcer.textContent = '';
  announceTimer = window.setTimeout(() => {
    announcer.textContent = message;
  }, 30);
}

function getHttpUrl(text) {
  const value = text.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch {
    // Not a URL.
  }

  return null;
}

function decodeBase64(raw) {
  const compact = raw.trim().replace(/\s+/g, '');
  if (!compact) {
    throw new Error('Paste a Base64 string first.');
  }

  const normalized = compact.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("That doesn't look like valid Base64.");
  }

  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  if (padded.length % 4 !== 0) {
    throw new Error("That doesn't look like valid Base64.");
  }

  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("That doesn't look like valid Base64.");
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Decoded data isn't valid UTF-8 text.");
  }

  if (!decoded.trim()) {
    throw new Error('The Base64 value is empty.');
  }

  return decoded;
}

function updateButtons() {
  const value = input.value.trim();
  copyButton.disabled = value.length === 0;
  openButton.disabled = getHttpUrl(value) === null;
}

function handleIncomingText(raw) {
  const original = typeof raw === 'string' ? raw.trim() : '';

  if (!original) {
    input.value = '';
    updateButtons();
    setStatus('idle', IDLE_MESSAGE);
    input.focus();
    return;
  }

  // A URL pasted directly is already in the form the user wants.
  if (getHttpUrl(original)) {
    input.value = original;
    updateButtons();
    setStatus('success', 'Link ready');
    announce('Link ready');
    input.focus();
    input.setSelectionRange(0, 0);
    input.scrollLeft = 0;
    return;
  }

  try {
    const decoded = decodeBase64(original).trim();
    input.value = decoded;
    updateButtons();

    if (getHttpUrl(decoded)) {
      setStatus('success', 'Decoded link ready');
      announce('Decoded link ready');
    } else {
      setStatus('warning', 'Decoded text — not a web link');
      announce('Decoded text. Open is disabled because it is not an http or https link.');
    }
  } catch (error) {
    input.value = original;
    updateButtons();

    const message = error instanceof Error && error.message
      ? error.message
      : 'Could not decode that Base64.';
    setStatus('error', message);
    announce(message);
  }

  input.focus();
  input.setSelectionRange(0, 0);
  input.scrollLeft = 0;
}

function handleInput() {
  const value = input.value.trim();
  updateButtons();

  if (!value) {
    setStatus('idle', IDLE_MESSAGE);
  } else if (getHttpUrl(value)) {
    setStatus('success', 'Link ready');
  } else {
    setStatus('idle', 'Press Enter to decode');
  }
}

function fallbackCopy(text) {
  try {
    input.focus();
    input.select();
    const copied = document.execCommand('copy');
    input.setSelectionRange(text.length, text.length);
    return copied;
  } catch {
    return false;
  }
}

async function copyValue() {
  const text = input.value;
  if (!text) return;

  let copied = false;

  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('Clipboard API unavailable.');
    }
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = fallbackCopy(text);
  }

  if (copied) {
    setStatus('success', 'Copied to clipboard');
    announce('Copied to clipboard');
  } else {
    setStatus('error', "Couldn't copy to clipboard");
    announce("Couldn't copy to clipboard");
  }

  updateButtons();
}

async function openValue() {
  const url = getHttpUrl(input.value);

  if (!url) {
    const message = 'Only http:// and https:// links can be opened.';
    setStatus('error', message);
    announce(message);
    return;
  }

  try {
    if (globalThis.chrome?.tabs?.create) {
      await chrome.tabs.create({ url });
      window.close();
    } else {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        throw new Error('The browser blocked the new tab.');
      }
    }
  } catch (error) {
    console.error('Base64 Link: could not open link', error);
    const message = "Couldn't open that link";
    setStatus('error', message);
    announce(message);
  }
}

input.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text');
  if (typeof text !== 'string' || text.length === 0) return;

  event.preventDefault();
  handleIncomingText(text);
});

input.addEventListener('drop', (event) => {
  const text = event.dataTransfer?.getData('text');
  if (!text) return;

  event.preventDefault();
  handleIncomingText(text);
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    handleIncomingText(input.value);
  }
});

input.addEventListener('input', handleInput);

copyButton.addEventListener('click', () => {
  void copyValue();
});

openButton.addEventListener('click', () => {
  void openValue();
});

function init() {
  updateButtons();
  setStatus('idle', IDLE_MESSAGE);
  input.focus();
  requestAnimationFrame(() => {
    if (document.activeElement !== input) input.focus();
  });
  window.setTimeout(() => {
    if (document.activeElement === document.body) input.focus();
  }, 80);
}

init();
