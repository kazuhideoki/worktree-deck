import { Clipboard, getSelectedFinderItems } from "@raycast/api";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

const SUPPORTED_AUTO_START_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);

/**
 * node:child_process の Promise 版 execFile
 */
const execFileAsync = promisify(execFile);

/**
 * Auto Start の画像として扱う拡張子か判定する
 */
export function isSupportedAutoStartImagePath(path: string): boolean {
  return SUPPORTED_AUTO_START_IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * Auto Start に渡せるローカル画像ファイルか判定する
 */
export function isReadableAutoStartImagePath(path: string): boolean {
  try {
    return isSupportedAutoStartImagePath(path) && existsSync(path) && lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * クリップボードから Auto Start に添付する画像パスを解決する
 */
export async function resolveClipboardImagePath(): Promise<string | null> {
  const content = await Clipboard.read();
  const candidates = [content.file?.toString(), content.text];
  for (const candidate of candidates) {
    const path = candidate?.trim();
    if (path && isReadableAutoStartImagePath(path)) {
      return path;
    }
  }
  return extractNativeClipboardImage();
}

/**
 * Finder で選択中の画像パスを解決する
 */
export async function resolveSelectedFinderImagePaths(): Promise<string[]> {
  const items = await getSelectedFinderItems();
  return items.map((item) => item.path).filter((path) => isReadableAutoStartImagePath(path));
}

/**
 * macOS のクリップボード画像を一時 PNG として保存する
 */
async function extractNativeClipboardImage(): Promise<string | null> {
  const outputDir = join(tmpdir(), "worktree-deck-clipboard-images");
  await mkdir(outputDir, { recursive: true });
  const pngPath = join(outputDir, `${randomUUID()}.png`);
  if (await writeClipboardImageDataToFile({ format: "png", outputPath: pngPath })) {
    return pngPath;
  }

  const tiffPath = join(outputDir, `${randomUUID()}.tiff`);
  if (!(await writeClipboardImageDataToFile({ format: "tiff", outputPath: tiffPath }))) {
    return null;
  }
  try {
    await execFileAsync("/usr/bin/sips", ["-s", "format", "png", tiffPath, "--out", pngPath], { timeout: 5000 });
    return (await isNonEmptyFile(pngPath)) ? pngPath : null;
  } finally {
    await rm(tiffPath, { force: true });
  }
}

/**
 * AppleScript 経由でクリップボード画像データを書き出す
 */
async function writeClipboardImageDataToFile(args: { format: "png" | "tiff"; outputPath: string }): Promise<boolean> {
  const script = `
on run argv
  set outputPath to item 1 of argv
  set imageFormat to item 2 of argv
  if imageFormat is "png" then
    set imageData to the clipboard as «class PNGf»
  else
    set imageData to the clipboard as TIFF picture
  end if
  set outputFile to open for access (POSIX file outputPath) with write permission
  try
    set eof outputFile to 0
    write imageData to outputFile
    close access outputFile
  on error errorMessage
    try
      close access outputFile
    end try
    error errorMessage
  end try
end run
`;
  try {
    await execFileAsync("/usr/bin/osascript", ["-e", script, args.outputPath, args.format], { timeout: 5000 });
    return isNonEmptyFile(args.outputPath);
  } catch {
    await rm(args.outputPath, { force: true });
    return false;
  }
}

/**
 * 空ではないファイルか判定する
 */
async function isNonEmptyFile(path: string): Promise<boolean> {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}
