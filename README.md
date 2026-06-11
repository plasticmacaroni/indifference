# Indifference — PF2e Disposition Tracker

A lightweight Foundry VTT v14 (hopefully) module for the Pathfinder Second Edition system plugin, that tracks
each NPC's attitude toward the party on the PF2e ladder, from a single GM dashboard — and posts
clean, official disposition-change cards to chat if a GM would like to reveal that to players.

<p align="center">
  <img src="docs/dashboard.png" alt="GM dashboard" width="46%">
  <img src="docs/chat-card.png" alt="Disposition change chat card" width="42%">
</p>

It uses teh following Pathfinder official rules regarding dispositions: 

| Value | Attitude    | Meaning |
| ----: | ----------- | ------- |
|    −2 | Hostile     | Actively seeks to harm you and won't accept Requests |
|    −1 | Unfriendly  | Dislikes and distrusts you, and won't accept Requests |
|     0 | Indifferent | Doesn't care about you one way or the other |
|    +1 | Friendly    | Likes you; likely to agree to simple, safe Requests |
|    +2 | Helpful     | Wants to actively aid you and accepts reasonable Requests |

> Most NPCs start Indifferent (0). A *Make an Impression* success bumps one step up,
> a critical success two; failures hold or drop. This tool just records where each NPC sits.

## Usage

- A masks button appears in the Token scene controls (GM only) — click it (I hope you can see it lol) to open the dashboard.
- The dashboard lists every NPC token on the **active scene**, plus any NPC you've already
  given an attitude. For each row:
  - **+ / −** step the attitude one stage (clamped to −2…+2).
  - The **colored pips** jump straight to a specific attitude.
  - The **↺** button clears the value (back to untracked).
  - **Click** a portrait to open the NPC sheet; **drag** it onto the scene to place a token.
  - Rows are ordered most-positive first; off-scene tracked NPCs sit below a collapsible break.

Changes save instantly to the actor and sync to other connected GMs. They ideally should persist between times you drop actors onto the scene. 

I tried to add a reason for attitude changes, so a GM can send them to chat. You should see a little chat button. 

It opens a dialog where you pick the attitude (defaults to current) and write a reason, then posts a
styled system card to chat for everyone. Nothing is posted when you change attitudes, unless you open this and click Post.

```
┌─────────────────────────────────────┐
│  ⚖  DISPOSITION CHANGE               │
├─────────────────────────────────────┤
│  🗿 Annis Hag                        │
│  😐 Indifferent (0) → 🙂 Friendly (+1)│
│  ❝ The party cleared his name. ❞     │
└─────────────────────────────────────┘
```

If you don't change the value (just annotate the current standing), the card reads **Disposition
Note** and shows the single attitude instead of a transition.

## Data model

Attitude is stored as a single integer flag on the base Actor:

```js
actor.getFlag("indifference", "attitude"); // -2..+2, or undefined if untracked
```

It is always stored on the canonical directory actor (`token.baseActor`), regardless of
whether a token is linked or unlinked. My goal is to make it persistent regardless of how you're adding stuff to the scene. 

## Scripting API

Exposed at both `game.modules.get("indifference").api` and `globalThis.indifference`:

```js
indifference.get(actor);          // -> current value (0 if unset)
indifference.set(actor, 2);       // -> set to Helpful
indifference.step(actor, -1);     // -> drop one stage
indifference.clear(actor);        // -> remove the flag
indifference.info(1);             // -> { value, key, label, icon, color }
indifference.isTracked(actor);    // -> boolean
indifference.open();              // -> open the dashboard
indifference.ATTITUDES;           // -> the full ladder
```

A hook fires on every change so other modules/macros can react:

```js
Hooks.on("indifference.attitudeChanged", (actor, newValue, oldValue) => { /* ... */ });
```
