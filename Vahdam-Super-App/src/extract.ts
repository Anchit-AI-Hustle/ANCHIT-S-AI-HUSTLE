import * as cheerio from "cheerio";
import type { ExtractResult } from "./types";

/** Images that are chrome, not content: brand logo + footer social icons. */
function isNonHero(src: string): boolean {
  const s = src.toLowerCase();
  return (
    s.includes("cloudfront.net/company") || // VAHDAM logo
    s.includes("/assets/email/buttons/") || // footer social icons
    s.includes("open.gif") ||
    s.includes("spacer") ||
    s.endsWith(".gif")
  );
}

/** Fetch a rendered email screen and pull out everything we need. */
export async function extractScreen(screenUrl: string): Promise<ExtractResult> {
  const res = await fetch(screenUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to load screen ${screenUrl}: HTTP ${res.status}`);
  }
  const fullHtml = await res.text();
  return parseEmailHtml(fullHtml, screenUrl);
}

/** Parse already-fetched email HTML (used by both the static + Klaviyo paths). */
export function parseEmailHtml(fullHtml: string, baseUrl: string): ExtractResult {
  const $ = cheerio.load(fullHtml);
  const base = new URL(baseUrl);

  // All <img src>, resolved to absolute URLs, de-duplicated in document order.
  const seen = new Set<string>();
  const imageSrcs: string[] = [];
  $("img[src]").each((_, el) => {
    const raw = $(el).attr("src");
    if (!raw) return;
    let abs: string;
    try {
      abs = new URL(raw, base).toString();
    } catch {
      abs = raw;
    }
    if (!seen.has(abs)) {
      seen.add(abs);
      imageSrcs.push(abs);
    }
  });

  // Hero = first content image (skip logo + footer icons).
  const heroUrl = imageSrcs.find((src) => !isNonHero(src)) ?? null;

  // Subject: <title>, then first heading.
  const subject =
    ($("title").first().text() || $("h1,h2,h3").first().text() || "")
      .replace(/\s+/g, " ")
      .trim();

  // Footer: the block from "Unsubscribe" onward (Klaviyo footer marker),
  // else everything after the last <hr>.
  const bodyText = $("body").length ? $("body").text() : $.root().text();
  const fullText = bodyText.replace(/\s+/g, " ").trim();
  let footer = "";
  const unsubIdx = fullText.toLowerCase().indexOf("unsubscribe");
  if (unsubIdx >= 0) {
    footer = fullText.slice(Math.max(0, unsubIdx - 200)).trim();
  } else {
    footer = fullText.slice(-400).trim();
  }

  // Body copy: full visible text, with the footer trimmed off when found.
  const bodyCopy =
    unsubIdx >= 0 ? fullText.slice(0, unsubIdx).trim() : fullText;

  return { subject, bodyCopy, footer, heroUrl, imageSrcs, fullHtml };
}
