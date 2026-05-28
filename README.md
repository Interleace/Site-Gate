# 🚧 Site Gate — Fragerunde · Friction before distraction

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.4.0--beta.1-blue.svg)](CHANGELOG.md)
[![Status](https://img.shields.io/badge/status-alpha--self--use-orange.svg)]()
[![Manifest](https://img.shields.io/badge/manifest-MV3-purple.svg)]()
[![Firefox](https://img.shields.io/badge/Firefox-109%2B-ff6600.svg)]()
[![Chrome](https://img.shields.io/badge/Chrome-121%2B-4285F4.svg)]()
[![No Cloud](https://img.shields.io/badge/cloud-none-lightgrey.svg)]()
[![No Tracking](https://img.shields.io/badge/tracking-none-lightgrey.svg)]()

> **DE:** Self-use Browser-Addon für Selbsteinschränkung: blockierte Sites nur nach konfigurierbarer Fragerunde — oder Verzicht.
>
> **EN:** Self-use browser extension for self-restraint: blocked sites only after a configurable question round — or give up.

---

## Inhalt · Table of Contents

- [Warum · Why](#warum--why)
- [Wie es funktioniert · How it works](#wie-es-funktioniert--how-it-works)
- [Features](#features)
- [Fragen-Typen · Question types](#fragen-typen--question-types)
- [Commitment Lock · Verpflichtungssperre](#commitment-lock--verpflichtungssperre)
- [Leveling](#leveling)
- [Einstellungen · Settings tabs](#einstellungen--settings-tabs)
- [i18n](#i18n)
- [Installation](#installation)
- [Datenschutz · Privacy](#datenschutz--privacy)
- [Ehrliche Grenzen · Honest limits](#ehrliche-grenzen--honest-limits)
- [Projektstruktur · Structure](#projektstruktur--structure)
- [Mitmachen · Contributing](#mitmachen--contributing)
- [Sponsoring](#sponsoring)
- [Lizenz · License](#lizenz--license)

---

## Warum · Why

**DE:** Manche Blocker fühlen sich an wie eine Elternsperre für Erwachsene. Site Gate ist das Gegenteil: ein Werkzeug, das *dich fragt* — nicht eines, das dich bevormundet. Der Autopilot tippt `reddit.com`, Site Gate stoppt dich: Fragerunde, ehrliches Log, optional Commitment Lock fürs Future-you.

**EN:** Some blockers feel like parental controls for adults. Site Gate is the opposite: a tool that *asks you* — not one that lectures you. Autopilot types `reddit.com`, Site Gate stops you: question round, honest log, optional Commitment Lock for future-you.

> *„Du kannst abbrechen und verzichten — das ist der leichte Weg. Der andere ist ehrlich antworten."*
>
> *"You can abort and walk away — that's the easy path. The other is to answer honestly."*

---

## Wie es funktioniert · How it works

```
User navigiert → blockierte Domain?
                       │
              ┌────────▼────────┐
              │  background.js  │  sessionAllow? budget exceeded?
              └────────┬────────┘
                       │ redirect
              ┌────────▼────────┐
              │  gate/gate.html │  vollständige Umleitung (kein Overlay)
              └────────┬────────┘
                       │
           ┌───────────▼───────────┐
           │   Fragen nacheinander  │  Limit · Modus · Friction-Stacking
           └─────┬─────────────┬───┘
                 │             │
          Abbrechen         Fertig
                 │             │
          about:blank     Ziel-URL frei
          Log: aborted    Log: completed
```

1. Navigation zu blockierter Domain wird abgefangen.
2. Redirect zur Gate-Seite (Extension-Kontext, technisch schwer umgehbar ohne Abbrechen).
3. Fragen nacheinander — Limit, Reihenfolge und Friction-Stacking angewandt.
4. **Abbrechen** → `about:blank` + Protokolleintrag `aborted`.
5. **Durchhalten** → Ziel-URL für diesen Tab frei (Session) + Protokolleintrag `completed`.

---

## Features

| # | Feature | Beschreibung |
|---|---------|--------------|
| F01 | Blockliste | Domains konfigurierbar, eine pro Zeile, ohne `https://` |
| F02 | Vollständiger Abfang | Adresszeile, Links, Lesezeichen, Reload |
| F03 | Gate als Vollumleitung | Technisch schwer umgehbar außer Abbrechen oder Durchstehen |
| F04 | 6 Fragen-Typen | Freitext, Kopfrechnen, Wartezeit, Satz abtippen, Bestätigung (mehrstufig) |
| F05 | Fragen-Editor | Reihenfolge ↑↓, aktiv/inaktiv, Typ, Label, Hint, Schwellwerte |
| F06 | Fragen-Statistik | Gesamt / Aktiv / Inaktiv / Pro Durchlauf (live) |
| F07 | Fragen pro Durchlauf | Limit N, Modus `ordered`\|`random`, 0 = alle aktiven |
| F08 | Lokales Protokoll | Ziel-URL, Antworten, `aborted`\|`completed`, JSON-Export, max 200 Einträge |
| F09 | Toast-Benachrichtigung | Bei neuer Frage im Editor |
| F10 | Gate-Themes | `ember`, `forest`, `slate`, `dawn` via CSS-Variablen + Live-Vorschau |
| F11 | Commitment Lock | Verpflichtungssperre — [siehe unten](#commitment-lock--verpflichtungssperre) |
| F12 | Cross-Browser | Chrome/Edge/Firefox MV3 |
| F13 | i18n | en / de / es / fr + Auto + JSON-Overrides pro Key |
| F14 | Self-Leveling | Dual-Track: Integritäts-XP (Gate) + Wachstums-XP (befürwortete Sites) |
| F15 | Impuls-Budget | Global pro Tag + optional pro blockierter Domain |
| F16 | Befürwortete Domains | Tagesziele in Minuten, aktive Tab-Zeit → Growth-XP |
| F17 | Adaptive Modus | Langer Streak → kürzere Warte; Rückfall → +1 Bestätigung |

---

## Fragen-Typen · Question types

| Typ | Verhalten |
|-----|-----------|
| `text` | Freitext; konfigurierbar: `minChars`, `minWords`, optionales `requireDuration` |
| `math` | Zufällige Multiplikation; bei Fehler neue Aufgabe |
| `wait` | Countdown in Sekunden; Tab-Wechsel setzt Timer zurück |
| `phrase` | Satz fehlerfrei abtippen; kein Einfügen (Paste gesperrt) |
| `confirm` | Mehrfach „Ja, ich will wirklich"; Anzahl der Steps konfigurierbar |

---

## Commitment Lock · Verpflichtungssperre

**DE:** Future-you schützt Present-you: In einem guten Moment sperrst du das Lockern deiner eigenen Regeln.

**EN:** Future-you protects present-you: in a good moment, you lock the ability to loosen your own rules.

**Dauer · Duration:** `1h` · `4h` · `24h` · `7d` · `30d`

**Während der Sperre gesperrt · Blocked while locked:**
- Sites aus der Blockliste entfernen
- Fragen löschen, deaktivieren oder abschwächen
- Fragen-pro-Durchlauf-Limit unter Minimum senken

**Während der Sperre erlaubt · Allowed while locked:**
- Sites hinzufügen
- Fragen hinzufügen
- Regeln verschärfen

**Zeuge-Satz · Witness phrase:** Nur als SHA-256-Hash lokal gespeichert. Frühzeitiges Entsperren möglich; 3 Fehlversuche → 15 Minuten Cooldown.

**Impuls-Budget:** Max. N erfolgreiche Gate-Durchläufe pro Tag. Danach Sperrbildschirm statt Fragen.

**Friction-Stacking:** Jeder Durchlauf heute addiert Sekunden auf Warte-Fragen beim nächsten Mal (cap konfigurierbar).

---

## Leveling

**Dual-Gate Leveling** — Gate = Zurückhaltung, befürwortete Sites = produktiver Fortschritt.

| Track | Quelle | XP-Ereignisse |
|-------|--------|---------------|
| Integrität | Gate-Nutzung | Clean Day +15 · Abort +8 · Budget-Day +10 · Lock-Day +12 · Complete −4 |
| Wachstum | Befürwortete Domains | +2 XP/Minute · Tagesziel erfüllt +25 · Alle Ziele +40 |

10 Stufen aus `integrityXp + growthXp` kombiniert. Modus: `reflect` (nur Anzeige) · `adaptive` · `off`.

**Adaptive Regeln:**
- `cleanStreak ≥ 3` oder `growthStreak ≥ 2` → Wartezeit-Reduktion
- `completesToday ≥ 2` → +1 Bestätigungsschritt

---

## Einstellungen · Settings tabs

| Tab | Inhalt |
|-----|--------|
| **Sites** | Blockierte Domains verwalten |
| **Questions** | Fragen-Editor + Statistik + Limit/Modus |
| **Theme** | Gate-Themes + Live-Vorschau |
| **Lock** | Verpflichtungssperre aktivieren / Status / Entsperren |
| **Progress** | Dual-Track Leveling + befürwortete Domain-Ziele |
| **Language** | Sprache + JSON-Overrides |
| **Logs** | Protokoll anzeigen · exportieren · leeren |

---

## i18n

- Engine: `shared/i18n.js` + `shared/locales/{code}.json`
- Locales: `de` (vollständig) · `en` (de-fallback-merge) · `es` · `fr` (partiell → en)
- Einstellung: `gateSettings.locale` = `auto|en|de|es|fr`
- Overrides: `localeOverrides` in sync storage, JSON `key → string`
- UI: `data-i18n`, `data-i18n-placeholder`, `data-i18n-title` + `t(key, params)`
- Neue Sprache: `locales/xx.json` anlegen, partielle Keys genügen. Übersetzungen via PR willkommen; Keys in `en.json` sind Master.

---

## Installation

### Chrome / Edge

```
chrome://extensions  →  Entwicklermodus an  →  Entpackte Erweiterung laden  →  Ordner site-gate-extension
edge://extensions    →  analog
```

### Firefox

```
about:debugging  →  Diesen Firefox  →  Temporäres Add-on laden  →  manifest.json
```

> **Hinweis:** Temporäre Add-ons in Firefox werden nach Browser-Neustart entladen (debugging-Modus). Für persistente Nutzung: signiertes Add-on oder Developer Edition.

> **Note:** Temporary add-ons in Firefox are unloaded after browser restart (debugging mode). For persistent use: signed add-on or Developer Edition.

---

## Datenschutz · Privacy

**Site Gate sendet nichts. Deine Antworten bleiben auf deinem Gerät.**

*Site Gate sends nothing. Your answers stay on your device.*

| Was | Wo |
|-----|----|
| Blockliste, Fragen, Einstellungen | `chrome.storage.sync` (lokal / Browser-Sync nach eigenem Ermessen) |
| Protokoll, Lock, Stats | `chrome.storage.local` (nur lokal) |
| Zeuge-Satz | SHA-256-Hash, nicht rekonstruierbar |
| Telemetrie | keine |
| Netzwerk | keines (außer die Sites, die du nach dem Gate besuchst) |

---

## Ehrliche Grenzen · Honest limits

Site Gate ist **kein Gefängnis-Modus**. Ziel ist, dem impulsiven Ich Reibung zu geben — nicht absolute Kontrolle.

| Limit | Details |
|-------|---------|
| L01 | Extension deaktivieren oder deinstallieren umgeht alles |
| L02 | Inkognito: Extension muss separat erlaubt werden |
| L03 | Anderer Browser / Gerät / DNS / hosts-Datei nicht abgedeckt |
| L04 | Kein OS-Level-Lock |
| L05 | Firefox temporäres Add-on: Neuladen nach Browser-Neustart nötig |
| L06 | Kein Store-Listing — side-load only (noch) |

---

## Projektstruktur · Structure

```
site-gate-extension/
├── manifest.json
├── background.js
├── shared/
│   ├── defaults.js
│   ├── question-engine.js
│   ├── themes.js
│   ├── lock.js
│   ├── i18n.js
│   └── locales/
│       ├── de.json
│       ├── en.json
│       ├── es.json
│       └── fr.json
├── gate/
│   ├── gate.html
│   ├── gate.css
│   └── gate.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
└── scripts/
```

**Stack:** Vanilla JS · WebExtensions MV3 · CSS Custom Properties · keine Build-Chain erforderlich.

**Storage:** `sync` → Blockliste, Fragen, gateSettings · `local` → Logs, Lock, dailyStats.

**Background dual:** `background.scripts` (Firefox) + `service_worker` (Chrome), gleicher Code, `importScripts` für defaults + lock.

---

## Mitmachen · Contributing

PRs sind willkommen. Kein CLA. Halte dich an die Self-use-Philosophie des Projekts.

- Bugs und Feature-Requests → [Issues](https://github.com/USERNAME/site-gate/issues)
- Labels: `bug` · `enhancement` · `firefox` · `chrome` · `documentation` · `good-first-issue`
- Übersetzungen: `shared/locales/xx.json` anlegen, partielle Keys genügen, PR öffnen.

*No CLA. Stay within the self-use philosophy. Translations via PR welcome.*

---

## Sponsoring

Site Gate ist frei und Open Source. Features bleiben für alle gleich.

💚 [GitHub Sponsors](https://github.com/sponsors/USERNAME) · [Ko-fi](https://ko-fi.com/USERNAME) · [Patreon](https://patreon.com/USERNAME)

*Sponsor-Links sind gekennzeichnet. Keine VPN/Casino/Glücksspiel-Werbung. · Sponsor links are disclosed. No dark-pattern sponsoring.*

---

## Lizenz · License

[MIT](LICENSE) © 2026
