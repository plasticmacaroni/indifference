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
const pageErrors = [];
page.on("pageerror", (e) => { pageErrors.push(e.message.split("\n")[0]); });
page.on("console", (m) => { if (m.type() === "error") console.log("[console-error]", m.text().slice(0, 250)); });

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
if (page.url().includes("/setup")) {
  const res = await page.evaluate(async () => {
    const r = await fetch("/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "launchWorld", world: WORLD })
    });
    return r.status;
  });
  console.log("launched world test:", res);
  await new Promise((r) => setTimeout(r, 3000));
}
await page.goto(BASE + "/join", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("select[name=userid]", { timeout: 30000 });
await page.evaluate(async () => {
  const sel = document.querySelector("select[name=userid]");
  const opt = [...sel.options].find((o) => /game\s*master/i.test(o.textContent));
  await fetch("/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "join", userid: opt.value, password: "" })
  });
});
await page.goto(BASE + "/game", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.game?.ready === true, { timeout: 120000, polling: 500 });
console.log("game ready, module version:", await page.evaluate(() => game.modules.get("indifference")?.version));

const trackerState = () => page.evaluate(() => {
  const el = document.getElementById("indifference-tracker");
  return {
    inDom: !!el,
    visible: el ? !!el.offsetParent : false,
    rows: el ? el.querySelectorAll(".indifference-row").length : 0,
    toolbar: el ? !!el.querySelector(".indifference-toolbar") : false
  };
});
const press = () => page.click("[data-tool='indifference']");
const settle = (ms = 1800) => new Promise((r) => setTimeout(r, ms));

// 1. First press
await press(); await settle();
console.log("1. first press:", JSON.stringify(await trackerState()));

// 2. Second press while open
await press(); await settle(800);
console.log("2. second press:", JSON.stringify(await trackerState()));

// 3. Close via header X, then press again
await page.evaluate(() => document.querySelector("#indifference-tracker .window-header [data-action='close']")?.click());
await settle(800);
console.log("3. after close:", JSON.stringify(await trackerState()));
await press(); await settle();
console.log("3. press after close:", JSON.stringify(await trackerState()));

// 4. Simulate a dead pop-out: move the element into a window-less document, then bringToFront + show
const dead = await page.evaluate(async () => {
  const app = [...foundry.applications.instances.values()].find((a) => a.id === "indifference-tracker");
  const deadDoc = document.implementation.createHTMLDocument("dead-popout");
  deadDoc.body.appendChild(app.element); // ownerDocument.defaultView === null now
  let threw = null;
  try { app.bringToFront(); } catch (e) { threw = e.message; }
  return { viewIsNull: app.element.ownerDocument.defaultView === null, bringToFrontThrew: threw };
});
console.log("4. dead pop-out sim:", JSON.stringify(dead));
await press(); await settle(2500);
console.log("4. press after dead pop-out:", JSON.stringify(await trackerState()));

// 5. Simulate WCN taskbar stash (display:none + marker), then press
await page.evaluate(() => {
  const el = document.getElementById("indifference-tracker");
  el.style.display = "none";
  el.dataset.wcTaskbarHidden = "1";
});
await press(); await settle();
console.log("5. press after WCN stash:", JSON.stringify(await trackerState()));

// 6. Page still responsive + error summary
console.log("6. responsive check:", await page.evaluate(() => "yes"));
console.log("page errors:", pageErrors.length ? pageErrors : "none");
await page.screenshot({ path: "verify.png" });
await browser.close();
console.log("DONE");
