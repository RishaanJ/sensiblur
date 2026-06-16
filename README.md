# SensiBlur

A Chrome extension that automatically blurs sensitive information — IDs, account numbers, amounts, emails, and more — in Gmail, so you don't get flashbanged when reading mail in public. Click any blurred span to reveal it.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue) ![Gmail only](https://img.shields.io/badge/host-mail.google.com-red)

## Features

- **Automatic detection** — scans open Gmail threads and censors matching text as it loads, including content added dynamically as you scroll or open messages.
- **Click to reveal** — click any censored span to toggle it back, then click again to re-blur. A floating **Reveal all / Blur all** pill toggles everything at once.
- **Choice of blur styles** — pick how censored text looks:
  - **▦ Pixel** — a pixelated mosaic (default)
  - **≈ Blur** — a soft Gaussian blur
  - **▬ Bar** — a solid redaction bar
- **16 built-in patterns**, each individually toggleable (see below).
- **Custom rules** — add your own keywords or regular expressions to blur anything else (a name, a project codename, a phrase).
- **Synced settings** — preferences persist and follow you across devices via `chrome.storage.sync`.

## Built-in patterns

| Pattern | Matches | On by default |
| --- | --- | --- |
| ID keyword | `ID: ABC-123`, `Member ID 99` | ✅ |
| # numbers | `#12345`, `Order #88-291` | ✅ |
| Long digits | account numbers, tracking, OTPs | ✅ |
| Money | `$1,234.56`, `€500`, `£12.99`, `₹2,000` | ✅ |
| SSN | `123-45-6789` | ✅ |
| Phone | `(555) 123-4567` | ✅ |
| Email addresses | `user@example.com` | ✅ |
| Credit card | `4242 4242 4242 4242` | ✅ |
| Date of birth | `DOB: 01/15/1990` | ✅ |
| Street address | `123 Main St Apt 4B` | ⬜ |
| IP address | `192.168.1.1` | ⬜ |
| Passport | `Passport: AB1234567` | ✅ |
| API keys / tokens | `sk_live_…`, `ghp_…`, `xoxb-…`, `AKIA…` | ✅ |
| Bank labels | `Account: …`, `Routing: …` | ✅ |
| Confirmation codes | `Confirmation: ABC123XYZ` | ✅ |
| Usernames | `username: foo`, `login: bar` | ⬜ |

## Installation

This extension is loaded unpacked (it isn't on the Chrome Web Store).

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this project folder.
5. Open [Gmail](https://mail.google.com) — sensitive text is blurred automatically.

## Usage

- **Reveal one item** — click a blurred span.
- **Reveal / blur everything** — use the floating pill in the bottom-right of Gmail.
- **Open settings** — click the SensiBlur toolbar icon to open the popup, where you can:
  - turn the whole extension on/off (the switch in the header),
  - choose a **blur style**,
  - toggle individual built-in patterns,
  - add or remove **custom rules** (type a word, or `/regex/` for a pattern).

Changes apply to open Gmail tabs immediately.

## How it works

- `content.js` walks the text nodes inside Gmail message/subject containers, matches them against the active regexes (built-in + custom), and wraps each hit in a `.sb-blur` span. The chosen blur style is applied via a `sb-style-*` class; the pixel style additionally paints a randomized canvas-generated mosaic tile as the span background. A `MutationObserver` re-scans content that Gmail loads dynamically.
- `popup.html` / `popup.js` render the settings UI and persist them to `chrome.storage.sync`. The content script listens for storage changes and re-renders without a reload.
- `styles.css` defines the censor styles, the reveal state, and the floating pill.

## Privacy

Everything runs locally in your browser. No text, matches, or settings are ever sent off-device — the only permissions requested are `storage` (for your preferences) and host access to `mail.google.com`.

## Project structure

```
manifest.json   — MV3 manifest (permissions, content script, popup)
content.js      — detection + censoring logic injected into Gmail
styles.css      — censor styles, reveal state, floating pill
popup.html      — settings UI markup + styles
popup.js        — settings UI logic, persistence
```

## Limitations

- Gmail only (`https://mail.google.com/*`).
- Pattern matching is heuristic — it can miss things or over-match. Tune the built-in toggles and custom rules to fit your mail.
