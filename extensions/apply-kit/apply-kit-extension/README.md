# Apply Kit

**Apply Kit** fills job applications from a profile you keep in your browser. It can fill a whole page with one shortcut, or open a searchable picker for a single field when you want to choose a different saved answer.

Everything stays local. There is no account, no sync service, no analytics, and no network request from the extension.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this `apply-kit-extension` folder — the folder that contains `manifest.json`.
5. Pin **Apply Kit** to the toolbar.
6. Click the icon, then choose **Add your details first** or **Edit profile** to open the settings page.

The extension has no build step and no dependencies. Load the folder directly.

## Add your profile

The settings page groups details into six sections:

- **Personal** — name, email, phone, address, links
- **Work** — current and previous role, dates, descriptions
- **Education** — school, degree, major, graduation date, GPA
- **Eligibility** — work authorization, sponsorship, relocation, availability
- **Answers** — summary, cover letter, “why this company?”, strengths, weaknesses
- **Sensitive** — date of birth, SSN, gender, race/ethnicity, veteran status, disability status, salary

Every change autosaves to `chrome.storage.local`. You can also add **custom answers** for questions that are not in the standard list. Give each custom answer a label, comma-separated keywords, and a reusable value; the matcher uses all three.

Use **Export** to download a JSON backup and **Import** to restore one. **Clear** removes the saved profile and resets the fill settings.

## Fill a page

1. Open a job application.
2. Click the Apply Kit icon and choose **Fill this page**, or press **Alt+Shift+F**.
3. Apply Kit fills the fields it recognizes and shows a summary toast.

By default it only fills fields that are empty. Turn off **Only fill empty fields** in the popup or settings page when you deliberately want to overwrite what is already there.

The toast has an **Undo** action that restores the values from before the fill.

## Pick a single value

1. Click the field you want to fill.
2. Press **Alt+Shift+A**.
3. Search for a saved value, then click it or press Enter.

The picker replaces the field's current value. It does not depend on the sensitive-fill setting, so you can still choose a sensitive value manually when automatic sensitive filling is off.

Both shortcuts can be changed at `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`). Browsers sometimes reserve a shortcut for themselves; Edge, for example, leaves `Alt+Shift+A` unassigned in some versions. If a default does not appear, assign a different combination such as `Alt+Shift+K` there. The commands remain available even when the suggested key is taken.

## Sensitive fields

Sensitive fields are enabled for automatic filling by default. Turn off **Include sensitive fields** in the popup or settings page to leave SSN, date of birth, salary, gender, race/ethnicity, veteran status, and disability status untouched during a page fill. You can still pick those values manually from the picker.

Values are stored locally in the extension's own storage. The background worker marks that storage as trusted-context only so ordinary page scripts cannot read it. Profile values are passed to the page only when you run a fill or open the picker.

## Résumé and CV uploads

File inputs are deliberately left alone. Apply Kit reports how many file inputs it found in the toast and popup, but you attach the résumé or CV yourself. Browser security rules also prevent a page script from silently setting a local file input.

## What the matcher looks at

Apply Kit scores each field using:

- Visible `<label>` text
- `aria-label`, `aria-labelledby`, and `title`
- Placeholder text
- `name` and `id`
- `autocomplete` tokens
- Nearby text in the same field wrapper
- Section headings
- Field type (`email`, `tel`, `date`, `select`, radio groups)
- Your custom answer labels and keywords

It recognizes common variants such as “Given name”, “Surname”, “Mobile”, “ZIP”, “Right to work”, “Will you now or in the future require sponsorship?”, “Earliest start date”, “Current employer”, and “Desired compensation”. State and country aliases handle short codes and full names in `<select>` menus.

## Limitations

- Matching is heuristic. Two fields with nearly identical labels can be treated as ambiguous and left empty rather than guessed. Add a custom answer to disambiguate.
- Custom JavaScript widgets, cross-origin iframes, CAPTCHAs, and multi-step applications may need manual help.
- The profile holds one current role, one previous role, and one education entry. Longer job or education histories need manual entry or custom answers.
- `<select>` and radio values must match one of the offered options. Apply Kit tries aliases such as state names and yes/no wording, but it will skip an option it cannot match.
- Date inputs are normalized to `YYYY-MM-DD` where possible; unusual formats may not convert.
- Sensitive data is only as private as the browser profile it is stored in. Use **Clear** and remove the extension if you are using a shared computer.
- The extension requests `storage`, `activeTab`, and `scripting`. It does not request broad host permissions, so it only acts on the page where you invoke it.

## Test form

The settings page has an **Open test form** link. The form exercises labels, placeholders, aria labels, autocomplete tokens, selects, radio groups, duplicate fields, sensitive fields, custom answers, distractors, event logging, and undo behavior.

The page-side test suite has 57 assertions, including:

- Fill-only-empty behavior and overwrite mode
- Every profile section
- Select and radio matching
- Duplicate-field protection
- Sensitive fields on and off
- Undo
- Input and change events
- File and password inputs left alone
- Custom answer matching

Open the test form, click **Run autofill**, and check the assertion list. You can also call `window.__applyKitTest.run()` from the developer console.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, commands, popup, options, icons |
| `schema.js` | Shared profile sections, field metadata, defaults |
| `rules.js` | Field vocabulary, autocomplete map, aliases, sensitivity list |
| `content.js` | Page-side field collector, matcher, filler, undo, picker bridge |
| `picker.js` | Shadow-DOM picker and toast UI |
| `background.js` | Service worker, storage, script injection, commands, messaging |
| `options.html` | Profile settings page |
| `options.css` | Settings-page styling |
| `options.js` | Autosave, custom answers, import/export, clear, test-form link |
| `popup.html` | Toolbar popup |
| `popup.css` | Popup styling |
| `popup.js` | Profile summary, fill action, settings toggles |
| `test-form.html` | Local stress test and assertion suite |
| `icons/` | 16/32/48/128 toolbar icons plus a 512 px store icon |

## Privacy

- Profile data is stored only in `chrome.storage.local`.
- The extension makes no HTTP requests and has no server or account.
- No analytics, tracking, or usage reporting.
- The content script runs only when you invoke a fill or picker action.
- File inputs are never populated.

Apply Kit is a local tool, not a job-application service. Review every filled answer before submitting, especially on unfamiliar sites.
