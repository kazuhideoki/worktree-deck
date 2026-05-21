import { describe, expect, it } from "vitest";

import { sessionLogParserService } from "./session-log-parser.service";

/**
 * テスト用に JSONL 行へ変換する
 */
function line(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * テスト用に JSONL 相当の複数行を解析する
 */
function parseLines(values: unknown[]) {
  const state = sessionLogParserService.createParseState();
  for (const value of values) {
    sessionLogParserService.updateParseState({
      line: line(value),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });
  }
  return sessionLogParserService.finalizeParseState(state);
}

describe("sessionLogParserService", () => {
  it("user message の cwd と final_answer から完了セッションを解析する", () => {
    const state = sessionLogParserService.createParseState();
    const path = "/tmp/repo-a/worktree-a";

    sessionLogParserService.updateParseState({
      line: line({
        timestamp: "2026-05-03T10:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: `Implement feature\n<environment_context>\n<cwd>${path}</cwd>\n</environment_context>`,
          turn_id: "turn-1",
        },
      }),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });
    sessionLogParserService.updateParseState({
      line: line({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Done" }],
          phase: "final_answer",
        },
      }),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });

    expect(sessionLogParserService.finalizeParseState(state)).toMatchObject({
      title: "Implement feature",
      titleTurnId: "turn-1",
      cwds: [path],
      status: "done",
      startedAt: Date.parse("2026-05-03T10:00:00.000Z"),
      sessionKind: "main",
      isWaitingForUser: false,
    });
  });

  it("goal 継続 developer message の objective を title fallback として解析する", () => {
    const path = "/tmp/repo-a/worktree-a";
    const parsed = parseLines([
      {
        timestamp: "2026-05-03T10:00:00.000Z",
        type: "session_meta",
        payload: {
          cwd: path,
          source: "cli",
        },
      },
      {
        timestamp: "2026-05-03T10:00:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [
            {
              type: "input_text",
              text:
                "Continue working toward the active thread goal.\n\n<untrusted_objective>\n" +
                "docs/base_plan.md に従ってアプリケーションを完成させて。\n" +
                "必要な情報は docs/ や evaluation/ にある。\n" +
                "</untrusted_objective>",
            },
          ],
        },
      },
    ]);

    expect(parsed).toMatchObject({
      title: "docs/base_plan.md に従ってアプリケーションを完成させて。",
      titleTurnId: null,
      cwds: [path],
      status: "working",
      startedAt: Date.parse("2026-05-03T10:00:01.000Z"),
      sessionKind: "main",
    });
  });

  it("review mode 中の response.completed は working のままにする", () => {
    const state = sessionLogParserService.createParseState();

    sessionLogParserService.updateParseState({
      line: line({ type: "event_msg", payload: { type: "entered_review_mode" } }),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });
    sessionLogParserService.updateParseState({
      line: line({
        type: "event_msg",
        payload: { type: "user_message", message: "Review changes" },
      }),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });
    sessionLogParserService.updateParseState({
      line: line({ type: "response.completed" }),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });

    expect(sessionLogParserService.finalizeParseState(state)).toMatchObject({
      title: "Review changes",
      status: "working",
      sessionKind: "review",
    });
  });

  it("承認待ち function_call と output による待機解除を解析する", () => {
    const state = sessionLogParserService.createParseState();

    sessionLogParserService.updateParseState({
      line: line({
        type: "event_msg",
        payload: { type: "user_message", message: "Run command" },
      }),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });
    sessionLogParserService.updateParseState({
      line: line({
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          call_id: "call-1",
          arguments: JSON.stringify({ sandbox_permissions: "require_escalated" }),
        },
      }),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });
    expect(sessionLogParserService.finalizeParseState(state).isWaitingForUser).toBe(true);

    sessionLogParserService.updateParseState({
      line: line({
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call-1", output: "approved" },
      }),
      homeDir: null,
      state,
      skipFirstUserMessage: false,
    });

    expect(sessionLogParserService.finalizeParseState(state).isWaitingForUser).toBe(false);
  });

  it.each([
    {
      name: "cli",
      source: "cli",
      sessionKind: "main",
      parentThreadId: null,
    },
    {
      name: "vscode",
      source: "vscode",
      sessionKind: "main",
      parentThreadId: null,
    },
    {
      name: "subagent string",
      source: "subagent",
      sessionKind: "subagent",
      parentThreadId: null,
    },
    {
      name: "review subagent",
      source: { subagent: "review" },
      sessionKind: "reviewSubagent",
      parentThreadId: null,
    },
    {
      name: "named subagent",
      source: { subagent: "worker" },
      sessionKind: "subagent",
      parentThreadId: null,
    },
    {
      name: "thread spawn subagent",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "parent-thread",
            depth: 1,
            agent_path: null,
            agent_nickname: "Worker",
            agent_role: null,
          },
        },
      },
      sessionKind: "subagent",
      parentThreadId: "parent-thread",
    },
    {
      name: "guardian subagent",
      source: { subagent: { other: "guardian" } },
      sessionKind: "autoReview",
      parentThreadId: null,
    },
    {
      name: "unknown object subagent",
      source: { subagent: { custom: "value" } },
      sessionKind: "subagent",
      parentThreadId: null,
    },
    {
      name: "unknown source object",
      source: { custom: "value" },
      sessionKind: "main",
      parentThreadId: null,
    },
  ])("session_meta source の $name を $sessionKind として解析する", ({ source, sessionKind, parentThreadId }) => {
    const result = parseLines([
      {
        type: "session_meta",
        payload: {
          id: "thread-id",
          source,
        },
      },
    ]);

    expect(result.sessionKind).toBe(sessionKind);
    expect(result.parentThreadId).toBe(parentThreadId);
  });

  it("turn_context の codex-auto-review model を autoReview として解析する", () => {
    const result = parseLines([
      {
        type: "turn_context",
        payload: {
          model: "codex-auto-review",
        },
      },
    ]);

    expect(result.sessionKind).toBe("autoReview");
  });

  it("subagent source と review event が同じセッションにあれば reviewSubagent として解析する", () => {
    const result = parseLines([
      {
        type: "session_meta",
        payload: {
          source: "subagent",
        },
      },
      {
        type: "event_msg",
        payload: {
          type: "entered_review_mode",
        },
      },
    ]);

    expect(result.sessionKind).toBe("reviewSubagent");
  });
});
