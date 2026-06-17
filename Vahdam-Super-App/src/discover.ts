import * as cheerio from "cheerio";
import { INDEX_URL } from "./config";
import type { DiscoveredFlow } from "./types";

/**
 * Parse the /usa/ index page and return all 22 PP#NN_V4 flows.
 *
 * The page renders each email as:
 *   <h4 ...>PP#01 &mdash; Your craving-reset kit is on the way</h4>
 *   ... <iframe src="screens/pp-01.html" title="PP#01 V4"></iframe>
 *
 * We key off the iframe (the source of truth for the rendered email) and pair
 * it with the nearest preceding heading for the subject line.
 */
export async function discoverFlows(
  indexUrl: string = INDEX_URL,
): Promise<DiscoveredFlow[]> {
  const res = await fetch(indexUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to load index page ${indexUrl}: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const base = new URL(indexUrl);

  const bySeq = new Map<string, DiscoveredFlow>();

  $("iframe[src]").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const m = src.match(/screens\/pp-(\d{2})\.html/i);
    if (!m) return;
    const seq = m[1]!;
    const screenUrl = new URL(src, base).toString();

    // Nearest heading text for the subject; fall back to the iframe title.
    const heading = $(el)
      .closest("div")
      .prevAll()
      .find("h4")
      .first()
      .text();
    const headingText =
      heading || $(`h4:contains("PP#${seq}")`).first().text() || "";
    const cardSubject = headingText
      .replace(/\s+/g, " ")
      .replace(/^PP#\d{2}\s*[—–-]\s*/i, "")
      .trim();

    bySeq.set(seq, {
      seq,
      name: `PP#${seq}_V4`,
      cardSubject,
      screenUrl,
    });
  });

  const flows = [...bySeq.values()].sort((a, b) =>
    a.seq.localeCompare(b.seq),
  );

  if (flows.length === 0) {
    throw new Error(
      "No PP#NN_V4 flows found on the index page — the page structure may have changed.",
    );
  }
  return flows;
}
