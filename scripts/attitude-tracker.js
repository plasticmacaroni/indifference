/**
 * Indifference — PF2e Attitude Tracker
 * Tracks a party-wide attitude per NPC on the PF2e ladder (−2 Hostile … +2 Helpful).
 *
 * Storage: a single integer flag on the base Actor — actor.getFlag("indifference", "attitude").
 *          Unset is treated as 0 (Indifferent / untracked).
 * UI:      a standalone ApplicationV2 dashboard listing scene NPCs + any tracked NPC.
 */

const MODULE_ID = "indifference";
const FLAG = "attitude";

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
  /** Set absolute attitude; persists and fires the indifference.attitudeChanged hook. Posts no chat. */
  async set(actor, value) {
    if (!actor) return;
    const previous = api.get(actor);
    const next = clamp(value);
    if (next !== previous) await actor.setFlag(MODULE_ID, FLAG, next);
    Hooks.callAll(`${MODULE_ID}.attitudeChanged`, actor, next, previous);
    return next;
  },
  /** Adjust attitude by delta (clamped to −2..+2). Posts no chat. */
  async step(actor, delta) {
    return api.set(actor, api.get(actor) + Number(delta));
  },
  /** Remove the flag entirely (back to untracked). Posts no chat. */
  async clear(actor) {
    const previous = api.get(actor);
    await actor?.unsetFlag(MODULE_ID, FLAG);
    Hooks.callAll(`${MODULE_ID}.attitudeChanged`, actor, 0, previous);
  },
  /** Open the tracker dashboard. */
  open() {
    return AttitudeTracker.show();
  }
};

const esc = (s) => foundry.utils.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");

/** The active party actor's name, or a generic fallback. */
const partyName = () => game.actors?.party?.name || game.i18n.localize("INDIFFERENCE.DefaultParty");

/**
 * Post the official "disposition" card to chat (public). Leads with a natural sentence —
 * "X is now Y towards the party" — with the attitude meaning, a ladder gauge, and the GM's reason.
 */
async function postSystemCard(actor, to, from, reason) {
  const info = attitudeInfo(to);
  const changed = to !== from;
  const dir = to > from ? "up" : to < from ? "down" : "same";

  const nameHtml = `<span class="name">${esc(actor.name)}</span>`;
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

  const portrait = actor.img ? `<img class="portrait" src="${esc(actor.img)}" alt="">` : "";
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

/**
 * The disposition-update dialog — opened from a dashboard row or the token HUD. Self-explanatory:
 * the GM picks how the NPC feels toward the party and (optionally) writes why, then posts an official
 * notice to chat for all players. Applies the value change if it differs. Nothing posts until Post.
 */
async function promptSayWhy(actor) {
  if (!actor) return;
  const current = api.get(actor);
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
      name: `<strong>${esc(actor.name)}</strong>`, party
    })}</p>

    <div class="field-label">${game.i18n.format("INDIFFERENCE.SayWhy.AttitudeLabel", { party })}</div>
    <div class="choices">${choices}</div>

    <label class="reason-field">
      <span class="field-label">${game.i18n.localize("INDIFFERENCE.SayWhy.ReasonLabel")}</span>
      <textarea name="reason" rows="3" placeholder="${esc(game.i18n.format("INDIFFERENCE.SayWhy.Placeholder", { name: actor.name }))}"></textarea>
    </label>
  </div>`;

  const DialogV2 = foundry.applications.api.DialogV2;
  const result = await DialogV2.prompt({
    window: { title: game.i18n.format("INDIFFERENCE.SayWhy.Title", { name: actor.name }), icon: "fa-solid fa-scale-balanced" },
    classes: ["indifference"],
    position: { width: 420 },
    content,
    ok: {
      label: "INDIFFERENCE.SayWhy.Post",
      icon: "fa-solid fa-comment-dots",
      callback: (event, button) => ({
        value: Number(button.form.elements.attitude.value),
        reason: button.form.elements.reason.value.trim()
      })
    },
    rejectClose: false
  });

  if (!result) return; // dismissed
  const from = api.get(actor);
  const to = clamp(result.value);
  if (to !== from) await api.set(actor, to);
  await postSystemCard(actor, to, from, result.reason);
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
    position: { width: 440, height: 600 },
    actions: {
      step: AttitudeTracker._onStep,
      setValue: AttitudeTracker._onSetValue,
      sayWhy: AttitudeTracker._onSayWhy,
      toggleCollapse: AttitudeTracker._onToggleCollapse,
      openActor: AttitudeTracker._onOpenActor,
      clear: AttitudeTracker._onClear
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/tracker.hbs` }
  };

  /** Build one display row for an actor. */
  _row(actor) {
    const value = api.get(actor);
    const info = attitudeInfo(value);
    return {
      id: actor.id,
      name: actor.name,
      img: actor.img,
      signed: signed(value),
      label: info.label,
      icon: info.icon,
      color: info.color,
      isMin: value <= -2,
      isMax: value >= 2,
      tracked: api.isTracked(actor),
      scale: ATTITUDES.map((a) => ({ ...a, active: a.value === value }))
    };
  }

  /**
   * Two alphabetical groups: NPCs present on the active scene, then (collapsible) NPCs that have a
   * saved attitude but aren't on the scene. Scene NPCs resolve via token.baseActor (link-agnostic).
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

    // Highest attitude first (positives at top, negatives at bottom); alphabetical within a tier.
    const byAttitude = (a, b) => api.get(b) - api.get(a) || a.name.localeCompare(b.name);
    const sceneActors = [...sceneIds]
      .map((id) => game.actors.get(id))
      .filter(Boolean)
      .sort(byAttitude);
    const trackedActors = game.actors
      .filter((a) => a.type === "npc" && api.isTracked(a) && !sceneIds.has(a.id))
      .sort(byAttitude);

    const sceneRows = sceneActors.map((a) => this._row(a));
    const trackedRows = trackedActors.map((a) => this._row(a));

    return {
      sceneRows,
      trackedRows,
      hasScene: sceneRows.length > 0,
      hasTracked: trackedRows.length > 0,
      trackedCount: trackedRows.length,
      collapsed: this._collapsed,
      empty: sceneRows.length === 0 && trackedRows.length === 0
    };
  }

  /** Make portraits draggable onto the canvas to place a token (same as the Actors sidebar). */
  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const img of this.element.querySelectorAll(".portrait[data-actor-id]")) {
      img.addEventListener("dragstart", (event) => {
        const actor = game.actors.get(img.dataset.actorId);
        if (actor) event.dataTransfer.setData("text/plain", JSON.stringify(actor.toDragData()));
      });
    }
  }

  static async _onStep(event, target) {
    await api.step(game.actors.get(target.dataset.actorId), Number(target.dataset.delta));
    AttitudeTracker.refresh();
  }

  static async _onSetValue(event, target) {
    await api.set(game.actors.get(target.dataset.actorId), Number(target.dataset.value));
    AttitudeTracker.refresh();
  }

  static async _onSayWhy(event, target) {
    await promptSayWhy(game.actors.get(target.dataset.actorId));
  }

  static _onToggleCollapse() {
    this._collapsed = !this._collapsed; // `this` is the application instance
    this.render();
  }

  static async _onClear(event, target) {
    await api.clear(game.actors.get(target.dataset.actorId));
    AttitudeTracker.refresh();
  }

  static _onOpenActor(event, target) {
    game.actors.get(target.dataset.actorId)?.sheet?.render(true);
  }
}

/* -------------------------------------------- */
/*  Wiring
/* -------------------------------------------- */

Hooks.once("init", () => {
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
  console.log(`${MODULE_ID} | ready — game.modules.get("${MODULE_ID}").api`);
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

// Token-HUD quick-step (GM only). Lets you nudge attitude straight from the canvas.
Hooks.on("renderTokenHUD", (hud, html) => {
  if (!game.user?.isGM) return;
  // Operate on the canonical directory actor (shared model), not an unlinked token's synthetic copy.
  const actor = hud.object?.document?.baseActor;
  if (!actor || actor.type !== "npc") return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const column = root.querySelector(".col.right") ?? root.querySelector(".col.left") ?? root;
  if (!column || column.querySelector(".indifference-hud")) return;

  const value = api.get(actor);
  const info = attitudeInfo(value);

  const control = document.createElement("div");
  control.className = "indifference-hud";
  control.dataset.tooltip = `${info.label} (${signed(value)})`;
  control.style.setProperty("--att-color", info.color);
  control.innerHTML = `
    <button type="button" class="ind-up" title="${game.i18n.localize("INDIFFERENCE.Raise")}">
      <i class="fa-solid fa-chevron-up"></i>
    </button>
    <i class="fa-solid ${info.icon} ind-face"></i>
    <button type="button" class="ind-down" title="${game.i18n.localize("INDIFFERENCE.Lower")}">
      <i class="fa-solid fa-chevron-down"></i>
    </button>
    <button type="button" class="ind-saywhy" title="${game.i18n.localize("INDIFFERENCE.SayWhy.Button")}">
      <i class="fa-solid fa-comment-dots"></i>
    </button>`;

  const bump = (delta) => async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await api.step(actor, delta);
    hud.render();
  };
  control.querySelector(".ind-up").addEventListener("click", bump(1));
  control.querySelector(".ind-down").addEventListener("click", bump(-1));
  control.querySelector(".ind-saywhy").addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await promptSayWhy(actor);
    hud.render();
  });
  column.appendChild(control);
});

// Keep the dashboard live when attitudes change (this client or another GM).
Hooks.on("updateActor", () => AttitudeTracker.refresh());
Hooks.on("createToken", () => AttitudeTracker.refresh());
Hooks.on("deleteToken", () => AttitudeTracker.refresh());
