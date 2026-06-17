import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { HERO_DIR, OVERLAY, PACKET_PNG } from "./config";

export interface ProcessedHero {
  /** Filename saved into the Desktop folder (updated hero, or original). */
  imageAsset: string;
  /** "Packet replaced" | "No packet" | a skip reason. */
  imageNote: string;
}

function extFromUrl(url: string, contentType?: string | null): string {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg"))
    return "jpg";
  const m = url.split("?")[0]?.match(/\.([a-z0-9]{2,4})$/i);
  return (m?.[1] ?? "jpg").toLowerCase();
}

async function fetchBuffer(url: string): Promise<{ buf: Buffer; ext: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const ab = await res.arrayBuffer();
  return { buf: Buffer.from(ab), ext: extFromUrl(url, res.headers.get("content-type")) };
}

/**
 * Download the hero, save the original, and (when a packet PNG is present and
 * the flow is flagged to have a packet) composite the transparent packet over
 * it, saving `ppNN_updated_hero.png`.
 */
export async function processHero(opts: {
  seq: string;
  heroUrl: string | null;
  overlay: boolean;
}): Promise<ProcessedHero> {
  const { seq, heroUrl, overlay } = opts;
  fs.mkdirSync(HERO_DIR, { recursive: true });

  if (!heroUrl) {
    return { imageAsset: "", imageNote: "No hero image found" };
  }

  let hero: { buf: Buffer; ext: string };
  try {
    hero = await fetchBuffer(heroUrl);
  } catch (err) {
    return {
      imageAsset: "",
      imageNote: `Hero download failed: ${(err as Error).message}`,
    };
  }

  const originalName = `pp${seq}_hero.${hero.ext}`;
  fs.writeFileSync(path.join(HERO_DIR, originalName), hero.buf);

  const noPacket = OVERLAY.noPacketSeqs.has(seq);
  const packetExists = fs.existsSync(PACKET_PNG);

  if (!overlay || noPacket) {
    return { imageAsset: originalName, imageNote: "No packet" };
  }
  if (!packetExists) {
    return {
      imageAsset: originalName,
      imageNote: "Packet PNG not provided — overlay skipped",
    };
  }

  try {
    const meta = await sharp(hero.buf).metadata();
    const heroW = meta.width ?? 600;
    const targetW = Math.max(1, Math.round(heroW * OVERLAY.widthRatio));
    const packet = await sharp(PACKET_PNG)
      .resize({ width: targetW })
      .png()
      .toBuffer();

    const updatedName = `pp${seq}_updated_hero.png`;
    await sharp(hero.buf)
      .composite([{ input: packet, gravity: OVERLAY.gravity }])
      .png()
      .toFile(path.join(HERO_DIR, updatedName));

    return { imageAsset: updatedName, imageNote: "Packet replaced" };
  } catch (err) {
    return {
      imageAsset: originalName,
      imageNote: `Overlay failed: ${(err as Error).message}`,
    };
  }
}
