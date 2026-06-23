import { describe, expect, it } from "vitest";

import { resolveClaudeResumeCommand, type WorktreeTitle } from "./worktree-title.entity";

/**
 * テスト用の WorktreeTitle を作る
 */
function buildTitle(overrides: Partial<WorktreeTitle> = {}): WorktreeTitle {
  return {
    title: "title",
    status: "done",
    latestMessage: null,
    updatedAt: 0,
    sessionKind: "main",
    ...overrides,
  };
}

describe("resolveClaudeResumeCommand", () => {
  it("最初（最古 startedAt）の cc セッションを選ぶ。後で resume して updatedAt が新しくなっても変わらない", () => {
    const titles = [
      // Auto Start セッション: 開始が最古だが resume 済みで updatedAt は新しい
      buildTitle({ provider: "cc", sessionPath: "/p/abc/2e823570.jsonl", startedAt: 100, updatedAt: 999 }),
      // 後から作られた別セッション
      buildTitle({ provider: "cc", sessionPath: "/p/abc/later.jsonl", startedAt: 200, updatedAt: 300 }),
    ];

    expect(resolveClaudeResumeCommand(titles)).toBe("claude --resume 2e823570");
  });

  it("startedAt が無い場合は updatedAt を開始順の代替にする", () => {
    const titles = [
      buildTitle({ provider: "cc", sessionPath: "/p/first.jsonl", updatedAt: 10 }),
      buildTitle({ provider: "cc", sessionPath: "/p/second.jsonl", updatedAt: 20 }),
    ];

    expect(resolveClaudeResumeCommand(titles)).toBe("claude --resume first");
  });

  it("cc セッションが無ければ null", () => {
    const titles = [buildTitle({ provider: "ca", sessionPath: "/p/codex.jsonl", updatedAt: 3 })];

    expect(resolveClaudeResumeCommand(titles)).toBeNull();
  });

  it("sessionPath が無い cc は対象外", () => {
    const titles = [buildTitle({ provider: "cc", updatedAt: 9 })];

    expect(resolveClaudeResumeCommand(titles)).toBeNull();
  });
});
