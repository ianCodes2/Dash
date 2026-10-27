# Guard Hours

A small Chrome extension for turning CCTV times into payroll hours.

Enter the guard's breaks and the time they left. Guard Hours calculates:

- total scheduled time minus breaks and early leave
- hours and minutes worked
- the payroll decimal from the **Minutes to Hundredths** chart

The default shift is **9 hours ending at 4:00 AM** — a 7:00 PM to 4:00 AM window. Both settings can be changed.

## Example

| Input | Value |
| --- | --- |
| Break | 9:30 PM – 10:30 PM |
| Time left | 3:30 AM |
| Shift ends | 4:00 AM |
| Scheduled hours | 9 |

Result:

- Break: 1h 0m
- Left early: 0h 30m
- Worked: **7h 30m**
- Payroll decimal: **7.50**

## Time entry

Times can be typed without AM/PM:

```text
9:30
10:30
3:30
```

They are resolved inside the current shift window. With the default 7:00 PM – 4:00 AM window, `9:30` becomes 9:30 PM and `3:30` becomes 3:30 AM.

These forms are also accepted:

```text
9:30 PM
9:30pm
21:30
930 PM
```

If a time is ambiguous, the app asks for AM or PM instead of guessing.

## Breaks

Use **+ Add break** for each break. Each row shows its duration. Empty break rows are ignored. Overlapping breaks are flagged so they cannot be subtracted twice.

## Payroll chart

The payroll result uses the exact **Minutes to Hundredths** values from `ddd.pdf`:

- 30 minutes → .50
- 40 minutes → .67
- 60 minutes → 1.00

Hours stay whole. For example, 7h 40m becomes `7.67`, not `7.66` or `7.40`.

The full 1–60 minute chart is available inside the extension under **Minute conversion chart**.

## Installation

1. Open Chrome (or Edge).
2. Go to `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `guard-hours-extension` folder.
6. Pin **Guard Hours** to the toolbar.

Click the toolbar icon to open the calculator. The extension also has an **Open in a tab** button for a larger view.

## Privacy

Everything runs locally. The extension has no host permissions, makes no network requests, and does not send times anywhere.

Shift settings are stored with `chrome.storage.local` so the 4:00 AM / 9-hour defaults survive closing the popup. Break times and leave times are not saved.

## Files

```text
guard-hours-extension/
  manifest.json
  calculator.html
  calculator.css
  calculator.js
  icons/
    icon16.png
    icon32.png
    icon48.png
    icon128.png
    icon512.png
  README.md
```

Always review the result against the CCTV record before submitting payroll.
