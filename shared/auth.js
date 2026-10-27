/* ============================================================
   Northstar shared auth + Supabase RPC client
   ------------------------------------------------------------
   The publishable key is safe to ship in the browser. All data
   access goes through PIN-checked Postgres functions; direct
   table access is revoked in supabase/schema.sql.
   ============================================================ */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://zgcemyiufqprjawsijsb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_apXfNrH9krM8syYN1f0qNw_zCWp8oDC';
  const SESSION_KEY = 'northstar.session.v1';
  const PIN_RE = /^[0-9]{6,12}$/;
  const REQUEST_TIMEOUT = 15000;

  function readSession() {
    try {
      const raw = global.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.token !== 'string' || parsed.token.length < 32) return null;
      return {
        token: parsed.token,
        expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : ''
      };
    } catch (error) {
      return null;
    }
  }

  function writeSession(token, expiresAt) {
    const value = { token: String(token || ''), expiresAt: String(expiresAt || '') };
    try {
      global.localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    } catch (error) { /* storage unavailable */ }
    return value;
  }

  function clearSession() {
    try {
      global.localStorage.removeItem(SESSION_KEY);
    } catch (error) { /* storage unavailable */ }
  }

  function sessionUsable(session) {
    if (!session || !session.token) return false;
    if (!session.expiresAt) return true;
    const expires = Date.parse(session.expiresAt);
    if (!Number.isFinite(expires)) return true;
    return expires - Date.now() > 30000;
  }

  async function rpc(name, payload) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? global.setTimeout(() => controller.abort(), REQUEST_TIMEOUT) : 0;
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload || {}),
        signal: controller ? controller.signal : undefined
      });

      const text = await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (error) { data = null; }
      }

      if (!response.ok) {
        const detail = data && (data.message || data.hint || data.details);
        const missing = response.status === 404
          && /could not find the function/i.test(detail || '')
          && /northstar_/i.test(detail || '');
        const err = new Error(missing
          ? 'Northstar is not installed on Supabase yet.'
          : (detail || `Request failed (${response.status})`));
        err.status = response.status;
        err.data = data;
        err.network = false;
        err.setupMissing = missing;
        if (missing) {
          err.title = 'One setup step left';
          err.note = 'Open the Supabase SQL editor, run supabase/schema.sql, then tap Try again. Nothing is lost.';
        }
        throw err;
      }

      return data || {};
    } catch (error) {
      if (error && error.name === 'AbortError') {
        const timeout = new Error('The server took too long to answer.');
        timeout.network = true;
        throw timeout;
      }
      if (error && error.network === undefined) error.network = true;
      throw error;
    } finally {
      if (timer) global.clearTimeout(timer);
    }
  }

  const api = {
    supabaseUrl: SUPABASE_URL,
    pinPattern: PIN_RE,
    rpc,
    getSession: readSession,
    setSession: writeSession,
    clearSession,
    sessionUsable,
    status: () => rpc('northstar_status', {}),
    setup: (pin, data) => rpc('northstar_setup_workspace', { p_pin: pin, p_data: data }),
    unlock: (pin) => rpc('northstar_unlock', { p_pin: pin }),
    load: (token) => rpc('northstar_load', { p_token: token }),
    save: (token, data, revision) => rpc('northstar_save', {
      p_token: token,
      p_data: data,
      p_revision: revision
    }),
    changePin: (token, currentPin, newPin) => rpc('northstar_change_pin', {
      p_token: token,
      p_current_pin: currentPin,
      p_new_pin: newPin
    }),
    signOut: (token) => rpc('northstar_sign_out', { p_token: token })
  };

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function sqlEditorURL() {
    try {
      const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
      if (!/^[a-z0-9]+$/i.test(ref)) return '';
      return `https://supabase.com/dashboard/project/${ref}/sql/new`;
    } catch (error) {
      return '';
    }
  }

  function pinError(message) {
    if (!PIN_RE.test(message)) return '';
    return message;
  }

  /**
   * Draw a full-screen PIN gate inside `options.mount`.
   *
   * options:
   *   mount        element that holds the gate card
   *   eyebrow      small label above the title
   *   title        unlock heading
   *   subtitle     supporting sentence
   *   setupTitle   first-run heading
   *   setupData    object stored on first run (or a function returning it)
   *   allowSetup   default true
   *   offlineData  optional cached object; shows "Open offline copy"
   *   onUnlock     async ({ token, data?, revision?, offline? }) => void
   */
  async function mountGate(options) {
    const mount = options.mount;
    if (!mount) return;
    const state = {
      mode: 'loading',
      busy: false,
      error: '',
      detail: '',
      attempts: '',
      lockedUntil: '',
      setupData: options.setupData || {}
    };

    function dataForSetup() {
      return typeof state.setupData === 'function' ? state.setupData() : state.setupData;
    }

    function draw() {
      if (state.mode === 'loading') {
        mount.innerHTML = `<div class="gate-card gate-card--center">
          <div class="gate-mark" aria-hidden="true">✦</div>
          <h1 class="gate-title">Northstar</h1>
          <p class="gate-text">Checking your workspace…</p>
          <div class="gate-spinner" aria-hidden="true"></div>
        </div>`;
        return;
      }

      if (state.mode === 'error') {
        mount.innerHTML = `<div class="gate-card">
          <div class="gate-mark" aria-hidden="true">✦</div>
          <p class="gate-eyebrow">${escapeHTML(options.eyebrow || 'Private workspace')}</p>
          <h1 class="gate-title">${escapeHTML(state.errorTitle || "Can't connect")}</h1>
          <p class="gate-text">${escapeHTML(state.error || 'The server did not answer.')}</p>
          <p class="gate-note">${escapeHTML(state.errorNote || 'Check your connection and try again. Your data is safe.')}</p>
          <div class="gate-actions">
            <button class="btn btn--primary gate-btn" type="button" data-gate="retry">Try again</button>
            ${state.errorSetup && sqlEditorURL() ? `<a class="btn btn--soft gate-btn" href="${escapeHTML(sqlEditorURL())}" target="_blank" rel="noopener">Open Supabase SQL editor</a>` : ''}
            ${options.offlineData ? '<button class="btn btn--ghost gate-btn" type="button" data-gate="offline">Open offline copy</button>' : ''}
          </div>
        </div>`;
        return;
      }

      if (state.mode === 'locked') {
        mount.innerHTML = `<div class="gate-card">
          <div class="gate-mark" aria-hidden="true">✦</div>
          <p class="gate-eyebrow">${escapeHTML(options.eyebrow || 'Private workspace')}</p>
          <h1 class="gate-title">Too many tries</h1>
          <p class="gate-text">For safety, PIN entry is paused for a few minutes.</p>
          <p class="gate-note">${escapeHTML(state.lockedUntil || '')}</p>
          <div class="gate-actions">
            <button class="btn btn--primary gate-btn" type="button" data-gate="retry">Try again</button>
          </div>
        </div>`;
        return;
      }

      if (state.mode === 'setup') {
        mount.innerHTML = `<div class="gate-card">
          <div class="gate-mark" aria-hidden="true">✦</div>
          <p class="gate-eyebrow">${escapeHTML(options.eyebrow || 'Private workspace')}</p>
          <h1 class="gate-title">${escapeHTML(options.setupTitle || 'Create your PIN')}</h1>
          <p class="gate-text">${escapeHTML(options.setupSubtitle || 'Choose a 6–12 digit PIN. You will need it on every device.')}</p>
          <form class="gate-form" data-gate-form="setup" novalidate>
            <label class="gate-field">
              <span>New PIN</span>
              <input class="input gate-pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" pattern="[0-9]*" name="pin" placeholder="6–12 digits">
            </label>
            <label class="gate-field">
              <span>Confirm PIN</span>
              <input class="input gate-pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" pattern="[0-9]*" name="confirm" placeholder="Repeat it">
            </label>
            <p class="gate-error" role="alert"${state.error ? '' : ' hidden'}>${escapeHTML(state.error)}</p>
            <button class="btn btn--primary gate-btn" type="submit"${state.busy ? ' disabled' : ''}>${state.busy ? 'Creating…' : 'Create PIN'}</button>
          </form>
          <p class="gate-note">The PIN is stored as a hash in your Supabase database. Forgot it later? Run the reset snippet in <code>supabase/schema.sql</code>.</p>
        </div>`;
        return;
      }

      // unlock
      mount.innerHTML = `<div class="gate-card">
        <div class="gate-mark" aria-hidden="true">✦</div>
        <p class="gate-eyebrow">${escapeHTML(options.eyebrow || 'Private workspace')}</p>
        <h1 class="gate-title">${escapeHTML(options.title || 'Enter your PIN')}</h1>
        <p class="gate-text">${escapeHTML(options.subtitle || 'This keeps the tracker private to your household.')}</p>
        <form class="gate-form" data-gate-form="unlock" novalidate>
          <label class="gate-field">
            <span>PIN</span>
            <input class="input gate-pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" pattern="[0-9]*" name="pin" placeholder="6–12 digits" autofocus>
          </label>
          <p class="gate-error" role="alert"${state.error ? '' : ' hidden'}>${escapeHTML(state.error)}</p>
          <p class="gate-detail"${state.detail ? '' : ' hidden'}>${escapeHTML(state.detail)}</p>
          <button class="btn btn--primary gate-btn" type="submit"${state.busy ? ' disabled' : ''}>${state.busy ? 'Unlocking…' : 'Unlock'}</button>
        </form>
        <p class="gate-note">PINs are checked on the server, not in this browser.</p>
      </div>`;
    }

    function fail(message) {
      state.error = message || 'Something went wrong.';
      state.mode = state.mode === 'loading' ? 'error' : state.mode;
      draw();
    }

    async function finish(result) {
      if (typeof options.onUnlock === 'function') {
        await options.onUnlock(result);
      }
      if (typeof options.onDone === 'function') options.onDone(result);
    }

    async function checkExisting() {
      const session = readSession();
      if (!sessionUsable(session)) {
        if (session) clearSession();
        return false;
      }
      try {
        const result = await api.load(session.token);
        if (result && result.error) {
          if (result.error === 'session_expired') clearSession();
          return false;
        }
        if (result && result.expires_at) {
          writeSession(session.token, result.expires_at);
        }
        await finish({ ...result, token: session.token, restored: true });
        return true;
      } catch (error) {
        if (error && error.network) {
          if (options.offlineData) {
            state.mode = 'error';
            state.error = 'You appear to be offline. You can open the copy saved on this device.';
            draw();
            return true;
          }
          state.mode = 'error';
          state.error = 'The server is unreachable. Try again when you are online.';
          draw();
          return true;
        }
        state.mode = 'error';
        state.error = error.message || 'Could not check this session.';
        state.errorTitle = error.title || '';
        state.errorNote = error.note || '';
        state.errorSetup = !!error.setupMissing;
        draw();
        return true;
      }
    }

    async function boot() {
      state.mode = 'loading';
      state.error = '';
      state.errorTitle = '';
      state.errorNote = '';
      state.errorSetup = false;
      state.detail = '';
      draw();

      const existing = await checkExisting();
      if (existing) return;

      try {
        const status = await api.status();
        if (!status.configured) {
          if (options.allowSetup === false) {
            state.mode = 'error';
            state.error = 'This workspace has not been set up yet. Open the tracker first to create a PIN.';
            draw();
            return;
          }
          state.mode = 'setup';
          draw();
          return;
        }
        state.mode = 'unlock';
        draw();
      } catch (error) {
        state.mode = 'error';
        state.error = error.message || 'The server is unreachable.';
        state.errorTitle = error.title || '';
        state.errorNote = error.note || '';
        state.errorSetup = !!error.setupMissing;
        draw();
      }
    }

    mount.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-gate-form]');
      if (!form) return;
      event.preventDefault();
      if (state.busy) return;

      const mode = form.dataset.gateForm;
      const pin = String((form.querySelector('[name="pin"]') || {}).value || '').trim();
      const confirm = String((form.querySelector('[name="confirm"]') || {}).value || '').trim();
      state.error = '';
      state.detail = '';

      if (!PIN_RE.test(pin)) {
        state.error = 'Use 6 to 12 digits.';
        draw();
        return;
      }

      if (mode === 'setup' && pin !== confirm) {
        state.error = 'The two PINs do not match.';
        draw();
        return;
      }

      state.busy = true;
      draw();

      try {
        let result;
        if (mode === 'setup') {
          result = await api.setup(pin, dataForSetup());
        } else {
          result = await api.unlock(pin);
        }

        if (result && result.error) {
          state.busy = false;
          if (result.error === 'invalid_pin') {
            const left = Number(result.attempts_remaining);
            state.error = 'That PIN is not right.';
            state.detail = Number.isFinite(left) && left > 0 ? `${left} attempt${left === 1 ? '' : 's'} left before a short pause.` : '';
            state.mode = 'unlock';
            draw();
            return;
          }
          if (result.error === 'locked') {
            state.mode = 'locked';
            const until = result.locked_until ? new Date(result.locked_until) : null;
            state.lockedUntil = until && !Number.isNaN(until.getTime())
              ? `Try again after ${until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
              : 'Try again in a few minutes.';
            draw();
            return;
          }
          if (result.error === 'already_configured') {
            state.mode = 'unlock';
            state.error = 'This workspace already has a PIN. Enter it below.';
            draw();
            return;
          }
          if (result.error === 'invalid_pin_format') {
            state.mode = mode;
            state.error = 'Use 6 to 12 digits.';
            draw();
            return;
          }
          state.mode = mode;
          state.error = 'Could not continue. Check the Supabase setup.';
          draw();
          return;
        }

        if (!result || !result.token) {
          state.busy = false;
          state.mode = mode;
          state.error = 'The server returned an unexpected answer.';
          draw();
          return;
        }

        writeSession(result.token, result.expires_at);
        await finish({ ...result, token: result.token, restored: false });
      } catch (error) {
        state.busy = false;
        if (error.setupMissing) {
          state.mode = 'error';
          state.error = error.message;
          state.errorTitle = error.title || '';
          state.errorNote = error.note || '';
          state.errorSetup = true;
          draw();
          return;
        }
        state.mode = mode;
        state.error = error.message || 'Could not reach the server.';
        state.errorSetup = false;
        if (error.data && error.data.message) state.error = error.data.message;
        draw();
      }
    });

    mount.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-gate]');
      if (!button) return;
      const action = button.dataset.gate;

      if (action === 'retry') {
        boot();
        return;
      }

      if (action === 'offline' && options.offlineData) {
        try {
          await finish({
            token: '',
            offline: true,
            data: options.offlineData,
            revision: 0
          });
        } catch (error) {
          state.mode = 'error';
          state.error = error.message || 'Could not open the offline copy.';
          state.errorTitle = '';
          state.errorNote = '';
          draw();
        }
      }
    });

    boot();
  }

  global.NorthstarAuth = Object.assign(api, { mountGate, pinError });
})(window);
