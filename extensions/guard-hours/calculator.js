(() => {
  "use strict";

  const MINUTE_CHART = [
    0.00, 0.02, 0.03, 0.05, 0.07, 0.08, 0.10, 0.12, 0.13, 0.15,
    0.17, 0.18, 0.20, 0.22, 0.23, 0.25, 0.27, 0.28, 0.30, 0.32,
    0.33, 0.35, 0.37, 0.38, 0.40, 0.42, 0.43, 0.45, 0.47, 0.48,
    0.50, 0.52, 0.53, 0.55, 0.57, 0.58, 0.60, 0.62, 0.63, 0.65,
    0.67, 0.68, 0.70, 0.72, 0.73, 0.75, 0.77, 0.78, 0.80, 0.82,
    0.83, 0.85, 0.87, 0.88, 0.90, 0.92, 0.93, 0.95, 0.97, 0.98,
    1.00
  ];

  const STORAGE_KEY = "guardHoursSettings";
  const isExtension =
    typeof chrome !== "undefined" &&
    Boolean(chrome.storage && chrome.storage.local);

  const $ = (id) => document.getElementById(id);

  const shiftEndInput = $("shiftEnd");
  const scheduledHoursInput = $("scheduledHours");
  const shiftWindow = $("shiftWindow");
  const shiftHint = $("shiftHint");
  const breakList = $("breakList");
  const addBreakButton = $("addBreak");
  const leaveTimeInput = $("leaveTime");
  const leaveHint = $("leaveHint");
  const workedHM = $("workedHM");
  const workedMinutes = $("workedMinutes");
  const payrollDecimal = $("payrollDecimal");
  const payrollNote = $("payrollNote");
  const scheduledOut = $("scheduledOut");
  const scheduledDec = $("scheduledDec");
  const breaksOut = $("breaksOut");
  const breaksDec = $("breaksDec");
  const earlyOut = $("earlyOut");
  const earlyDec = $("earlyDec");
  const formula = $("formula");
  const message = $("message");
  const copyButton = $("copyButton");
  const resetButton = $("resetButton");
  const openTabButton = $("openTab");
  const chartGrid = $("chartGrid");

  let lastResult = null;
  let settingsTimer = null;
  let copyTimer = null;

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function parseClockCandidates(raw) {
    let text = String(raw == null ? "" : raw)
      .trim()
      .toLowerCase()
      .replace(/\./g, "");

    if (!text) return null;
    text = text.replace(/\s+/g, " ");

    let hour;
    let minute = 0;
    let suffix = "";
    let match = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm|a|p)?$/);

    if (match) {
      hour = Number(match[1]);
      minute = Number(match[2]);
      suffix = match[3] || "";
    } else {
      match = text.match(/^(\d{1,4})\s*(am|pm|a|p)?$/);
      if (!match) return null;
      const digits = match[1];
      suffix = match[2] || "";
      if (digits.length <= 2) {
        hour = Number(digits);
        minute = 0;
      } else {
        hour = Number(digits.slice(0, -2));
        minute = Number(digits.slice(-2));
      }
    }

    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    if (suffix) {
      if (hour < 1 || hour > 12) return null;
      const isPm = suffix.charAt(0) === "p";
      if (hour === 12) {
        hour = isPm ? 12 : 0;
      } else {
        hour = isPm ? hour + 12 : hour;
      }
      return [hour * 60 + minute];
    }

    if (hour > 23) return null;
    if (hour === 0 || hour > 12) return [hour * 60 + minute];

    const am = (hour % 12) * 60 + minute;
    const pm = ((hour % 12) + 12) * 60 + minute;
    return [am, pm];
  }

  function parseNativeTime(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function formatClockMinutes(relativeMinutes) {
    const normalized =
      ((Math.round(relativeMinutes) % 1440) + 1440) % 1440;
    const hour24 = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${pad2(minute)} ${suffix}`;
  }

  function formatHM(minutes) {
    const total = Math.max(0, Math.round(minutes));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return `${hours}h ${mins}m`;
  }

  function formatDecimal(minutes) {
    const total = Math.max(0, Math.round(minutes));
    const hours = Math.floor(total / 60);
    const remainder = total % 60;
    const chartValue =
      MINUTE_CHART[remainder] == null
        ? Math.round((remainder / 60) * 100) / 100
        : MINUTE_CHART[remainder];
    return (hours + chartValue).toFixed(2);
  }

  function readShift() {
    const endRel = parseNativeTime(shiftEndInput.value);
    const hours = Number(scheduledHoursInput.value);

    if (endRel == null) {
      return { ok: false, message: "Choose a valid shift end time." };
    }
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      return {
        ok: false,
        message: "Scheduled hours must be between 0.25 and 24."
      };
    }

    const scheduledMinutes = Math.round(hours * 60);
    if (scheduledMinutes < 15) {
      return {
        ok: false,
        message: "Scheduled hours must be at least 0.25."
      };
    }

    return {
      ok: true,
      endRel,
      startRel: endRel - scheduledMinutes,
      scheduledMinutes
    };
  }

  function resolveShiftTime(raw, shift, options) {
    const allowAfterEnd = Boolean(options && options.allowAfterEnd);
    const candidates = parseClockCandidates(raw);
    if (!candidates) return { ok: false, reason: "format" };

    const inside = new Set();
    const after = new Set();

    for (const candidate of candidates) {
      for (let offset = -2; offset <= 2; offset += 1) {
        const relative = candidate + offset * 1440;
        if (relative >= shift.startRel && relative <= shift.endRel) {
          inside.add(relative);
        } else if (
          allowAfterEnd &&
          relative > shift.endRel &&
          relative <= shift.endRel + 240
        ) {
          after.add(relative);
        }
      }
    }

    if (inside.size > 1) return { ok: false, reason: "ambiguous" };
    if (inside.size === 1) {
      return { ok: true, rel: inside.values().next().value, inside: true };
    }
    if (after.size > 1) return { ok: false, reason: "ambiguous" };
    if (after.size === 1) {
      return {
        ok: true,
        rel: after.values().next().value,
        inside: false,
        afterEnd: true
      };
    }

    return { ok: false, reason: "outside" };
  }

  function windowText(shift) {
    return `${formatClockMinutes(shift.startRel)} – ${formatClockMinutes(
      shift.endRel
    )}`;
  }

  function breakError(index, part, reason, shift) {
    const label = `Break ${index + 1} ${part}`;
    if (reason === "format") {
      return `${label} isn't a valid time. Try 9:30, 9:30 PM, or 21:30.`;
    }
    if (reason === "ambiguous") {
      return `${label} is ambiguous. Add AM or PM.`;
    }
    return `${label} is outside the shift window (${windowText(shift)}).`;
  }

  function leaveError(reason, shift) {
    if (reason === "format") {
      return "Leave time isn't valid. Try 3:30, 3:30 AM, or 03:30.";
    }
    if (reason === "ambiguous") {
      return "Leave time is ambiguous. Add AM or PM.";
    }
    return `Leave time is outside the shift window (${windowText(shift)}).`;
  }

  function updateShiftSummary(shift) {
    if (!shift || !shift.ok) {
      shiftWindow.textContent = "—";
      shiftHint.textContent = "Choose a valid shift end and scheduled hours.";
      leaveHint.textContent = "Shift end unavailable.";
      return;
    }

    const start = formatClockMinutes(shift.startRel);
    const end = formatClockMinutes(shift.endRel);
    shiftWindow.textContent = `${start} – ${end}`;
    shiftHint.textContent = `Shift starts at ${start}. Times can be entered as 9:30, 9:30 PM, or 21:30.`;
    leaveHint.textContent = `Shift ends at ${end}.`;
  }

  function setMessage(text, state) {
    message.textContent = text || "";
    if (state) {
      message.dataset.state = state;
    } else {
      delete message.dataset.state;
    }
  }

  function setResultEmpty(subtext) {
    workedHM.textContent = "—";
    workedMinutes.textContent = subtext || "Enter the time left";
    payrollDecimal.textContent = "—";
    payrollNote.textContent = "Minutes → hundredths";
  }

  function setBreakdown(scheduled, breaks, early, worked) {
    const hasScheduled = scheduled != null;
    const hasBreaks = breaks != null;
    const hasEarly = early != null;
    const hasWorked = worked != null;

    scheduledOut.textContent = hasScheduled ? formatHM(scheduled) : "—";
    scheduledDec.textContent = hasScheduled ? formatDecimal(scheduled) : "—";
    breaksOut.textContent = hasBreaks ? formatHM(breaks) : "—";
    breaksDec.textContent = hasBreaks ? formatDecimal(breaks) : "—";
    earlyOut.textContent = hasEarly ? formatHM(early) : "—";
    earlyDec.textContent = hasEarly ? formatDecimal(early) : "—";

    if (hasScheduled && hasBreaks && hasEarly && hasWorked) {
      formula.textContent = `${formatHM(scheduled)} − ${formatHM(
        breaks
      )} − ${formatHM(early)} = ${formatHM(worked)}`;
    } else if (hasScheduled && hasBreaks) {
      formula.textContent = `${formatHM(scheduled)} − ${formatHM(
        breaks
      )} − early leave = total`;
    } else {
      formula.textContent = "—";
    }
  }

  function clearBreakDurations() {
    breakList
      .querySelectorAll("[data-break-duration]")
      .forEach((element) => {
        element.textContent = "—";
      });
  }

  function calculate() {
    lastResult = null;
    copyButton.disabled = true;

    const shift = readShift();
    updateShiftSummary(shift);

    if (!shift.ok) {
      clearBreakDurations();
      setResultEmpty("Check the shift settings");
      setBreakdown(null, null, null, null);
      setMessage(shift.message, "error");
      return;
    }

    const rows = Array.from(breakList.querySelectorAll(".break-row"));
    const ranges = [];
    const breakDetails = [];
    let breaksTotal = 0;
    let error = "";

    rows.forEach((row, index) => {
      const startInput = row.querySelector("[data-break-start]");
      const endInput = row.querySelector("[data-break-end]");
      const durationElement = row.querySelector("[data-break-duration]");
      const startRaw = startInput.value.trim();
      const endRaw = endInput.value.trim();

      if (!startRaw && !endRaw) {
        durationElement.textContent = "—";
        return;
      }

      if (!startRaw || !endRaw) {
        durationElement.textContent = "—";
        if (!error) {
          error = `Break ${index + 1} needs both a start and an end.`;
        }
        return;
      }

      const start = resolveShiftTime(startRaw, shift);
      const end = resolveShiftTime(endRaw, shift);

      if (!start.ok) {
        durationElement.textContent = "—";
        if (!error) error = breakError(index, "start", start.reason, shift);
        return;
      }

      if (!end.ok) {
        durationElement.textContent = "—";
        if (!error) error = breakError(index, "end", end.reason, shift);
        return;
      }

      if (end.rel <= start.rel) {
        durationElement.textContent = "—";
        if (!error) {
          error = `Break ${index + 1} end must be after its start.`;
        }
        return;
      }

      const duration = end.rel - start.rel;
      durationElement.textContent = formatHM(duration);
      breaksTotal += duration;
      ranges.push({
        index,
        start: start.rel,
        end: end.rel,
        duration
      });
      breakDetails.push(
        `Break ${index + 1}: ${formatClockMinutes(
          start.rel
        )} – ${formatClockMinutes(end.rel)} (${formatHM(duration)})`
      );
    });

    if (!error && ranges.length > 1) {
      const sorted = ranges
        .slice()
        .sort((a, b) => a.start - b.start || a.end - b.end);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].start < sorted[i - 1].end) {
          error = `Break ${sorted[i - 1].index + 1} and Break ${
            sorted[i].index + 1
          } overlap.`;
          break;
        }
      }
    }

    const leaveRaw = leaveTimeInput.value.trim();
    let leave = null;
    let early = 0;
    let note = "";

    if (leaveRaw) {
      const resolved = resolveShiftTime(leaveRaw, shift, {
        allowAfterEnd: true
      });
      if (!resolved.ok) {
        if (!error) error = leaveError(resolved.reason, shift);
      } else {
        leave = resolved.rel;
        if (resolved.afterEnd || leave > shift.endRel) {
          early = 0;
          note = "Leave time is after shift end; no early-leave deduction.";
        } else {
          early = Math.max(0, shift.endRel - leave);
        }
      }
    }

    if (error) {
      setResultEmpty("Check the times above");
      setBreakdown(null, null, null, null);
      setMessage(error, "error");
      return;
    }

    if (leave == null) {
      setResultEmpty("Enter the time left");
      setBreakdown(shift.scheduledMinutes, breaksTotal, null, null);
      setMessage(
        "Add the time the guard left to finish the calculation.",
        ""
      );
      return;
    }

    const worked = shift.scheduledMinutes - breaksTotal - early;

    if (worked < 0) {
      setResultEmpty("Check the times above");
      setBreakdown(shift.scheduledMinutes, breaksTotal, early, null);
      setMessage(
        "Breaks and early leave add up to more than the scheduled shift.",
        "error"
      );
      return;
    }

    lastResult = {
      shift,
      breaksTotal,
      early,
      worked,
      leave,
      note,
      breakDetails
    };

    workedHM.textContent = formatHM(worked);
    workedMinutes.textContent = `${worked} minutes worked`;
    payrollDecimal.textContent = formatDecimal(worked);
    payrollNote.textContent = `${formatHM(worked)} → ${formatDecimal(worked)}`;
    setBreakdown(shift.scheduledMinutes, breaksTotal, early, worked);
    copyButton.disabled = false;

    if (note) {
      setMessage(note, "ok");
    } else if (breaksTotal === 0) {
      setMessage("No breaks entered. Early leave still deducted.", "ok");
    } else {
      setMessage("Calculated using the payroll minute chart.", "ok");
    }
  }

  function createBreakRow(startValue, endValue) {
    const row = document.createElement("div");
    row.className = "break-row";
    row.innerHTML = `
      <div class="break-row__top">
        <span class="break-row__title">Break</span>
        <span class="break-row__duration" data-break-duration>—</span>
        <button class="remove" type="button" data-remove-break aria-label="Remove break">×</button>
      </div>
      <div class="break-row__times">
        <label>
          <span>Start</span>
          <input type="text" data-break-start placeholder="9:30 PM" autocomplete="off" spellcheck="false" inputmode="text">
        </label>
        <span class="to" aria-hidden="true">→</span>
        <label>
          <span>End</span>
          <input type="text" data-break-end placeholder="10:30 PM" autocomplete="off" spellcheck="false" inputmode="text">
        </label>
      </div>
    `;

    row.querySelector("[data-break-start]").value = startValue || "";
    row.querySelector("[data-break-end]").value = endValue || "";

    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", calculate);
    });

    row.querySelector("[data-remove-break]").addEventListener("click", () => {
      row.remove();
      renumberBreaks();
      calculate();
    });

    breakList.appendChild(row);
    return row;
  }

  function renumberBreaks() {
    const rows = Array.from(breakList.querySelectorAll(".break-row"));
    rows.forEach((row, index) => {
      const number = index + 1;
      row.querySelector(".break-row__title").textContent = `Break ${number}`;
      row
        .querySelector("[data-break-start]")
        .setAttribute("aria-label", `Break ${number} start time`);
      row
        .querySelector("[data-break-end]")
        .setAttribute("aria-label", `Break ${number} end time`);
      row
        .querySelector("[data-remove-break]")
        .setAttribute("aria-label", `Remove break ${number}`);
    });
  }

  function addBreak() {
    const row = createBreakRow();
    renumberBreaks();
    calculate();
    row.querySelector("[data-break-start]").focus();
  }

  function resetTimes() {
    breakList.replaceChildren();
    createBreakRow();
    renumberBreaks();
    leaveTimeInput.value = "";
    calculate();
    const first = breakList.querySelector("[data-break-start]");
    if (first) first.focus();
  }

  function renderChart() {
    const fragment = document.createDocumentFragment();
    for (let minute = 1; minute <= 60; minute += 1) {
      const cell = document.createElement("div");
      cell.className = "chart__cell";

      const label = document.createElement("span");
      label.textContent = `${minute} min`;

      const value = document.createElement("span");
      value.textContent = MINUTE_CHART[minute].toFixed(2);

      cell.append(label, value);
      fragment.append(cell);
    }
    chartGrid.replaceChildren(fragment);
  }

  function settingsPayload() {
    const hours = Number(scheduledHoursInput.value);
    if (
      !shiftEndInput.value ||
      !Number.isFinite(hours) ||
      hours <= 0 ||
      hours > 24
    ) {
      return null;
    }
    return {
      shiftEnd: shiftEndInput.value,
      scheduledHours: hours
    };
  }

  async function saveSettings() {
    const payload = settingsPayload();
    if (!payload) return;

    try {
      if (isExtension) {
        await chrome.storage.local.set({ [STORAGE_KEY]: payload });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (error) {
      // Settings persistence is optional; calculation still works.
    }
  }

  function saveSettingsSoon() {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(saveSettings, 250);
  }

  async function loadSettings() {
    let stored = null;
    try {
      if (isExtension) {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        stored = result ? result[STORAGE_KEY] : null;
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        stored = raw ? JSON.parse(raw) : null;
      }
    } catch (error) {
      return;
    }

    if (!stored || typeof stored !== "object") return;

    if (
      typeof stored.shiftEnd === "string" &&
      /^\d{2}:\d{2}$/.test(stored.shiftEnd)
    ) {
      shiftEndInput.value = stored.shiftEnd;
    }

    const hours = Number(stored.scheduledHours);
    if (Number.isFinite(hours) && hours > 0 && hours <= 24) {
      scheduledHoursInput.value = String(hours);
    }
  }

  function buildCopyText() {
    if (!lastResult) return "";

    const { shift, early, worked, leave, note, breakDetails } = lastResult;
    const lines = [
      "Guard Hours",
      `Shift: ${formatClockMinutes(shift.startRel)} – ${formatClockMinutes(
        shift.endRel
      )} (${formatHM(shift.scheduledMinutes)})`
    ];

    if (breakDetails.length) {
      lines.push(...breakDetails);
    } else {
      lines.push("Breaks: none");
    }

    let leaveLine = `Left: ${formatClockMinutes(leave)}`;
    if (leave > shift.endRel) {
      leaveLine += " (after shift end)";
    } else if (early > 0) {
      leaveLine += ` (${formatHM(early)} early)`;
    } else {
      leaveLine += " (on time)";
    }
    lines.push(leaveLine);

    lines.push(`Worked: ${formatHM(worked)}`);
    lines.push(`Payroll: ${formatDecimal(worked)}`);

    if (note) lines.push(note);
    return lines.join("\n");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        return copied;
      } catch (fallbackError) {
        return false;
      }
    }
  }

  async function copyResult() {
    const text = buildCopyText();
    if (!text) return;

    const copied = await copyText(text);
    if (!copied) {
      setMessage("Could not copy. Select the result and copy it manually.", "error");
      return;
    }

    copyButton.textContent = "Copied";
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyButton.textContent = "Copy result";
    }, 1400);
  }

  function openFullPage() {
    if (isExtension && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL("calculator.html") });
      return;
    }
    window.open("calculator.html", "_blank", "noopener");
  }

  function bindEvents() {
    const onShiftChanged = () => {
      calculate();
      saveSettingsSoon();
    };

    shiftEndInput.addEventListener("input", onShiftChanged);
    shiftEndInput.addEventListener("change", onShiftChanged);
    scheduledHoursInput.addEventListener("input", onShiftChanged);
    scheduledHoursInput.addEventListener("change", onShiftChanged);
    addBreakButton.addEventListener("click", addBreak);
    leaveTimeInput.addEventListener("input", calculate);
    copyButton.addEventListener("click", copyResult);
    resetButton.addEventListener("click", resetTimes);
    openTabButton.addEventListener("click", openFullPage);
  }

  async function init() {
    renderChart();
    createBreakRow();
    renumberBreaks();
    bindEvents();
    await loadSettings();
    calculate();

    if (window.innerWidth >= 640) {
      openTabButton.hidden = true;
    }
  }

  window.GuardHours = {
    MINUTE_CHART,
    parseClockCandidates,
    parseNativeTime,
    formatClockMinutes,
    formatHM,
    formatDecimal,
    readShift,
    resolveShiftTime,
    calculate,
    buildCopyText
  };

  init();
})();
