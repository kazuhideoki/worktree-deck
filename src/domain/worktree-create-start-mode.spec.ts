import { describe, expect, it } from "vitest";

import { worktreeCreateStartModeService } from "./worktree-create-start-mode.service";

describe("worktreeCreateStartModeService", () => {
  it("開始モード値を正規化する", () => {
    expect(worktreeCreateStartModeService.normalizeStartMode("auto-start")).toBe("auto-start");
    expect(worktreeCreateStartModeService.normalizeStartMode("manual")).toBe("manual");
    expect(worktreeCreateStartModeService.normalizeStartMode("unknown")).toBeNull();
  });

  it("未保存時は Auto Start を既定にする", () => {
    expect(worktreeCreateStartModeService.resolveDefault(null)).toBe("auto-start");
  });

  it("開始モードの選択肢を返す", () => {
    expect(worktreeCreateStartModeService.listStartModeOptions()).toEqual([
      { value: "auto-start", title: "Auto Start" },
      { value: "manual", title: "Manual" },
    ]);
  });
});
