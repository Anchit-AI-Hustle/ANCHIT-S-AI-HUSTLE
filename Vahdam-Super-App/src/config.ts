import os from "node:os";
import path from "node:path";

/** Where the 22 flows live. */
export const INDEX_URL = "https://postpurchase-tan.vercel.app/usa/";

/** The 13 Google-Sheet columns, in spec order. */
export const SHEET_HEADERS = [
  "Sequence",
  "Template Name",
  "Link",
  "Template ID",
  "Brand",
  "Image Asset",
  "Image Note",
  "Header / Subject",
  "Full Body Copy",
  "Footer",
  "Image URL",
  "Full HTML Code",
  "Image Links",
] as const;

export const BRAND = "VAHDAM®";

/** Generic Klaviyo link the site exposes (no per-template URL exists). */
export const SITE_KLAVIYO_LINK = "https://www.klaviyo.com/";

/** Local paths. */
export const ROOT = process.cwd();
export const STATE_DIR = path.join(ROOT, ".state");
export const STATE_FILE = path.join(STATE_DIR, "progress.json");
export const TOKEN_FILE = path.join(ROOT, ".gtoken.json");
export const BROWSER_PROFILE_DIR = path.join(ROOT, ".browser-profile");
export const KLAVIYO_MAP_FILE = path.join(ROOT, "klaviyo-map.json");

/** The packet PNG to composite over hero images. Drop it here. */
export const PACKET_PNG = path.join(
  ROOT,
  "assets",
  "vahdam_packet_extracted_transparent.png",
);

/** Output folder on the Desktop (per spec) + a project-local mirror. */
export const DESKTOP_OUT = path.join(
  os.homedir(),
  "Desktop",
  "Vahdam-US-Flows-ImgChange",
);
export const HERO_DIR = DESKTOP_OUT; // heroes saved straight into the Desktop folder
export const CSV_FILE = path.join(DESKTOP_OUT, "vahdam-us-flows.csv");

/** Image-overlay tuning (the packet swap). All adjustable. */
export const OVERLAY = {
  /** Packet width as a fraction of the hero width. */
  widthRatio: 0.42,
  /**
   * Placement of the packet over the hero. sharp gravity, e.g.
   * "centre" | "south" | "southeast". "centre" is the safe default.
   */
  gravity: "centre" as const,
  /** Sequences known to have NO packet -> overlay skipped, note "No packet". */
  noPacketSeqs: new Set<string>([]),
};

/** Google API scopes: edit the user's sheet + manage files the app creates. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

/** Read lazily (via getters) so a .env loaded at runtime is reflected. */
export const env = {
  get clientId() {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get clientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET ?? "";
  },
  get sheetId() {
    return process.env.SHEET_ID ?? "1DdlgU8jLblCrsxkoYo0KDDtAfspdY8hmPFncSLoi67I";
  },
  get sheetGid() {
    return Number(process.env.SHEET_GID ?? "1314990366");
  },
  get driveParentFolderId() {
    return process.env.DRIVE_PARENT_FOLDER_ID ?? "";
  },
  get driveShareWithEmail() {
    return process.env.DRIVE_SHARE_WITH_EMAIL ?? "";
  },
  get hasGoogleCreds() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },
};
