# Changelog

All notable changes to **Indifference** are documented here. This project follows
[Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/). At least I hope it does. 

## [0.4.0] — Unreleased

### Added
- **Game-time timestamps**: new timeline entries are stamped with the PF2e World Clock time and
  display in your world's calendar theme (e.g. "2 Abadius 4725 AR · 13:30", full Golarion date in
  the tooltip alongside the real-world time). Falls back to real-world time when the World Clock
  isn't available — and for entries logged before this version.
- **Faction reset button** (↺ on faction rows, next to edit/delete): after a confirm, reputation
  returns to 0 (Ignored) and the faction's whole timeline is erased. Also `indifference.factions.reset(id)`.

## [0.3.0] — Unreleased

### Added
- **Faction reputation**: factions now track the PF2e reputation scale, −50 (Hunted) … +50 (Revered),
  default 0 (Ignored), with the GM Core tiers (Revered/Admired/Liked/Ignored/Disliked/Hated/Hunted).
  Rows get ± steppers and a direct number input; the say-why dialog shows a tier legend.
  Existing 0.2.0 faction attitudes migrate automatically (×10).
- **Faction colors and icons**: create/edit dialog (pencil button on faction rows) with a name field,
  color picker, and a 16-icon set. Colors/icons show on rows, chips, sheet pills, and chat cards.
- **Faction picker modal**: an expanded NPC row now shows only its *assigned* factions as read-only
  chips, plus an Edit button that opens a checkbox picker — no more accidental chip clicks
  toggling membership.
- **Deletable log entries**: hover a timeline entry to reveal an × that removes it from the log.

### Changed
- Chat cards no longer carry the "Disposition" speaker title (the alias is blank now).
- The NPC sheet badge is a proper centered pill showing the attitude text ("Friendly"), with one
  pill per aligned faction showing its name and reputation tier.
- API: `factions.set` takes a reputation value; `factions.align` replaced by `factions.assign`
  (replace-all) and `factions.of`; added `repInfo`, `REPUTATIONS`, `deleteLogEntry`.

## [0.2.0] — Unreleased

### Added
- **Change timelines**: every attitude change (quick steps included) is logged with a date/time,
  the old → new attitude, the reason, and whether it was announced. Click a name in the tracker
  to expand its timeline.
- **Quiet updates**: the Set Disposition dialog now has *Announce* and *Save quietly* buttons —
  quiet saves land in the timeline without posting anything to chat.
- **Reaction-style chat messages** (default): announcements now read "Abstalar liked that!" /
  "didn't like that!" (loved/hated for two-step jumps) instead of revealing the exact attitude.
  A world setting can restore the detailed ladder cards.
- **Factions**: create factions in the tracker (flag button); they get their own attitude, timeline,
  and announcements, and sit in their own group above scene NPCs. Align NPCs to factions from an
  expanded row's chips, and filter the NPC list by faction. View menu narrows to All / NPCs / Factions.
- **NPC sheet badge**: a bottom-left badge on NPC sheets shows the NPC's attitude plus one face per
  aligned faction — click any of them to view/update from the sheet.
- **Compact token HUD**: the HUD now shows just the attitude face; clicking it unfolds the
  up/down/say-why controls.
- **Hotbar button**: a thumbtack button in the tracker toolbar (or `indifference.addHotbarButton()`)
  creates an "open the tracker" macro on your hotbar.
- **Window Controls Next**: the tracker window registers itself with Window Controls Next, so it can
  be pinned/minimized to the taskbar.
- API: `indifference.history(actor)`, `indifference.factions.*` (all/get/create/delete/members/set/align),
  `indifference.addHotbarButton()`; `set()` accepts `{reason, announced, note}`.

### Changed
- `clear()` now removes the whole module flag scope (attitude + timeline + faction alignments).

## [0.1.0] — Unreleased

Initial release. Hopefully.

### Added
- GM dashboard (ApplicationV2) listing NPC attitudes on the PF2e ladder of feelings toward the (totally not murder hobo) party (−2 Hostile … +2 Helpful).
- Scene NPCs and a collapsible "off-scene tracked" group, ordered most-positive first.
- Attitude stored per prototypical, canonical actor object (`token.baseActor`) -- my goal here is that NPCs are basically updated even if you drop them in multiple scenes, but we'll see. 
- English localization.

[0.1.0]: https://github.com/plasticmacaroni/indifference/releases/tag/v0.1.0
