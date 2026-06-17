import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDotEnv } from "./dotenv";
import {
  BRAND,
  CSV_FILE,
  DESKTOP_OUT,
  HERO_DIR,
  KLAVIYO_MAP_FILE,
  SHEET_HEADERS,
  SITE_KLAVIYO_LINK,
  env,
} from "./config";
import { discoverFlows } from "./discover";
import { extractScreen, parseEmailHtml } from "./extract";
import { processHero } from "./images";
import { KlaviyoSession } from "./klaviyo";
import { clearState, commitRecord, isDone, loadState } from "./state";
import type { FlowRecord } from "./types";

interface Args {
  start: number;
  limit: number;
  noOverlay: boolean;
  useKlaviyo: boolean;
  skipSheets: boolean;
  skipDrive: boolean;
  fresh: boolean;
  force: boolean;
  onlyDiscover: boolean;
  authOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const has = (f: string) => argv.includes(f);
  const num = (f: string, d: number) => {
    const i = argv.indexOf(f);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
  };
  return {
    start: num("--start", 1),
    limit: num("--limit", 22),
    noOverlay: has("--no-overlay"),
    useKlaviyo: has("--use-klaviyo"),
    skipSheets: has("--skip-sheets"),
    skipDrive: has("--skip-drive"),
    fresh: has("--fresh"),
    force: has("--force"),
    onlyDiscover: has("--only-discover"),
    authOnly: has("--auth-only"),
  };
}

function csvCell(v: string): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(records: FlowRecord[]): void {
  fs.mkdirSync(DESKTOP_OUT, { recursive: true });
  const lines = [SHEET_HEADERS.join(",")];
  for (const r of records) {
    lines.push(
      [
        r.seq,
        r.name,
        r.link,
        r.templateId,
        r.brand,
        r.imageAsset,
        r.imageNote,
        r.subject,
        r.bodyCopy,
        r.footer,
        r.heroUrl,
        r.fullHtml,
        r.imageLinks,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  fs.writeFileSync(CSV_FILE, lines.join("\n"));
}

function zipFolder(): string | null {
  const zipPath = path.join(os.homedir(), "Desktop", "Vahdam-US-Flows-ImgChange.zip");
  try {
    fs.rmSync(zipPath, { force: true });
    execFileSync("zip", ["-r", "-q", zipPath, path.basename(DESKTOP_OUT)], {
      cwd: path.dirname(DESKTOP_OUT),
    });
    return zipPath;
  } catch {
    console.warn("⚠️  Could not create ZIP (is `zip` installed?). Skipping.");
    return null;
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));

  // --- auth-only: just run/verify the Google consent flow ---
  if (args.authOnly) {
    const { getGoogleAuth } = await import("./google-auth");
    await getGoogleAuth();
    console.log("✓ Google auth OK.");
    return;
  }

  console.log("🔎 Discovering PP#NN_V4 flows…");
  let flows = await discoverFlows();
  console.log(`   Found ${flows.length} flows.`);
  flows = flows.filter((f) => {
    const n = Number(f.seq);
    return n >= args.start && n < args.start + args.limit;
  });

  if (args.onlyDiscover) {
    for (const f of flows) console.log(`   ${f.name}  ${f.screenUrl}`);
    return;
  }

  if (args.fresh) clearState();
  const state = loadState();

  // Optional Klaviyo map + session.
  let klaviyoMap: Record<string, { url: string; templateId?: string }> = {};
  if (fs.existsSync(KLAVIYO_MAP_FILE)) {
    klaviyoMap = JSON.parse(fs.readFileSync(KLAVIYO_MAP_FILE, "utf8"));
  }
  let klaviyo: KlaviyoSession | null = null;
  if (args.useKlaviyo) {
    if (Object.keys(klaviyoMap).length === 0) {
      console.warn(
        "⚠️  --use-klaviyo set but klaviyo-map.json is missing/empty; " +
          "falling back to the static screen HTML.",
      );
    } else {
      klaviyo = new KlaviyoSession();
      await klaviyo.init();
    }
  }

  console.log(`\n📦 Processing ${flows.length} flow(s)…`);
  for (const flow of flows) {
    if (isDone(state, flow.name) && !args.force) {
      console.log(`   ⏭  ${flow.name} (already done — resuming)`);
      continue;
    }
    try {
      const mapped = klaviyoMap[flow.name];
      let extract;
      if (klaviyo && mapped?.url) {
        const html = await klaviyo.fetchHtml(mapped.url);
        extract = parseEmailHtml(html, mapped.url);
      } else {
        extract = await extractScreen(flow.screenUrl);
      }

      const hero = await processHero({
        seq: flow.seq,
        heroUrl: extract.heroUrl,
        overlay: !args.noOverlay,
      });

      const record: FlowRecord = {
        seq: flow.seq,
        name: flow.name,
        link: mapped?.url ?? flow.screenUrl ?? SITE_KLAVIYO_LINK,
        templateId: mapped?.templateId ?? "",
        brand: BRAND,
        imageAsset: hero.imageAsset,
        imageNote: hero.imageNote,
        subject: extract.subject || flow.cardSubject,
        bodyCopy: extract.bodyCopy,
        footer: extract.footer,
        heroUrl: extract.heroUrl ?? "",
        fullHtml: extract.fullHtml,
        imageLinks: extract.imageSrcs.join(", "),
      };
      commitRecord(state, record);
      console.log(
        `   ✓ ${flow.name} — ${extract.imageSrcs.length} imgs, hero: ${hero.imageNote}`,
      );
    } catch (err) {
      console.error(`   ✗ ${flow.name}: ${(err as Error).message}`);
    }
  }
  if (klaviyo) await klaviyo.close();

  const records = flows
    .map((f) => state.records[f.name])
    .filter((r): r is FlowRecord => Boolean(r));

  // Local artifacts.
  writeCsv(records);
  const zip = zipFolder();
  console.log(`\n💾 Saved ${records.length} heroes + CSV to ${HERO_DIR}`);
  console.log(`   CSV: ${CSV_FILE}`);
  if (zip) console.log(`   ZIP: ${zip}`);

  // Google Sheet.
  if (!args.skipSheets) {
    if (!env.hasGoogleCreds) {
      console.log(
        "\n📊 Skipping Google Sheet — set GOOGLE_CLIENT_ID/SECRET in .env to enable.",
      );
    } else {
      const { getGoogleAuth } = await import("./google-auth");
      const { writeRecordsToSheet } = await import("./sheets");
      const auth = await getGoogleAuth();
      const res = await writeRecordsToSheet(auth, records);
      console.log(
        `\n📊 Sheet "${res.tab}" updated: ${res.appended} appended, ${res.updated} updated.`,
      );
    }
  }

  // Google Drive.
  if (!args.skipDrive) {
    if (!env.hasGoogleCreds) {
      console.log("☁️  Skipping Drive upload — Google creds not set.");
    } else {
      const { getGoogleAuth } = await import("./google-auth");
      const { uploadFolderToDrive } = await import("./drive");
      const auth = await getGoogleAuth();
      const res = await uploadFolderToDrive(
        auth,
        DESKTOP_OUT,
        "Vahdam-US-Flows-ImgChange",
      );
      console.log(
        `☁️  Uploaded ${res.uploaded} files to Drive folder: ${res.link}`,
      );
    }
  }

  console.log(`\n✅ Done. ${records.length}/22 flows processed.`);
}

main().catch((err) => {
  console.error("\n💥 Fatal:", err);
  process.exit(1);
});
