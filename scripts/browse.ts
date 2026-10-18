// Drive the running app in a headless (windowless) Chromium and save
// screenshots, so changes to the chart can be checked without a person
// looking. Start the app first (npm run dev), then:
//
//   npx tsx scripts/browse.ts <folder for screenshots> '<steps as JSON>'
//
// Steps run in order. Each is an object with one of these keys:
//   { "goto": "/" }                         open a page of the app
//   { "dark": true }                        dark mode (set before "goto")
//   { "size": [1600, 900] }                 window size (set before "goto")
//   { "scale": 1.5 }                        display scaling, like a 150% screen (set before "goto")
//   { "hover": "text=Spring 2027" }         point at an element...
//   { "hover": [800, 120] }                 ...or at a spot (x, y in pixels)
//   { "click": "text=Add term" }            click an element or a spot
//   { "rightClick": [800, 400] }            right-click an element or a spot
//   { "press": "Escape" }                   press a key
//   { "wait": 300 }                         wait (milliseconds)
//   { "shot": "after-hover.png" }           save a screenshot of the window
//   { "shot": "menu.png", "of": "[role=menu]" }  ...or of just one element
//   { "shot": "top.png", "clip": [0, 0, 800, 300] }  ...or of an area (x, y, width, height)
// Set APP_SESSION to a session cookie's secret to browse signed in.
// Errors the page logs to the browser console are printed at the end.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

type Target = string | [number, number];
type Step =
  | { goto: string }
  | { dark: boolean }
  | { size: [number, number] }
  | { scale: number }
  | { hover: Target }
  | { click: Target }
  | { rightClick: Target }
  | { press: string }
  | { wait: number }
  | { shot: string; of?: string; clip?: [number, number, number, number] };

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
// Arch's Chromium package; set CHROMIUM to use another browser.
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";

// Point the mouse at a target: an element (by Playwright selector) or a
// spot in the window.
async function pointAt(page: Page, target: Target, action: "hover" | "click" | "rightClick") {
  if (Array.isArray(target)) {
    const [x, y] = target;
    await page.mouse.move(x, y);
    if (action === "click") await page.mouse.click(x, y);
    if (action === "rightClick") await page.mouse.click(x, y, { button: "right" });
    return;
  }
  const element = page.locator(target).first();
  if (action === "hover") await element.hover();
  else await element.click({ button: action === "rightClick" ? "right" : "left" });
}

async function main() {
  const [outDir, stepsJson] = process.argv.slice(2);
  if (!outDir || !stepsJson) {
    console.error("Usage: npx tsx scripts/browse.ts <screenshot folder> '<steps as JSON>'");
    process.exit(1);
  }
  const steps: Step[] = JSON.parse(stepsJson);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  let dark = false;
  let size: [number, number] = [1600, 900];
  let scale = 1;
  let page: Page | null = null;
  const errors: string[] = [];

  try {
    for (const step of steps) {
      if ("dark" in step) dark = step.dark;
      else if ("size" in step) size = step.size;
      else if ("scale" in step) scale = step.scale;
      else if ("goto" in step) {
        const context = await browser.newContext({
          viewport: { width: size[0], height: size[1] },
          deviceScaleFactor: scale,
          colorScheme: dark ? "dark" : "light",
        });
        // Signed in: APP_SESSION holds a session cookie's secret (kept out
        // of this file, since anyone with it is signed in as that person).
        if (process.env.APP_SESSION) {
          await context.addCookies([{ name: "charticulum_session", value: process.env.APP_SESSION, url: BASE_URL }]);
        }
        page = await context.newPage();
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(BASE_URL + step.goto, { waitUntil: "networkidle" });
      } else {
        if (!page) throw new Error('Open a page with { "goto": "/" } first.');
        if ("hover" in step) await pointAt(page, step.hover, "hover");
        else if ("click" in step) await pointAt(page, step.click, "click");
        else if ("rightClick" in step) await pointAt(page, step.rightClick, "rightClick");
        else if ("press" in step) await page.keyboard.press(step.press);
        else if ("wait" in step) await page.waitForTimeout(step.wait);
        else if ("shot" in step) {
          const path = join(outDir, step.shot);
          if (step.of) await page.locator(step.of).first().screenshot({ path });
          else if (step.clip) {
            const [x, y, width, height] = step.clip;
            await page.screenshot({ path, clip: { x, y, width, height } });
          } else await page.screenshot({ path });
          console.log(`Saved ${path}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (errors.length > 0) console.log("Console errors:\n" + errors.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
