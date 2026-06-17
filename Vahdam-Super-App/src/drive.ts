import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { env } from "./config";

const FOLDER_MIME = "application/vnd.google-apps.folder";

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
): Promise<string> {
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `mimeType='${FOLDER_MIME}'`,
    "trashed=false",
    parentId ? `'${parentId}' in parents` : "",
  ]
    .filter(Boolean)
    .join(" and ");

  const list = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
  });
  const found = list.data.files?.[0]?.id;
  if (found) return found;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Failed to create Drive folder.");
  return created.data.id;
}

function guessMime(file: string): string {
  const ext = file.toLowerCase().split(".").pop();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "csv":
      return "text/csv";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

/**
 * Upload every file in `localDir` into a Drive folder named `folderName`,
 * optionally sharing it. Returns the folder's web link.
 */
export async function uploadFolderToDrive(
  auth: OAuth2Client,
  localDir: string,
  folderName: string,
): Promise<{ folderId: string; link: string; uploaded: number }> {
  const drive = google.drive({ version: "v3", auth });
  const folderId = await findOrCreateFolder(
    drive,
    folderName,
    env.driveParentFolderId,
  );

  // Map existing file names so re-runs replace rather than duplicate.
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  const nameToId = new Map(
    (existing.data.files ?? []).map((f) => [f.name, f.id!] as const),
  );

  let uploaded = 0;
  for (const entry of fs.readdirSync(localDir)) {
    const full = path.join(localDir, entry);
    if (!fs.statSync(full).isFile()) continue;
    const media = { mimeType: guessMime(entry), body: fs.createReadStream(full) };
    const prior = nameToId.get(entry);
    if (prior) {
      await drive.files.update({ fileId: prior, media });
    } else {
      await drive.files.create({
        requestBody: { name: entry, parents: [folderId] },
        media,
        fields: "id",
      });
    }
    uploaded++;
  }

  if (env.driveShareWithEmail) {
    await drive.permissions.create({
      fileId: folderId,
      sendNotificationEmail: false,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: env.driveShareWithEmail,
      },
    });
  }

  const meta = await drive.files.get({
    fileId: folderId,
    fields: "webViewLink",
  });
  return {
    folderId,
    link: meta.data.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`,
    uploaded,
  };
}
