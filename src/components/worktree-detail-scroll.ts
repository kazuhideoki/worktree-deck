import type { Keyboard } from "@raycast/api";

/**
 * 詳細ペインを上方向へ送るショートカット
 */
export const SCROLL_DETAIL_UP_SHORTCUT = { modifiers: ["shift"], key: "arrowUp" } satisfies Keyboard.Shortcut;

/**
 * 詳細ペインを下方向へ送るショートカット
 */
export const SCROLL_DETAIL_DOWN_SHORTCUT = { modifiers: ["shift"], key: "arrowDown" } satisfies Keyboard.Shortcut;

/**
 * 詳細ペインのスクロール方向
 */
export type DetailScrollDirection = "up" | "down";

/**
 * Markdown の先頭に置ける安全なスクロール位置を返す
 */
export function resolveSafeDetailScrollOffset(markdown: string, offset: number): number {
  const lines = splitDetailMarkdownLines(markdown);
  if (lines.length === 0) {
    return 0;
  }
  const boundedOffset = Math.min(Math.max(Math.trunc(offset), 0), lines.length - 1);
  const contentStartIndex = resolveScrollableContentStartIndex(lines);
  if (boundedOffset === 0 || contentStartIndex === 0) {
    return boundedOffset;
  }
  if (boundedOffset < contentStartIndex) {
    return contentStartIndex;
  }
  return boundedOffset;
}

/**
 * 詳細ペインの次のスクロール位置を返す
 */
export function resolveNextDetailScrollOffset(args: {
  markdown: string;
  currentOffset: number;
  direction: DetailScrollDirection;
}): number {
  if (args.direction === "up") {
    const lines = splitDetailMarkdownLines(args.markdown);
    const contentStartIndex = resolveScrollableContentStartIndex(lines);
    if (contentStartIndex > 0 && args.currentOffset <= contentStartIndex) {
      return 0;
    }
  }
  const delta = args.direction === "down" ? 1 : -1;
  return resolveSafeDetailScrollOffset(args.markdown, args.currentOffset + delta);
}

/**
 * スクロール位置を反映した詳細 Markdown を返す
 */
export function buildScrollableDetailMarkdown(markdown: string, offset: number): string {
  const lines = splitDetailMarkdownLines(markdown);
  const safeOffset = resolveSafeDetailScrollOffset(markdown, offset);
  return lines.slice(safeOffset).join("\n");
}

/**
 * Markdown を詳細ペインのスクロール単位へ分割する
 */
function splitDetailMarkdownLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

/**
 * 詳細テーブル後の本文開始位置を返す
 */
function resolveScrollableContentStartIndex(lines: string[]): number {
  const blankLineIndex = lines.findIndex((line) => line.trim() === "");
  if (blankLineIndex < 0) {
    return 0;
  }
  const contentStartIndex = blankLineIndex + 1;
  return contentStartIndex >= lines.length ? 0 : contentStartIndex;
}
