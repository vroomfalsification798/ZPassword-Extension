# Changelog

All notable changes to ZPassword. Versions follow [semver](https://semver.org).

## 1.3.1

- **About tab** with the source, download, author and project links, the tech
  stack, and the licence.
- **Cross-platform build**: `build.mjs` replaces the shell-only script, with
  `build.sh` and `build.ps1` as wrappers. No `zip` binary and no npm packages
  needed, and archives are byte-reproducible.
- Released under the **GNU GPL v3 or later**.
- Fixed the select dropdown arrows rendering at full box height — the inline SVG
  had a `viewBox` but no intrinsic size, so it scaled to fill.
- Custom scrollbars for both Chromium and Firefox.
- Concrete sans-serif font stack; `ui-sans-serif` resolved unpredictably on Linux.

## 1.3.0

- **Vault format 2.** The stored public key is authenticated with an HMAC under
  the passphrase key, so a substituted key is caught at unlock instead of
  silently redirecting every future password to an attacker. Entries bind their
  id and timestamp as AES-GCM additional data. Format 1 vaults upgrade on first
  unlock; format 1 entries still open.
- **Passphrase strength gate.** Multi-word phrases are scored by words rather
  than characters, and anything below four words' worth is refused.
- **Backup and restore** of the sealed vault — the only protection against
  losing a browser profile.
- **One sync key per pinned site.** A single `sites` map hit the 8 KB per-key
  quota at roughly thirty sites and the write simply failed; the ceiling is now
  the 512-item limit, with an explicit error at 500.
- Colour-coded password, history search, per-entry notes, a saved-for-this-site
  hint, an auto-lock countdown, and a first-run introduction.
- Full-tab view registered as the options page.
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> generates and fills without
  opening the popup.
- Accessibility: roving tabindex and arrow keys on tabs, arrow-key navigation in
  the character grid, focus trapping and restoration in the picker.
- Retention purge also runs when the popup opens; alarms are unreliable on a
  laptop that sleeps.

## 1.2.0

- Per-character picker for every class, reachable by double-click or the `⋯`
  button. The look-alikes shortcut expands into explicit choices when you reach
  for a character it is holding.
- On-open behaviour (fill, copy, save) became per-site alongside the character
  rules.
- **Sites** tab for reviewing and removing per-site rules.
- Auto-fill keeps the popup open and replaces its history entry rather than
  piling up.
- Custom checkboxes and selects; the native unchecked box was leaking through.

## 1.1.0

- Per-class character exclusions replaced the single symbol-set string, with a
  migration.

## 1.0.0

- First release: generate on open, per-site rules, one-click fill, and an
  encrypted history sealed with a passphrase.
