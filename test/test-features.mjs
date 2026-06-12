import puppeteer from "puppeteer";

const BASE = process.env.FVTT_URL ?? "http://localhost:30000";
const WORLD = process.env.FVTT_WORLD ?? "test";
const browser = await puppeteer.launch({
  headless: "new",
  protocolTimeout: 20000,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  defaultViewport: { width: 1600, height: 1000 }
});
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));

await page.goto(BASE + "/join", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("select[name=userid]", { timeout: 30000 });
await page.evaluate(async () => {
  const sel = document.querySelector("select[name=userid]");
  const opt = [...sel.options].find((o) => /game\s*master/i.test(o.textContent));
  await fetch("/join", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "join", userid: opt.value, password: "" }) });
});
await page.goto(BASE + "/game", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.game?.ready === true, { timeout: 120000, polling: 500 });
const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

await page.click("[data-tool='indifference']");
await settle(1800);

// 1. Step an NPC's attitude (logs an entry), then expand its timeline
const stepped = await page.evaluate(async () => {
  const row = document.querySelector("#indifference-tracker .indifference-row.npc");
  row.querySelector("[data-action='step'][data-delta='1']").click();
  return row.dataset.id;
});
await settle();
await page.evaluate(() => {
  document.querySelector("#indifference-tracker .indifference-row.npc .info").click();
});
await settle();
const timeline = await page.evaluate(() => {
  const row = document.querySelector("#indifference-tracker .indifference-row.npc.is-expanded");
  const entries = row ? [...row.querySelectorAll(".timeline .entry:not(.none)")] : [];
  return {
    expanded: !!row,
    entries: entries.length,
    firstEntryText: entries[0]?.querySelector(".when")?.textContent ?? null,
    hasDeleteBtn: !!entries[0]?.querySelector(".entry-delete"),
    hasEditFactionsBtn: !!row?.querySelector("[data-action='editFactions']")
  };
});
console.log("1. step + timeline:", JSON.stringify(timeline));

// 2. Say-why dialog opens with Announce + Save quietly buttons
await page.evaluate(() => {
  document.querySelector("#indifference-tracker .indifference-row.npc [data-action='sayWhy']").click();
});
await settle();
const dialog = await page.evaluate(() => {
  const dlg = document.querySelector(".indifference-saywhy")?.closest("dialog, .application");
  return {
    open: !!dlg,
    choices: dlg ? dlg.querySelectorAll(".ind-choice").length : 0,
    buttons: dlg ? [...dlg.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean) : []
  };
});
console.log("2. say-why dialog:", JSON.stringify(dialog));
await page.keyboard.press("Escape");
await settle(600);

// 3. Create a faction via the API path the dialog uses, confirm row + rep input render
const faction = await page.evaluate(async () => {
  const f = await game.modules.get("indifference").api.factions.create("Test Blades", { color: "#aa2222", icon: "fa-dragon" });
  await new Promise((r) => setTimeout(r, 800));
  const row = document.querySelector(`#indifference-tracker .indifference-row.faction[data-id='${f.id}']`);
  return {
    created: !!f.id,
    rowRendered: !!row,
    repInput: !!row?.querySelector(".rep-input"),
    icon: !!row?.querySelector(".portrait.flag .fa-dragon"),
    label: row?.querySelector(".attitude")?.textContent.replace(/\s+/g, " ").trim().slice(0, 40)
  };
});
console.log("3. faction:", JSON.stringify(faction));

// 4. Set faction reputation via input, check tier updates + log entry with world-clock fallback time
const rep = await page.evaluate(async () => {
  const row = document.querySelector("#indifference-tracker .indifference-row.faction");
  const input = row.querySelector(".rep-input");
  input.value = "16";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  const row2 = document.querySelector("#indifference-tracker .indifference-row.faction");
  row2.querySelector(".info").click();
  await new Promise((r) => setTimeout(r, 900));
  const row3 = document.querySelector("#indifference-tracker .indifference-row.faction.is-expanded");
  const entry = row3?.querySelector(".timeline .entry:not(.none)");
  return {
    tier: row3?.querySelector(".attitude")?.textContent.replace(/\s+/g, " ").trim().slice(0, 30),
    logEntry: entry?.textContent.replace(/\s+/g, " ").trim().slice(0, 80) ?? null
  };
});
console.log("4. reputation set:", JSON.stringify(rep));

// 5. Clean up the test faction
await page.evaluate(async () => {
  const f = game.modules.get("indifference").api.factions.all().find((x) => x.name === "Test Blades");
  if (f) await game.modules.get("indifference").api.factions.delete(f.id);
});
await page.screenshot({ path: "features.png" });
console.log("page errors:", errs.length ? errs.filter((e) => !e.includes("ReleaseData")) : "none");
await browser.close();
console.log("DONE");
