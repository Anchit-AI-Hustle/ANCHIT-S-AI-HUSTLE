import { google, type sheets_v4 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { SHEET_HEADERS, env } from "./config";
import type { FlowRecord } from "./types";

function recordToRow(r: FlowRecord): string[] {
  return [
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
  ];
}

/** Resolve the human-readable tab title for the configured gid. */
async function getSheetTitle(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  gid: number,
): Promise<string> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const match = meta.data.sheets?.find(
    (s) => s.properties?.sheetId === gid,
  );
  const title = match?.properties?.title;
  if (!title) {
    throw new Error(
      `No tab with gid=${gid} in spreadsheet ${spreadsheetId}. ` +
        `Available: ${meta.data.sheets
          ?.map((s) => `${s.properties?.title}(gid ${s.properties?.sheetId})`)
          .join(", ")}`,
    );
  }
  return title;
}

const A1_LAST_COL = "M"; // 13 columns -> A..M

/**
 * Upsert all records into the target tab:
 *  - ensures the 13-column header row exists,
 *  - updates the row for an existing Template Name, or appends a new one.
 */
export async function writeRecordsToSheet(
  auth: OAuth2Client,
  records: FlowRecord[],
): Promise<{ updated: number; appended: number; tab: string }> {
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = env.sheetId;
  const tab = await getSheetTitle(sheets, spreadsheetId, env.sheetGid);

  // 1) Ensure header row.
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:${A1_LAST_COL}1`,
  });
  const existingHeader = headerRes.data.values?.[0] ?? [];
  const headerOk =
    existingHeader.length >= SHEET_HEADERS.length &&
    SHEET_HEADERS.every((h, i) => existingHeader[i] === h);
  if (!headerOk) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1:${A1_LAST_COL}1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...SHEET_HEADERS]] },
    });
  }

  // 2) Map existing Template Name (col B) -> 1-based row number.
  const bodyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:${A1_LAST_COL}`,
  });
  const rows = bodyRes.data.values ?? [];
  const nameToRow = new Map<string, number>();
  rows.forEach((row, i) => {
    const name = row[1];
    if (name) nameToRow.set(String(name), i + 2); // +2: header + 1-based
  });

  const updates: sheets_v4.Schema$ValueRange[] = [];
  const appends: string[][] = [];
  for (const rec of records) {
    const row = recordToRow(rec);
    const existing = nameToRow.get(rec.name);
    if (existing) {
      updates.push({
        range: `${tab}!A${existing}:${A1_LAST_COL}${existing}`,
        values: [row],
      });
    } else {
      appends.push(row);
    }
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  }
  if (appends.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A1:${A1_LAST_COL}1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appends },
    });
  }

  return { updated: updates.length, appended: appends.length, tab };
}
