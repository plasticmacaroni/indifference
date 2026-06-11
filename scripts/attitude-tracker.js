/**
 * Indifference — PF2e Attitude Tracker
 * Tracks a party-wide attitude per NPC (and per faction) on the PF2e ladder (−2 Hostile … +2 Helpful).
 *
 * Storage: actor.getFlag("indifference", "attitude")  — integer attitude (unset = 0 / untracked)
 *          actor.getFlag("indifference", "log")       — change history [{t, from, to, reason, announced}]
 *          actor.getFlag("indifference", "factions")  — faction ids this NPC is aligned to
 *          world setting "indifference.factions"      — {id: {id, name, img, attitude, log}}
 * UI:      a standalone ApplicationV2 dashboard listing factions, scene NPCs + any tracked NPC,
 *          with an expandable per-row timeline of every change.
 */

const MODULE_ID = "indifference";
const FLAG = "attitude";
const LOG_FLAG = "log";
const MEMBER_FLAG = "factions";
const FACTIONS_SETTING = "factions";
const CHAT_STYLE_SETTING = "chatStyle";
const MAX_LOG = 100;

/** The PF2e attitude ladder, lowest to highest. */
const ATTITUDES = [
  { value: -2, key: "hostile",     label: "Hostile",     icon: "fa-face-angry",      color: "#b03a2e", blurb: "Actively seeks to harm you and won't accept Requests." },
  { value: -1, key: "unfriendly",  label: "Unfriendly",  icon: "fa-face-frown",      color: "#c87f0a", blurb: "Dislikes and distrusts you, and won't accept Requests." },
  { value:  0, key: "indifferent", label: "Indifferent", icon: "fa-face-meh",        color: "#7f8c8d", blurb: "Doesn't care about you one way or the other." },
  { value:  1, key: "friendly",    label: "Friendly",    icon: "fa-face-smile",      color: "#2e9e5b", blurb: "Likes you; likely to agree to simple, safe Requests." },
  { value:  2, key: "helpful",     label: "Helpful",     icon: "fa-face-laugh-beam", color: "#1f8a4c", blurb: "Wants to actively aid you and accepts reasonable Requests." }
];

const clamp = (n) => Math.max(-2, Math.min(2, Math.round(Number(n) || 0)));
const attitudeInfo = (value) => ATTITUDES.find((a) => a.value === clamp(value)) ?? ATTITUDES[2];
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");

/** The active party actor's name, or a generic fallback. */
const partyName = () => game.actors?.party?.name || game.i18n.localize("INDIFFERENCE.DefaultParty");

/** Append a change entry to a log array, capped at MAX_LOG (oldest dropped). */
const appendLog = (log, entry) => [...(Array.isArray(log) ? log : []), entry].slice(-MAX_LOG);

/* -------------------------------------------- */
/*  Factions (world-setting store)
/* -------------------------------------------- */

/** The raw faction store: {id: {id, name, img, attitude, log}}. */
const factionStore = () => game.settings.get(MODULE_ID, FACTIONS_SETTING) ?? {};

const getFaction = (id) => factionStore()[id] ?? null;

const allFactions = () =>
  Object.values(factionStore()).sort((a, b) => clamp(b.attitude) - clamp(a.attitude) || a.name.localeCompare(b.name));

async function saveFactions(store) {
  await game.settings.set(MODULE_ID, FACTIONS_SETTING, store);
}

async function createFaction(name, img = "") {
  const id = foundry.utils.randomID();
  const store = foundry.utils.deepClone(factionStore());
  store[id] = { id, name: String(name).trim(), img, attitude: 0, log: [] };
  await saveFactions(store);
  return store[id];
}

async function deleteFaction(id) {
  const store = foundry.utils.deepClone(factionStore());
  delete store[id];
  await saveFactions(store);
}

/** Faction ids an actor is aligned to, filtered to factions that still exist. */
const actorFactionIds = (actor) =>
  (actor?.getFlag(MODULE_ID, MEMBER_FLAG) ?? []).filter((id) => !!factionStore()[id]);

async function toggleMembership(actor, factionId) {
  if (!actor || !factionStore()[factionId]) return;
  const ids = new Set(actorFactionIds(actor));
  ids.has(factionId) ? ids.delete(factionId) : ids.add(factionId);
  await actor.setFlag(MODULE_ID, MEMBER_FLAG, [...ids]);
}

const factionMembers = (factionId) =>
  game.actors.filter((a) => a.type === "npc" && (a.getFlag(MODULE_ID, MEMBER_FLAG) ?? []).includes(factionId));

/* -------------------------------------------- */
/*  Attitude writes (always logged with a timestamp)
/* -------------------------------------------- */

/**
 * Set an actor's attitude and append a history entry in one update.
 * `note: true` records an entry even when the value didn't change (a "took note" beat).
 */
async function writeActorAttitude(actor, value, { reason = "", announced = false, note = false } = {}) {
  if (!actor) return;
  const previous = clamp(actor.getFlag(MODULE_ID, FLAG) ?? 0);
  const next = clamp(value);
  if (next === previous && !note) {
    Hooks.callAll(`${MODULE_ID}.attitudeChanged`, actor, next, previous);
    return next;
  }
  const log = appendLog(actor.getFlag(MODULE_ID, LOG_FLAG), { t: Date.now(), from: previous, to: next, reason, announced });
  await actor.update({ [`flags.${MODULE_ID}.${FLAG}`]: next, [`flags.${MODULE_ID}.${LOG_FLAG}`]: log });
  Hooks.callAll(`${MODULE_ID}.attitudeChanged`, actor, next, previous);
  return next;
}

async function writeFactionAttitude(id, value, { reason = "", announced = false, note = false } = {}) {
  const store = foundry.utils.deepClone(factionStore());
  const faction = store[id];
  if (!faction) return;
  const previous = clamp(faction.attitude);
  const next = clamp(value);
  if (next === previous && !note) return next;
  faction.attitude = next;
  faction.log = appendLog(faction.log, { t: Date.now(), from: previous, to: next, reason, announced });
  await saveFactions(store);
  return next;
}

/**
 * Uniform handle on an NPC or a faction, so the dialog/cards/rows don't branch.
 * @returns {null|{kind, id, name, img, value, log, write(value, opts)}}
 */
function resolveSubject(kind, id) {
  if (kind === "faction") {
    const f = getFaction(id);
    if (!f) return null;
    return {
      kind, id, name: f.name, img: f.img || null,
      value: clamp(f.attitude), log: f.log ?? [],
      write: (value, opts) => writeFactionAttitude(id, value, opts)
    };
  }
  const actor = game.actors.get(id);
  if (!actor) return null;
  return {
    kind: "npc", id, name: actor.name, img: actor.img,
    value: clamp(actor.getFlag(MODULE_ID, FLAG) ?? 0), log: actor.getFlag(MODULE_ID, LOG_FLAG) ?? [],
    write: (value, opts) => writeActorAttitude(actor, value, opts)
  };
}

/* -------------------------------------------- */
/*  Public API (game.modules.get("indifference").api and globalThis.indifference)
/* -------------------------------------------- */

const api = {
  ATTITUDES,
  /** Current attitude integer for an actor (0 if unset). */
  get(actor) {
    return clamp(actor?.getFlag(MODULE_ID, FLAG) ?? 0);
  },
  /** Descriptor {value,label,icon,color,key} for a value. */
  info(value) {
    return attitudeInfo(value);
  },
  /** Is this actor explicitly tracked (has a saved flag)? */
  isTracked(actor) {
    return actor?.getFlag(MODULE_ID, FLAG) !== undefined;
  },
  /** Change history for an actor: [{t, from, to, reason, announced}]. */
  history(actor) {
    return actor?.getFlag(MODULE_ID, LOG_FLAG) ?? [];
  },
  /** Set absolute attitude; persists, logs, and fires indifference.attitudeChanged. Posts no chat. */
  async set(actor, value, opts = {}) {
    return writeActorAttitude(actor, value, opts);
  },
  /** Adjust attitude by delta (clamped to −2..+2). Logged, no chat. */
  async step(actor, delta) {
    return writeActorAttitude(actor, api.get(actor) + Number(delta));
  },
  /** Remove all module flags (back to untracked; clears the history too). */
  async clear(actor) {
    if (!actor) return;
    const previous = api.get(actor);
    await actor.update({ [`flags.-=${MODULE_ID}`]: null });
    Hooks.callAll(`${MODULE_ID}.attitudeChanged`, actor, 0, previous);
  },
  /** Faction management. */
  factions: {
    all: allFactions,
    get: getFaction,
    create: createFaction,
    delete: deleteFaction,
    members: factionMembers,
    /** Set a faction's attitude (logged; no chat). */
    set: (id, value, opts = {}) => writeFactionAttitude(id, value, opts),
    /** Toggle an NPC's alignment to a faction. */
    align: toggleMembership
  },
  /** Open the tracker dashboard. */
  open() {
    return AttitudeTracker.show();
  },
  /** Create (if needed) the "open tracker" macro and drop it on the user's hotbar. */
  async addHotbarButton() {
    let macro = game.macros.find((m) => m.getFlag(MODULE_ID, "openTracker"));
    macro ??= await Macro.create({
      name: game.i18n.localize("INDIFFERENCE.TrackerTitle"),
      type: "script",
      img: "icons/svg/cowled.svg",
      command: `game.modules.get("${MODULE_ID}").api.open();`,
      flags: { [MODULE_ID]: { openTracker: true } }
    });
    if (Object.values(game.user.hotbar ?? {}).includes(macro.id)) {
      ui.notifications.info(game.i18n.localize("INDIFFERENCE.Hotbar.Already"));
      return macro;
    }
    let slot = null;
    for (let i = 1; i <= 50; i++) if (!game.user.hotbar[i]) { slot = i; break; }
    await game.user.assignHotbarMacro(macro, slot ?? 1);
    ui.notifications.info(game.i18n.localize("INDIFFERENCE.Hotbar.Added"));
    return macro;
  }
};

/* -------------------------------------------- */
/*  Chat cards
/* -------------------------------------------- */

/** Reaction line key for a change (Fallout-style). */
function reactionKey(to, from) {
  const delta = to - from;
  if (delta >= 2) return "Loved";
  if (delta === 1) return "Liked";
  if (delta === -1) return "Disliked";
  if (delta <= -2) return "Hated";
  return "Noted";
}

/**
 * The default, low-meta announcement: "Abstalar liked that!" — no ladder, no numbers.
 * The GM's reason (if any) rides along as flavor.
 */
async function postReactionCard(subject, to, from, reason) {
  const key = reactionKey(to, from);
  const dir = to > from ? "up" : to < from ? "down" : "same";
  const statement = game.i18n.format(`INDIFFERENCE.React.${key}`, {
    name: `<span class="name">${esc(subject.name)}</span>`
  });
  const portrait = subject.img
    ? `<img class="portrait" src="${esc(subject.img)}" alt="">`
    : `<span class="portrait flag"><i class="fa-solid fa-flag"></i></span>`;
  const reasonHtml = reason ? `<div class="reason"><i class="fa-solid fa-quote-left"></i> ${esc(reason)}</div>` : "";

  const content = `<div class="indifference-reaction dir-${dir}">
    <div class="head">
      ${portrait}
      <div class="statement">${statement}</div>
    </div>
    ${reasonHtml}
  </div>`;

  return ChatMessage.create({
    content,
    speaker: { alias: game.i18n.localize("INDIFFERENCE.Card.Speaker") }
  });
}

/**
 * The detailed "disposition" card (optional, via the chat-style setting). Leads with a natural
 * sentence — "X is now Y towards the party" — with the attitude meaning, a ladder gauge, and the reason.
 */
async function postSystemCard(subject, to, from, reason) {
  const info = attitudeInfo(to);
  const changed = to !== from;
  const dir = to > from ? "up" : to < from ? "down" : "same";

  const nameHtml = `<span class="name">${esc(subject.name)}</span>`;
  const attitudeHtml = `<strong class="att"><i class="fa-solid ${info.icon}"></i> ${info.label}</strong>`;
  const statement = game.i18n.format(
    changed ? "INDIFFERENCE.Card.StatementChanged" : "INDIFFERENCE.Card.StatementNote",
    { name: nameHtml, attitude: attitudeHtml, party: esc(partyName()) }
  );

  // Ladder gauge, −2 … +2 left to right (matches the dashboard pips), marking the new + old spots.
  const gauge = ATTITUDES.map((a) => {
    const cls = ["pip"];
    if (a.value === to) cls.push("to");
    else if (changed && a.value === from) cls.push("from");
    return `<span class="${cls.join(" ")}" style="--c:${a.color}" title="${a.label} (${signed(a.value)})"></span>`;
  }).join("");

  const arrow = dir === "up" ? "fa-arrow-trend-up" : "fa-arrow-trend-down";
  const delta = changed
    ? `<span class="delta ${dir}"><i class="fa-solid ${arrow}"></i> ${attitudeInfo(from).label} <i class="fa-solid fa-arrow-right-long"></i> ${info.label}</span>`
    : `<span class="delta same">${signed(to)}</span>`;

  const portrait = subject.img ? `<img class="portrait" src="${esc(subject.img)}" alt="">` : "";
  const eyebrow = game.i18n.localize(changed ? "INDIFFERENCE.Card.ChangeTitle" : "INDIFFERENCE.Card.NoteTitle");
  const reasonHtml = reason ? `<div class="reason"><i class="fa-solid fa-quote-left"></i> ${esc(reason)}</div>` : "";

  const content = `<div class="indifference-syscard dir-${dir}" style="--att:${info.color}">
    <div class="eyebrow"><i class="fa-solid fa-scale-balanced"></i> ${eyebrow}</div>
    <div class="head">
      ${portrait}
      <div class="headline">
        <div class="statement">${statement}</div>
        <div class="meaning">${info.blurb}</div>
      </div>
    </div>
    <div class="gauge">
      <div class="track">${gauge}</div>
      ${delta}
    </div>
    ${reasonHtml}
  </div>`;

  return ChatMessage.create({
    content,
    speaker: { alias: game.i18n.localize("INDIFFERENCE.Card.Speaker") }
  });
}

/** Post the configured card style for a change. */
async function announceChange(subject, to, from, reason) {
  const style = game.settings.get(MODULE_ID, CHAT_STYLE_SETTING);
  return style === "detailed"
    ? postSystemCard(subject, to, from, reason)
    : postReactionCard(subject, to, from, reason);
}

/* -------------------------------------------- */
/*  Set-disposition dialog
/* -------------------------------------------- */

/**
 * The disposition-update dialog — opened from a dashboard row, the token HUD, or a sheet badge.
 * The GM picks how the NPC/faction feels toward the party and (optionally) writes why, then either
 * announces it to chat or saves it quietly. Both paths land in the timeline; only Announce posts.
 */
async function promptSayWhy(kind, id) {
  const subject = resolveSubject(kind, id);
  if (!subject) return;
  const current = subject.value;
  const party = esc(partyName());

  const choices = [...ATTITUDES].reverse().map((a) => `
    <label class="ind-choice ${a.value === current ? "current" : ""}" style="--c:${a.color}">
      <input type="radio" name="attitude" value="${a.value}" ${a.value === current ? "checked" : ""}>
      <i class="fa-solid ${a.icon}"></i>
      <span class="lbl">${a.label} <em>(${signed(a.value)})</em></span>
      <span class="desc">${a.blurb}</span>
    </label>`).join("");

  const content = `<div class="indifference-saywhy">
    <p class="intro">${game.i18n.format("INDIFFERENCE.SayWhy.Intro", {
      name: `<strong>${esc(subject.name)}</strong>`, party
    })}</p>

    <div class="field-label">${game.i18n.format("INDIFFERENCE.SayWhy.AttitudeLabel", { party })}</div>
    <div class="choices">${choices}</div>

    <label class="reason-field">
      <span class="field-label">${game.i18n.localize("INDIFFERENCE.SayWhy.ReasonLabel")}</span>
      <textarea name="reason" rows="3" placeholder="${esc(game.i18n.format("INDIFFERENCE.SayWhy.Placeholder", { name: subject.name }))}"></textarea>
    </label>
  </div>`;

  const read = (announce) => (event, button) => ({
    value: Number(button.form.elements.attitude.value),
    reason: button.form.elements.reason.value.trim(),
    announce
  });

  const DialogV2 = foundry.applications.api.DialogV2;
  const result = await DialogV2.wait({
    window: { title: game.i18n.format("INDIFFERENCE.SayWhy.Title", { name: subject.name }), icon: "fa-solid fa-scale-balanced" },
    classes: ["indifference"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "announce",
        label: "INDIFFERENCE.SayWhy.Post",
        icon: "fa-solid fa-bullhorn",
        default: true,
        callback: read(true)
      },
      {
        action: "quiet",
        label: "INDIFFERENCE.SayWhy.Quiet",
        icon: "fa-solid fa-eye-slash",
        callback: read(false)
      }
    ],
    rejectClose: false
  });

  if (!result || typeof result === "string") return; // dismissed
  const from = subject.value;
  const to = clamp(result.value);
  // Log even an unchanged value when there's a reason or an announcement — it's a story beat.
  await subject.write(to, { reason: result.reason, announced: result.announce, note: !!result.reason || result.announce });
  if (result.announce) await announceChange(subject, to, from, result.reason);
  AttitudeTracker.refresh();
}

/* -------------------------------------------- */
/*  Tracker application (ApplicationV2)
/* -------------------------------------------- */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class AttitudeTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  static _instance = null;

  /** Collapsed state of the off-scene "tracked" section (per-window; resets on reload). */
  _collapsed = false;

  /** Which view the toolbar menu selects: all | npcs | factions. */
  _view = "all";

  /** Faction id to filter NPC rows by ("" = no filter). */
  _factionFilter = "";

  /** Expanded timeline rows, as "kind:id" keys. */
  _expanded = new Set();

  static show() {
    AttitudeTracker._instance ??= new AttitudeTracker();
    AttitudeTracker._instance.render({ force: true });
    return AttitudeTracker._instance;
  }

  static refresh() {
    if (AttitudeTracker._instance?.rendered) AttitudeTracker._instance.render();
  }

  static DEFAULT_OPTIONS = {
    id: "indifference-tracker",
    classes: ["indifference", "attitude-tracker"],
    tag: "div",
    window: {
      title: "INDIFFERENCE.TrackerTitle",
      icon: "fa-solid fa-masks-theater",
      resizable: true
    },
    position: { width: 460, height: 640 },
    actions: {
      step: AttitudeTracker._onStep,
      setValue: AttitudeTracker._onSetValue,
      sayWhy: AttitudeTracker._onSayWhy,
      toggleCollapse: AttitudeTracker._onToggleCollapse,
      toggleExpand: AttitudeTracker._onToggleExpand,
      openActor: AttitudeTracker._onOpenActor,
      clear: AttitudeTracker._onClear,
      setView: AttitudeTracker._onSetView,
      addFaction: AttitudeTracker._onAddFaction,
      deleteFaction: AttitudeTracker._onDeleteFaction,
      toggleMember: AttitudeTracker._onToggleMember,
      pinHotbar: AttitudeTracker._onPinHotbar
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/tracker.hbs` }
  };

  /** Format one history entry for the timeline. */
  _entry(e) {
    const from = attitudeInfo(e.from);
    const to = attitudeInfo(e.to);
    const when = new Date(e.t);
    return {
      when: when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
      whenFull: when.toLocaleString(),
      fromIcon: from.icon, fromColor: from.color, fromLabel: from.label,
      toIcon: to.icon, toColor: to.color, toLabel: to.label,
      changed: e.from !== e.to,
      dir: e.to > e.from ? "up" : e.to < e.from ? "down" : "same",
      reason: e.reason ?? "",
      announced: !!e.announced
    };
  }

  /** Build one display row for an NPC or faction subject. */
  _row(subject, extra = {}) {
    const value = subject.value;
    const info = attitudeInfo(value);
    const key = `${subject.kind}:${subject.id}`;
    const expanded = this._expanded.has(key);
    const row = {
      kind: subject.kind,
      isNpc: subject.kind === "npc",
      id: subject.id,
      key,
      name: subject.name,
      img: subject.img,
      signed: signed(value),
      label: info.label,
      icon: info.icon,
      color: info.color,
      isMin: value <= -2,
      isMax: value >= 2,
      expanded,
      entries: expanded ? subject.log.map((e) => this._entry(e)).reverse() : [],
      ...extra
    };
    return row;
  }

  _npcRow(actor) {
    const subject = resolveSubject("npc", actor.id);
    const row = this._row(subject, { tracked: api.isTracked(actor) });
    row.scale = ATTITUDES.map((a) => ({ ...a, active: a.value === subject.value }));
    if (row.expanded) {
      const memberOf = new Set(actorFactionIds(actor));
      row.chips = allFactions().map((f) => ({ id: f.id, name: f.name, active: memberOf.has(f.id) }));
    }
    return row;
  }

  _factionRow(faction) {
    const subject = resolveSubject("faction", faction.id);
    const members = factionMembers(faction.id);
    const row = this._row(subject, { tracked: true, memberCount: members.length });
    row.scale = ATTITUDES.map((a) => ({ ...a, active: a.value === subject.value }));
    if (row.expanded) row.members = members.map((a) => ({ id: a.id, name: a.name }));
    return row;
  }

  /**
   * Three groups: factions, NPCs present on the active scene, then (collapsible) NPCs that have a
   * saved attitude but aren't on the scene. Scene NPCs resolve via token.baseActor (link-agnostic).
   * The toolbar view menu can narrow to NPCs or factions only; a faction filter narrows NPC rows
   * to that faction's members.
   */
  async _prepareContext() {
    const scene = game.scenes?.active ?? canvas?.scene;
    const sceneIds = new Set();
    if (scene) {
      for (const token of scene.tokens) {
        const base = token.baseActor;
        if (base && base.type === "npc") sceneIds.add(base.id);
      }
    }

    if (this._factionFilter && !factionStore()[this._factionFilter]) this._factionFilter = "";
    const memberFilter = (a) => !this._factionFilter || actorFactionIds(a).includes(this._factionFilter);

    // Highest attitude first (positives at top, negatives at bottom); alphabetical within a tier.
    const byAttitude = (a, b) => api.get(b) - api.get(a) || a.name.localeCompare(b.name);
    const sceneActors = [...sceneIds]
      .map((id) => game.actors.get(id))
      .filter(Boolean)
      .filter(memberFilter)
      .sort(byAttitude);
    const trackedActors = game.actors
      .filter((a) => a.type === "npc" && api.isTracked(a) && !sceneIds.has(a.id))
      .filter(memberFilter)
      .sort(byAttitude);

    const showNpcs = this._view !== "factions";
    const showFactions = this._view !== "npcs";

    const factionRows = showFactions ? allFactions().map((f) => this._factionRow(f)) : [];
    const sceneRows = showNpcs ? sceneActors.map((a) => this._npcRow(a)) : [];
    const trackedRows = showNpcs ? trackedActors.map((a) => this._npcRow(a)) : [];

    const factions = allFactions();
    return {
      factionRows,
      sceneRows,
      trackedRows,
      hasFactions: factionRows.length > 0,
      hasScene: sceneRows.length > 0,
      hasTracked: trackedRows.length > 0,
      trackedCount: trackedRows.length,
      factionCount: factionRows.length,
      collapsed: this._collapsed,
      empty: factionRows.length === 0 && sceneRows.length === 0 && trackedRows.length === 0,
      views: [["all", "INDIFFERENCE.View.All"], ["npcs", "INDIFFERENCE.View.Npcs"], ["factions", "INDIFFERENCE.View.Factions"]]
        .map(([id, key]) => ({ id, active: this._view === id, label: game.i18n.localize(key) })),
      anyFactionsExist: factions.length > 0,
      factionOptions: [...factions]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({ id: f.id, name: f.name, selected: f.id === this._factionFilter }))
    };
  }

  /** Portrait drag-to-canvas, plus the faction-filter <select> (actions only cover clicks). */
  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const img of this.element.querySelectorAll(".portrait[data-actor-id]")) {
      img.addEventListener("dragstart", (event) => {
        const actor = game.actors.get(img.dataset.actorId);
        if (actor) event.dataTransfer.setData("text/plain", JSON.stringify(actor.toDragData()));
      });
    }
    this.element.querySelector(".faction-filter")?.addEventListener("change", (event) => {
      this._factionFilter = event.currentTarget.value;
      this.render();
    });
  }

  /** The row's subject, from the [data-kind]/[data-id] on the enclosing <li>. */
  static _subjectFor(target) {
    const row = target.closest("[data-kind][data-id]");
    return row ? resolveSubject(row.dataset.kind, row.dataset.id) : null;
  }

  static async _onStep(event, target) {
    const subject = AttitudeTracker._subjectFor(target);
    if (subject) await subject.write(subject.value + Number(target.dataset.delta));
    AttitudeTracker.refresh();
  }

  static async _onSetValue(event, target) {
    const subject = AttitudeTracker._subjectFor(target);
    if (subject) await subject.write(Number(target.dataset.value));
    AttitudeTracker.refresh();
  }

  static async _onSayWhy(event, target) {
    const subject = AttitudeTracker._subjectFor(target);
    if (subject) await promptSayWhy(subject.kind, subject.id);
  }

  static _onToggleCollapse() {
    this._collapsed = !this._collapsed; // `this` is the application instance
    this.render();
  }

  static _onToggleExpand(event, target) {
    const row = target.closest("[data-kind][data-id]");
    if (!row) return;
    const key = `${row.dataset.kind}:${row.dataset.id}`;
    this._expanded.has(key) ? this._expanded.delete(key) : this._expanded.add(key);
    this.render();
  }

  static async _onClear(event, target) {
    await api.clear(game.actors.get(target.closest("[data-id]")?.dataset.id));
    AttitudeTracker.refresh();
  }

  static _onOpenActor(event, target) {
    game.actors.get(target.dataset.actorId)?.sheet?.render(true);
  }

  static _onSetView(event, target) {
    this._view = target.dataset.view;
    this.render();
  }

  static async _onAddFaction() {
    const DialogV2 = foundry.applications.api.DialogV2;
    const name = await DialogV2.prompt({
      window: { title: game.i18n.localize("INDIFFERENCE.Faction.New"), icon: "fa-solid fa-flag" },
      classes: ["indifference"],
      content: `<input type="text" name="name" placeholder="${esc(game.i18n.localize("INDIFFERENCE.Faction.NamePlaceholder"))}" autofocus>`,
      ok: {
        label: "INDIFFERENCE.Faction.Create",
        icon: "fa-solid fa-flag",
        callback: (event, button) => button.form.elements.name.value.trim()
      },
      rejectClose: false
    });
    if (!name) return;
    await createFaction(name);
    AttitudeTracker.refresh();
  }

  static async _onDeleteFaction(event, target) {
    const id = target.closest("[data-id]")?.dataset.id;
    const faction = getFaction(id);
    if (!faction) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("INDIFFERENCE.Faction.Delete") },
      content: `<p>${game.i18n.format("INDIFFERENCE.Faction.DeleteConfirm", { name: esc(faction.name) })}</p>`,
      rejectClose: false
    });
    if (!confirmed) return;
    await deleteFaction(id);
    AttitudeTracker.refresh();
  }

  static async _onToggleMember(event, target) {
    const actorId = target.closest("[data-kind='npc'][data-id]")?.dataset.id;
    await toggleMembership(game.actors.get(actorId), target.dataset.factionId);
    AttitudeTracker.refresh();
  }

  static async _onPinHotbar() {
    await api.addHotbarButton();
  }
}

/* -------------------------------------------- */
/*  NPC sheet badge (bottom-left): view + update NPC and faction attitudes
/* -------------------------------------------- */

/** Inject (or rebuild) the attitude badge on an NPC sheet window. Idempotent. */
function buildSheetBadge(app) {
  const actor = app.actor ?? app.document;
  if (!game.user?.isGM || !actor || actor.type !== "npc") return;
  const root = app.element instanceof HTMLElement ? app.element : app.element?.[0];
  if (!root) return;
  root.querySelector(".indifference-sheet-badge")?.remove();

  const value = api.get(actor);
  const info = attitudeInfo(value);
  const factions = actorFactionIds(actor).map(getFaction).filter(Boolean);

  const badge = document.createElement("div");
  badge.className = "indifference-sheet-badge";

  const npcTip = game.i18n.format("INDIFFERENCE.Badge.NpcTip", {
    name: actor.name, attitude: `${info.label} (${signed(value)})`
  });
  const buttons = [
    `<button type="button" class="who" data-kind="npc" data-id="${actor.id}" style="--c:${info.color}"
             data-tooltip="${esc(npcTip)}">
       <i class="fa-solid ${info.icon}"></i>
     </button>`
  ];
  for (const f of factions) {
    const fInfo = attitudeInfo(f.attitude);
    const tip = game.i18n.format("INDIFFERENCE.Badge.FactionTip", {
      name: f.name, attitude: `${fInfo.label} (${signed(clamp(f.attitude))})`
    });
    buttons.push(
      `<button type="button" class="who faction" data-kind="faction" data-id="${f.id}" style="--c:${fInfo.color}"
               data-tooltip="${esc(tip)}">
         <i class="fa-solid ${fInfo.icon}"></i><i class="fa-solid fa-flag tag"></i>
       </button>`
    );
  }
  badge.innerHTML = buttons.join("");

  for (const btn of badge.querySelectorAll("button.who")) {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      promptSayWhy(btn.dataset.kind, btn.dataset.id);
    });
  }
  root.appendChild(badge);
}

/** Rebuild badges on every open NPC sheet (AppV1 windows and AppV2 instances). */
function refreshSheetBadges() {
  for (const app of Object.values(ui.windows ?? {})) buildSheetBadge(app);
  for (const app of foundry.applications?.instances?.values?.() ?? []) {
    if (app.actor ?? app.document) buildSheetBadge(app);
  }
}

/* -------------------------------------------- */
/*  Wiring
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, FACTIONS_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      AttitudeTracker.refresh();
      refreshSheetBadges();
    }
  });

  game.settings.register(MODULE_ID, CHAT_STYLE_SETTING, {
    name: "INDIFFERENCE.Settings.ChatStyle.Name",
    hint: "INDIFFERENCE.Settings.ChatStyle.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      fallout: "INDIFFERENCE.Settings.ChatStyle.Fallout",
      detailed: "INDIFFERENCE.Settings.ChatStyle.Detailed"
    },
    default: "fallout"
  });

  // No default chord — Ctrl+Shift+A etc. are grabbed by the browser. The GM can bind a key
  // in Configure Controls if they want one; the Token-controls button is the primary entry.
  game.keybindings.register(MODULE_ID, "openTracker", {
    name: "INDIFFERENCE.Keybind.Open",
    editable: [],
    restricted: true,
    onDown: () => {
      if (game.user.isGM) api.open();
      return true;
    }
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = api;
  globalThis.indifference = api;
  // Window Controls Next only manages document sheets unless standalone AppV2 windows opt in.
  game.modules.get("window-controls-next")?.api?.registerApp?.(AttitudeTracker);
  console.log(`${MODULE_ID} | ready — game.modules.get("${MODULE_ID}").api`);
});

// In case Window Controls Next fires its ready hook after ours.
Hooks.once("window-controls-next.ready", () => {
  game.modules.get("window-controls-next")?.api?.registerApp?.(AttitudeTracker);
});

// Scene-control button (GM only). Defensive across v13/v14 control shapes.
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;

  const tool = {
    name: MODULE_ID,
    order: 99,
    title: game.i18n.localize("INDIFFERENCE.OpenTracker"),
    icon: "fa-solid fa-masks-theater",
    button: true,
    visible: true,
    // v14 fires onChange for button tools (verified against core source).
    onChange: () => api.open()
  };

  const tokenGroup = Array.isArray(controls)
    ? controls.find((c) => c.name === "tokens" || c.name === "token")
    : (controls.tokens ?? controls.token);
  if (!tokenGroup) return;

  tokenGroup.tools ??= Array.isArray(tokenGroup.tools) ? [] : {};
  if (Array.isArray(tokenGroup.tools)) tokenGroup.tools.push(tool);
  else tokenGroup.tools[MODULE_ID] = tool;
});

// Token-HUD quick-step (GM only). Collapsed to just the attitude face; click it to unfold the
// up/down/say-why controls so the HUD stays small.
Hooks.on("renderTokenHUD", (hud, html) => {
  if (!game.user?.isGM) return;
  // Operate on the canonical directory actor (shared model), not an unlinked token's synthetic copy.
  const actor = hud.object?.document?.baseActor;
  if (!actor || actor.type !== "npc") return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const column = root.querySelector(".col.right") ?? root.querySelector(".col.left") ?? root;
  if (!column || column.querySelector(".indifference-hud")) return;

  const control = document.createElement("div");
  control.className = "indifference-hud";
  control.innerHTML = `
    <button type="button" class="ind-face" title="">
      <i class="fa-solid"></i>
    </button>
    <div class="ind-controls">
      <button type="button" class="ind-up" title="${game.i18n.localize("INDIFFERENCE.Raise")}">
        <i class="fa-solid fa-chevron-up"></i>
      </button>
      <button type="button" class="ind-down" title="${game.i18n.localize("INDIFFERENCE.Lower")}">
        <i class="fa-solid fa-chevron-down"></i>
      </button>
      <button type="button" class="ind-saywhy" title="${game.i18n.localize("INDIFFERENCE.SayWhy.Button")}">
        <i class="fa-solid fa-comment-dots"></i>
      </button>
    </div>`;

  const faceBtn = control.querySelector(".ind-face");
  const faceIcon = faceBtn.querySelector("i");
  const sync = () => {
    const value = api.get(actor);
    const info = attitudeInfo(value);
    control.style.setProperty("--att-color", info.color);
    faceIcon.className = `fa-solid ${info.icon}`;
    faceBtn.title = `${info.label} (${signed(value)})`;
  };
  sync();

  faceBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    control.classList.toggle("expanded");
  });
  const bump = (delta) => async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await api.step(actor, delta);
    sync();
  };
  control.querySelector(".ind-up").addEventListener("click", bump(1));
  control.querySelector(".ind-down").addEventListener("click", bump(-1));
  control.querySelector(".ind-saywhy").addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await promptSayWhy("npc", actor.id);
    sync();
  });
  column.appendChild(control);
});

// Attitude badge on NPC sheets (PF2e NPC sheets are AppV1 today; the V2 hook covers the future).
Hooks.on("renderActorSheet", (app) => buildSheetBadge(app));
Hooks.on("renderActorSheetV2", (app) => buildSheetBadge(app));

// Keep the dashboard live when attitudes change (this client or another GM).
Hooks.on("updateActor", () => AttitudeTracker.refresh());
Hooks.on("createToken", () => AttitudeTracker.refresh());
Hooks.on("deleteToken", () => AttitudeTracker.refresh());
