# ZPassword

[![Licence: GPL v3](https://img.shields.io/badge/licence-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-5b5bd6.svg)](manifest.json)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-30a46c.svg)](package.json)

| | |
| --- | --- |
| **Download** | [zsync.eu/zpassword-extension](https://zsync.eu/zpassword-extension/) |
| **Source** | [github.com/TheHolyOneZ/ZPassword-Extension](https://github.com/TheHolyOneZ/ZPassword-Extension) |
| **Author** | [TheHolyOneZ](https://github.com/TheHolyOneZ) |
| **More projects** | [zsync.eu](https://zsync.eu) |

A browser extension that solves one annoyance: you need a fresh password, so you
go find a generator page, and then nothing about that moment is remembered — not
the rules you picked, not the password itself.

ZPassword opens with a password already generated, keeps your rules per site, and
puts the password into the page for you.

- **A password is ready the instant you open it.** No button to press first,
  and it is colour-coded so you can read it back or type it by hand.
- **Or already in the page.** Turn on auto-fill and the box is filled before you
  have looked at it — without the popup closing on you.
- **Your settings stick.** Every control saves itself the moment you touch it.
- **Pick the exact characters.** Not just "symbols on" — double-click a kind and
  switch individual characters on or off, letter by letter.
- **Everything is per-site.** The site that caps you at 16 characters, bans `#`,
  and needs filling the moment you arrive gets its own rules; everywhere else
  keeps your defaults.
- **One-click fill.** Handles the new-password *and* confirm-password box, leaves
  the current-password box alone, and works inside iframes and shadow DOM.
- **Encrypted history.** Passwords you actually copy or fill are saved, sealed
  with a passphrase only you know, so you can get one back later — searchable,
  annotatable, and backed up to a file that stays encrypted.
- **Nothing leaves your machine.** No network code, no accounts, no telemetry.

---

## Install

Grab a ready-made zip from
[zsync.eu/zpassword-extension](https://zsync.eu/zpassword-extension/), or build
it yourself from source — see [Building](#building).

### Chrome, Edge, Brave, Vivaldi, Opera

1. Build the zips, or just use this folder directly.
2. Open `chrome://extensions` (`edge://`, `brave://`, `vivaldi://`… same page).
3. Turn on **Developer mode**, top right.
4. **Load unpacked** → pick this folder.
   *(To install from a zip instead: unzip `dist/zpassword-chromium-1.3.1.zip`
   first, then load that folder — browsers will not load a zip directly.)*
5. Pin ZPassword to the toolbar so it is one click away.

### Firefox

Firefox 115 or newer. (Module background scripts landed in 112; the binding
constraint is `storage.session`, which shipped in 115.)

1. Build to produce `dist/zpassword-firefox-<version>.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on…** → pick the zip.

Firefox removes temporary add-ons when it restarts. For a permanent install the
add-on has to be signed by Mozilla — free, at
[addons.mozilla.org](https://addons.mozilla.org/developers/) → submit → "on your
own" for a self-distributed signed copy.

Shortcuts (<kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd> on Mac):

| | |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Y</kbd> | Open ZPassword |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Generate and fill the page without opening it |

Rebind either at `chrome://extensions/shortcuts`.

Settings also has **Open ZPassword in a full tab**, which is the same interface
without the 384px squeeze — it is registered as the extension's options page, so
`chrome://extensions` reaches it too.

---

## Using it

**Generate** — a password is already there. <kbd>R</kbd> or the ↻ button makes
another. Click the password itself to copy it.

**Choosing characters** — the four buttons (`A–Z`, `a–z`, `0–9`, `!#$`) switch a
whole kind on and off. **Double-click one** — or press the `⋯` in its corner —
to open the picker and switch characters on and off individually. Each button
shows how many are in use, so `25/26` tells you at a glance that something is
switched off in there.

Inside the picker: **All**, **None**, and **Reset** (back to the shipped
default). Characters held off by *Exclude look-alikes* show with a dashed
border; clicking one turns that shortcut into plain per-character choices and
gives you the character you reached for, rather than doing nothing.

Symbols start with `" ' \` \\ | ~` switched off, since those are the ones that
tend to get mangled by shells, CSV exports, and sloppy signup forms. Switch them
back on in the picker if you want them.

**Fill on page** — writes into the password boxes of the current tab and closes.
If you click into a specific box first, only that box gets filled.

**Pin these here** — the button at the bottom of the Generate tab. Freezes the
current rules for the site you are on. Everything you change while a site is
pinned — character rules *and* the on-open behaviour in Settings — saves to that
site instead of your defaults.

**Right-click any text box** on a page → *Fill with a new password*. Generates
and fills without opening the popup at all; a ✓ badge confirms.

**Recent** — the passwords you copied or filled, newest first. Reveal, copy,
re-fill, annotate, or delete each one. Past five entries a search box appears,
matching on site and note. The Generate tab tells you when you already have a
saved password for the site you are on, so you do not make a second one by
accident.

**Sites** — every site that has rules of its own, what those rules are, and the
three on-open switches for each. Remove one site's rules, or all of them.

---

## Filling the moment it opens

Settings → *Fill the password into the page straight away*. From then on, opening
ZPassword on that site puts a fresh password into the box immediately.

The popup deliberately **stays open** when this happens — you still get to look
at the password, regenerate if you do not like it (which re-fills the page), copy
it, or change the rules. Only the explicit **Fill on page** button closes the
popup, because that is you saying you are done.

Repeated auto-fills do not pile up in the history: the entry is replaced each
time, so you end up with the password you actually kept, not a log of every
attempt. The moment you press **Copy**, that password is treated as committed and
stops being replaced.

Because this setting lives on the profile, it is per-site: auto-fill on the two
sites where you want it, and nowhere else.

---

## Global settings versus per-site settings

The header on the Settings tab always tells you which one you are editing:

- Not pinned → *"These are your defaults."*
- Pinned → *"These apply to github.com only. Your defaults are untouched."*

Per-site: everything about how the password is built (length, kinds, individual
characters, the Advanced switches) plus the three on-open behaviours (fill, copy,
save history).

Always global: how long saved passwords are kept, and how long the vault stays
unlocked. Those describe the one shared vault, so per-site copies would not mean
anything.

---

## About the encrypted history

Only passwords you *use* are saved. Idly hitting regenerate twenty times does not
fill the list — an entry is written when you copy or fill.

The encryption is arranged so that saving never interrupts you:

- On setup, a P-256 key pair is created. The **public** key is stored in the
  clear, so the extension can encrypt a new entry at any moment without asking
  for your passphrase.
- The **private** key is sealed with AES-256-GCM under a key derived from your
  passphrase (PBKDF2-SHA-256, 600,000 iterations). Reading history means
  unsealing it.
- Each entry gets its own ephemeral key pair, so two identical passwords produce
  completely different ciphertext.
- While unlocked, the private key sits in `storage.session` — memory only, never
  written to disk, gone when the browser closes. It also auto-locks on the timer
  you set in Settings.

ZPassword refuses a passphrase it can see through. The meter scores a multi-word
phrase by words rather than by characters — the character model would credit
"correct horse battery staple" with about 130 bits when a word-list attack needs
far less, and an optimistic number here would be the most misleading thing in
the extension. Four unrelated words is the floor.

**There is no recovery.** A wrong passphrase is indistinguishable from a
corrupted entry, by design. If you forget it, the only way forward is *Settings →
erase saved history*, which deletes the entries permanently. **Back up first**
(Settings → *Back up…*): the file is the sealed vault exactly as stored, so it is
no weaker than what is already on your disk, and it is the only protection
against losing a browser profile.

Two further protections, both aimed at someone who can *write* to your extension
storage rather than merely read it:

- The stored public key is authenticated with an HMAC under your passphrase. Without
  that, an attacker could swap in their own public key and silently receive every
  password generated from then on; now unlocking refuses and says so.
- Each entry binds its `id` and timestamp as AES-GCM additional authenticated
  data, so stored metadata cannot be reshuffled underneath the ciphertext.

Entries this key cannot open are counted and reported rather than quietly
skipped — silently hiding them would hide exactly the attack above.

What this protects against: someone reading your browser profile off disk, a
backup, or a synced copy. What it does **not** protect against: someone at your
unlocked computer while the vault is unlocked, or malware running as you. It is a
convenience record, not a replacement for a real password manager.

**The honest weak point is PBKDF2.** It is not memory-hard, so a GPU attacker
gets a large speedup over your browser, and WebCrypto offers no Argon2 or scrypt
without shipping WASM. 600,000 iterations is OWASP's current figure and the best
native choice, which means the vault's real strength is your passphrase entropy —
hence the meter that will not let you past four words' worth.

**Deliberately not implemented: clipboard auto-clear.** Doing it properly under
Manifest V3 needs an offscreen document plus clipboard *read* access to avoid
wiping something you copied afterwards, and it would not work in Firefox at all.
A security feature that silently works on one engine and not the other is worse
than an absent one, so it is absent. Clear it yourself after pasting.

Everything is stored locally. Your generator settings use `storage.sync`, so they
follow your browser profile if you have browser sync switched on; the vault and
its entries use `storage.local` and never sync.

Each pinned site occupies its own `storage.sync` key rather than sharing one map.
A single key is capped at 8 KB, which one map of every site reaches after roughly
thirty of them — and the write would simply have failed. Per-key, the ceiling is
the 512-item limit instead, and ZPassword stops you at 500 with an explanation
rather than a silent failure.

---

## Permissions, and why each one is needed

| Permission | Why |
| --- | --- |
| `storage` | Saving your settings and the encrypted history. |
| `activeTab` | Reading the current tab's hostname and filling it — granted only for the tab you invoked ZPassword on, only at that moment. |
| `scripting` | Running the filler in that tab. |
| `contextMenus` | The right-click *Fill with a new password* item. |
| `alarms` | Auto-lock, and purging entries past their retention window. |

There is deliberately no host permission such as `<all_urls>`, so ZPassword
cannot read any page unless you explicitly invoke it there.

---

## Building

Node 18 or newer is the only requirement — there is no bundler, transpiler, or
framework, and nothing to install before building.

```bash
node build.mjs        # any platform
./build.sh            # Linux / macOS wrapper
.\build.ps1           # Windows wrapper
npm run build         # same thing through npm
```

All four run the identical script and write
`dist/zpassword-{chromium,firefox}-<version>.zip`.

If PowerShell blocks the script, that is the execution policy rather than the
script itself:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

`build.mjs` contains a small ZIP writer built on Node's `zlib`, so the build
needs no `zip` binary — which Windows does not ship — and no npm packages. It
stamps a fixed timestamp into every entry, so two people building the same
commit get byte-identical archives and can compare hashes.

## Development

```bash
npm test          # generator, crypto, and passphrase scoring — plain Node, no dependencies
npm run test:ui   # drives the whole popup in jsdom (needs: npm install)
node stripper.mjs # strip every comment from the shipped source
```

`stripper.mjs` walks each file with a small scanner rather than a regular
expression, so it understands strings, template literals, regex literals, CSS
`url()` values and HTML raw-text elements — a naive `//` match would eat the
middle of every URL. It refuses to write a file if any URL in it would change,
keeps the GPL notice at the top of each file, and leaves the build scripts alone
since those are the one place a reader wants prose.

`jsdom` is the single development dependency and never ships. The zip contains
exactly the files you can read here, which is what makes a security tool
reviewable.

```
manifest.json           Chromium manifest
manifest.firefox.json   Firefox manifest (background.scripts + gecko id)
src/generator.js        password generation — CSPRNG, rejection sampling, entropy,
                        per-class character universes and exclusions
src/crypto.js           vault cryptography (no extension APIs, unit-tested)
src/vault.js            encrypted history on top of storage.local/session
src/prefs.js            profiles: defaults, per-site overrides, storage migration
src/strength.js         passphrase scoring for the vault
src/fill.js             the function injected into the page
src/inject.js           extension-side wrapper around the injection
src/browser.js          browser.* / chrome.* namespace shim
popup/                  the UI
background/             context menu, auto-lock, retention purge
```

To release a new version, bump `version` in **both** manifests and in
`package.json`, then build. The UI test asserts those three agree, so a
forgotten bump fails the suite rather than shipping.

### Verified

`npm test` covers 33 cases: output length, charset containment, per-character
exclusions, the one-of-each-kind and no-repeat constraints, rejection of
impossible option sets, entropy maths, a frequency-distribution check for bias,
the passphrase scorer, and the full vault lifecycle — encrypt while locked, wrong
passphrase rejected, tampered ciphertext rejected, **a swapped public key caught
before anything is decrypted**, metadata binding refusing a moved record,
format 1 entries still opening, a format 1 vault upgrading exactly once, and
passphrase rotation preserving old entries.

`npm run test:ui` covers 155 checks against the real popup markup: auto-generate
on open, per-character colouring, the character picker with keyboard navigation,
the look-alikes shortcut expanding into explicit choices, settings persistence,
per-site pinning and scoping, auto-fill staying open and replacing rather than
duplicating its history entry, search and notes, the backup/restore round trip,
the Sites tab, the vault setup / lock / unlock / delete flow, migration from both
older storage shapes, tab keyboard navigation, the About tab's links, and the
field-selection heuristics on a four-input change-password form.

Both suites are automated. Loading the extension in an actual browser has not
been done for you — that is the one step left.

---

## Licence

Copyright © 2026 [TheHolyOneZ](https://github.com/TheHolyOneZ).

ZPassword is free software: you may redistribute it and modify it under the
terms of the **GNU General Public License, version 3 or (at your option) any
later version**, as published by the Free Software Foundation. The full text is
in [LICENSE](LICENSE).

It is distributed in the hope that it will be useful, but **without any
warranty** — without even the implied warranty of merchantability or fitness for
a particular purpose. See the licence for details.

In practice that means you can read it, run it, change it, and pass it on; but
anything you distribute — modified or not — has to stay under the GPL and carry
its source with it. For a password tool that is the point: nobody should have to
take a claim about the cryptography on trust when they can read it.

## Links

- **Changelog** — [CHANGELOG.md](CHANGELOG.md)
- **Download and releases** — <https://zsync.eu/zpassword-extension/>
- **Source code** — <https://github.com/TheHolyOneZ/ZPassword-Extension>
- **Author** — <https://github.com/TheHolyOneZ>
- **More projects** — <https://zsync.eu>

Bug reports and pull requests are welcome on GitHub. If you find something wrong
with the cryptography specifically, please open an issue rather than a quiet
pull request, so other people running it find out too.
