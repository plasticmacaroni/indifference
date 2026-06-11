# Changelog

All notable changes to **Indifference** are documented here. This project follows
[Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/). At least I hope it does. 

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
