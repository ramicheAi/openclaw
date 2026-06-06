import { chromium } from "playwright-core";
const BASE = "http://localhost:5180";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.25 });
const page = await ctx.newPage();
const fs = await import("node:fs/promises");
await fs.mkdir("/tmp/themis-shots-final", { recursive: true });

// 1) Onboarding tour first-run
await page.goto(`${BASE}/?matter=reyes-northwind&tab=ask`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `/tmp/themis-shots-final/01-tour-step1.png`, fullPage: false });

// 2) Advance
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(700);
await page.screenshot({ path: `/tmp/themis-shots-final/02-tour-step2-brain.png`, fullPage: false });

await page.keyboard.press("ArrowRight");
await page.waitForTimeout(700);
await page.screenshot({ path: `/tmp/themis-shots-final/03-tour-step3-ask.png`, fullPage: false });

// 3) Close tour
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 4) Brain mode + chain picker
await page.goto(`${BASE}/?matter=reyes-northwind&mode=brain`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `/tmp/themis-shots-final/04-brain-chains-dropdown.png`, fullPage: false });

// 5) New chain modal
await page.getByText("+ new chain").first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `/tmp/themis-shots-final/05-new-chain-modal.png`, fullPage: false });

await browser.close();
console.log("done");
