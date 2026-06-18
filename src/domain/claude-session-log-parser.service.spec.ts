import { describe, expect, it } from "vitest";

import { claudeSessionLogParserService } from "./claude-session-log-parser.service";

const CWD = "/Users/me/work/repo";

/**
 * テスト用に JSONL 相当の複数行を解析する
 */
function parseLines(values: unknown[]) {
  const state = claudeSessionLogParserService.createParseState();
  for (const value of values) {
    claudeSessionLogParserService.updateParseState({ line: JSON.stringify(value), state });
  }
  return claudeSessionLogParserService.finalizeParseState(state);
}

/**
 * user 行を作る
 */
function userLine(content: unknown, extra: Record<string, unknown> = {}) {
  return { type: "user", cwd: CWD, message: { role: "user", content }, ...extra };
}

/**
 * assistant 行を作る
 */
function assistantLine(content: unknown, stopReason: string, extra: Record<string, unknown> = {}) {
  return {
    type: "assistant",
    cwd: CWD,
    message: { role: "assistant", content, stop_reason: stopReason },
    ...extra,
  };
}

describe("claudeSessionLogParserService", () => {
  it("ai-title をタイトルに優先し cwd / startedAt を抽出する", () => {
    const result = parseLines([
      { type: "mode", mode: "default" },
      userLine("最初のユーザー入力", { timestamp: "2026-06-17T04:04:51.000Z" }),
      { type: "ai-title", aiTitle: "AIが付けたタイトル" },
      assistantLine([{ type: "text", text: "完了しました" }], "end_turn"),
    ]);
    expect(result.title).toBe("AIが付けたタイトル");
    expect(result.cwds).toEqual([CWD]);
    expect(result.startedAt).toBe(Date.parse("2026-06-17T04:04:51.000Z"));
  });

  it("ai-title が無ければ最初の user メッセージをタイトルにする", () => {
    const result = parseLines([
      userLine("これはユーザーの最初の発話\n2行目"),
      assistantLine([{ type: "text", text: "ok" }], "end_turn"),
    ]);
    expect(result.title).toBe("これはユーザーの最初の発話");
  });

  it("末尾 assistant が end_turn なら done", () => {
    const result = parseLines([userLine("やって"), assistantLine([{ type: "text", text: "やりました" }], "end_turn")]);
    expect(result.status).toBe("done");
    expect(result.latestMessage).toBe("🤖 やりました");
  });

  it("末尾が tool_use 未完了なら working", () => {
    const result = parseLines([
      userLine("調べて"),
      assistantLine([{ type: "tool_use", id: "t1", name: "Read" }], "tool_use"),
    ]);
    expect(result.status).toBe("working");
    expect(result.isWaitingForUser).toBe(false);
  });

  it("tool_result で pending が解消すれば done になりうる", () => {
    const result = parseLines([
      userLine("調べて"),
      assistantLine([{ type: "tool_use", id: "t1", name: "Read" }], "tool_use"),
      userLine([{ type: "tool_result", tool_use_id: "t1", content: "結果" }]),
      assistantLine([{ type: "text", text: "終わり" }], "end_turn"),
    ]);
    expect(result.status).toBe("done");
  });

  it("AskUserQuestion が未解決なら isWaitingForUser かつ working", () => {
    const result = parseLines([
      userLine("やって"),
      assistantLine([{ type: "tool_use", id: "q1", name: "AskUserQuestion" }], "tool_use"),
    ]);
    expect(result.isWaitingForUser).toBe(true);
    expect(result.status).toBe("working");
  });

  it("AskUserQuestion に tool_result が付けば待ち解除", () => {
    const result = parseLines([
      userLine("やって"),
      assistantLine([{ type: "tool_use", id: "q1", name: "AskUserQuestion" }], "tool_use"),
      userLine([{ type: "tool_result", tool_use_id: "q1", content: "回答" }]),
      assistantLine([{ type: "text", text: "進めます" }], "end_turn"),
    ]);
    expect(result.isWaitingForUser).toBe(false);
    expect(result.status).toBe("done");
  });

  it("付随イベント / isMeta 行はタイトル・cwd に影響しない", () => {
    const result = parseLines([
      { type: "file-history-snapshot", snapshot: {} },
      { type: "system", text: "x", cwd: "/other/path" },
      userLine("本物の入力", { isMeta: true }),
      userLine("二番目の入力"),
      assistantLine([{ type: "text", text: "応答" }], "end_turn"),
    ]);
    expect(result.title).toBe("二番目の入力");
    expect(result.cwds).toEqual([CWD]);
  });
});
