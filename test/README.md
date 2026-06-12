# Live browser tests

End-to-end checks that drive a real (headless Chrome) browser against a local Foundry server,
press the actual Attitude Tracker scene-control button, and assert on the rendered DOM.

- **test-verify.mjs** — window lifecycle: open, re-open, close/reopen, recovery from a dead
  pop-out window, recovery from a Window Controls Next taskbar stash, page responsiveness.
- **test-features.mjs** — feature smoke: quick-step logging, timeline expansion (entry, delete
  button, Edit-factions button), the Announce / Save quietly dialog, faction creation with
  color + icon, reputation tiers, and World Clock timestamps.

## Setup

Requires a local Foundry VTT install (v14) with a pf2e world that has this module enabled,
plus puppeteer:

```sh
cd test
npm install puppeteer
```

## Run

Start the Foundry server (e.g. headless: `node <foundry>/main.js --dataPath=<data> --port=30000`),
then:

```sh
node test-verify.mjs
node test-features.mjs
```

Environment overrides: `FVTT_URL` (default `http://localhost:30000`) and `FVTT_WORLD`
(default `test`). The scripts launch the world from setup if needed, join as the Gamemaster
user (no password), and write `verify.png` / `features.png` screenshots beside themselves.

## Gotchas worth keeping

- Wait for `/game` with `domcontentloaded`, never `networkidle` — the game socket never idles.
- Foundry core calls `bringToFront()` from `_attachFrameListeners` mid-render, before the
  element is in the DOM. Any frame-health guard must check `element.ownerDocument.defaultView`,
  not `element.isConnected` — getting this wrong caused the 0.4.2 freeze loop these tests catch.
