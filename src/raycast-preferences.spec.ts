import { describe, expect, it } from "vitest";

import { buildPreferenceEnv } from "./raycast-preferences";

describe("raycast-preferences", () => {
  it("Raycast Preferences の空値を除外して env 互換値へ変換する", () => {
    const result = buildPreferenceEnv({
      GIT_WORKTREE_PATH: " ~/.worktree-deck/worktrees ",
      CODEX_HOME: "  ",
      WORKTREE_DECK_SEARCH_DAYS: "30",
    });

    expect(result).toEqual({
      GIT_WORKTREE_PATH: "~/.worktree-deck/worktrees",
      WORKTREE_DECK_SEARCH_DAYS: "30",
    });
  });
});
