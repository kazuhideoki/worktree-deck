import { describe, expect, it } from "vitest";

import type { WorktreeTitle } from "./application/worktree-title.entity";
import { mergeTitlesByPath } from "./composition-root";

/**
 * provider 統合テスト用のタイトルを組み立てる
 */
function buildTitle(args: Partial<WorktreeTitle> & Pick<WorktreeTitle, "title" | "updatedAt">): WorktreeTitle {
  return {
    status: "done",
    latestMessage: null,
    sessionKind: "main",
    ...args,
  };
}

describe("mergeTitlesByPath", () => {
  it("同じ session ID の生成タイトルと Claude セッションを1件へ統合する", () => {
    const path = "/worktree/repo";
    const sessionThreadId = "019dd94f-27e0-7ad1-8d17-3d628ac5d16b";
    const generated = buildTitle({
      title: "生成されたタイトル",
      updatedAt: 200,
      sessionThreadId,
    });
    const claude = buildTitle({
      title: "エージェントが更新したタイトル",
      updatedAt: 100,
      sessionThreadId,
      provider: "cc",
    });

    const result = mergeTitlesByPath(new Map([[path, [generated]]]), new Map([[path, [claude]]]));

    expect(result.get(path)).toEqual([claude]);
  });
});
