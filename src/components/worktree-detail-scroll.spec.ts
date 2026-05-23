import { describe, expect, it } from "vitest";

import {
  SCROLL_DETAIL_DOWN_SHORTCUT,
  SCROLL_DETAIL_UP_SHORTCUT,
  buildScrollableDetailMarkdown,
  resolveNextDetailScrollOffset,
  resolveSafeDetailScrollOffset,
} from "./worktree-detail-scroll";

const DETAIL_MARKDOWN = ["| 📝 | title |", "| --- | --- |", "| 🌿 | main |", "", "line 1", "line 2"].join("\n");

describe("worktree detail scroll", () => {
  it("shift+上下を詳細スクロールのショートカットにする", () => {
    expect(SCROLL_DETAIL_UP_SHORTCUT).toEqual({ modifiers: ["shift"], key: "arrowUp" });
    expect(SCROLL_DETAIL_DOWN_SHORTCUT).toEqual({ modifiers: ["shift"], key: "arrowDown" });
  });

  it("詳細テーブル途中ではなく本文先頭へスクロールする", () => {
    expect(resolveSafeDetailScrollOffset(DETAIL_MARKDOWN, 1)).toBe(4);
  });

  it("上方向は本文先頭から概要へ戻る", () => {
    expect(resolveNextDetailScrollOffset({ markdown: DETAIL_MARKDOWN, currentOffset: 4, direction: "up" })).toBe(0);
  });

  it("本文内では1行ずつ進める", () => {
    expect(resolveNextDetailScrollOffset({ markdown: DETAIL_MARKDOWN, currentOffset: 4, direction: "down" })).toBe(5);
  });

  it("スクロール位置を反映した Markdown を返す", () => {
    expect(buildScrollableDetailMarkdown(DETAIL_MARKDOWN, 4)).toBe(["line 1", "line 2"].join("\n"));
  });
});
