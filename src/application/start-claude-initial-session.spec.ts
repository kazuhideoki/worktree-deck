import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLAUDE_INITIAL_SESSION_METADATA,
  normalizeClaudeMetadata,
  normalizeClaudeModel,
  normalizeClaudePermissionMode,
  normalizeClaudeReasoningEffort,
} from "./start-claude-initial-session.usecase";

describe("normalizeClaudeModel", () => {
  it("有効な alias はそのまま返す", () => {
    expect(normalizeClaudeModel("opus")).toBe("opus");
    expect(normalizeClaudeModel(" sonnet ")).toBe("sonnet");
  });

  it("default は選択肢として扱わず既定モデルへ丸める", () => {
    expect(normalizeClaudeModel("default")).toBe("opus");
  });

  it("未知の値は既定モデルへ丸める", () => {
    expect(normalizeClaudeModel("claude-opus-4-8")).toBe(DEFAULT_CLAUDE_INITIAL_SESSION_METADATA.model);
    expect(normalizeClaudeModel("")).toBe(DEFAULT_CLAUDE_INITIAL_SESSION_METADATA.model);
  });
});

describe("normalizeClaudePermissionMode", () => {
  it("有効な mode はそのまま返す", () => {
    expect(normalizeClaudePermissionMode("acceptEdits")).toBe("acceptEdits");
    expect(normalizeClaudePermissionMode("plan")).toBe("plan");
  });

  it("未知の値は既定 mode へ丸める", () => {
    expect(normalizeClaudePermissionMode("yolo")).toBe(DEFAULT_CLAUDE_INITIAL_SESSION_METADATA.permissionMode);
  });
});

describe("normalizeClaudeReasoningEffort", () => {
  it("有効な effort はそのまま返す", () => {
    expect(normalizeClaudeReasoningEffort("high")).toBe("high");
    expect(normalizeClaudeReasoningEffort(" max ")).toBe("max");
  });

  it("未知の値は既定 effort へ丸める", () => {
    expect(normalizeClaudeReasoningEffort("ultra")).toBe(DEFAULT_CLAUDE_INITIAL_SESSION_METADATA.reasoningEffort);
  });
});

describe("normalizeClaudeMetadata", () => {
  it("model と permissionMode を併せて正規化する", () => {
    expect(
      normalizeClaudeMetadata({ model: " opus ", reasoningEffort: "max", permissionMode: "yolo" as never }),
    ).toEqual({
      model: "opus",
      reasoningEffort: "max",
      permissionMode: DEFAULT_CLAUDE_INITIAL_SESSION_METADATA.permissionMode,
    });
  });
});
