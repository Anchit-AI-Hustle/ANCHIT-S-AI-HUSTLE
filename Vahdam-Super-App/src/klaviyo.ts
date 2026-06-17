import readline from "node:readline";
import { chromium, type BrowserContext, type Page } from "playwright";
import { BROWSER_PROFILE_DIR } from "./config";

function prompt(question: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, () => {
      rl.close();
      resolve();
    }),
  );
}

/**
 * Optional path: a persistent, headful Chromium for fetching template HTML
 * directly from Klaviyo. Only used with --use-klaviyo + a klaviyo-map.json,
 * because the public /usa/ site exposes no per-template Klaviyo URLs.
 *
 * The login session persists in .browser-profile so 2FA is a one-time prompt.
 */
export class KlaviyoSession {
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    this.ctx = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      headless: false,
      viewport: { width: 1440, height: 900 },
    });
    this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    await this.page.goto("https://www.klaviyo.com/login", {
      waitUntil: "domcontentloaded",
    });
    console.log(
      "\n👤 Log in to Klaviyo in the opened browser (complete any 2FA).",
    );
    await prompt("   Press ENTER here once you are fully logged in… ");
  }

  /** Navigate to a Klaviyo template URL and return its rendered HTML. */
  async fetchHtml(url: string): Promise<string> {
    if (!this.page) throw new Error("KlaviyoSession not initialized.");
    await this.page.goto(url, { waitUntil: "networkidle" });
    return this.page.content();
  }

  async close(): Promise<void> {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
  }
}
