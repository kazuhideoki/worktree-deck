import { describe, expect, it, vi } from "vitest";

import { createGenerateWorktreeBranchNameDependencies } from "./generate-worktree-branch-name-dependencies";

describe("createGenerateWorktreeBranchNameDependencies", () => {
  it("generateBranchName を infra に委譲する", async () => {
    const request = {
      repoRoot: "/repos/app-a",
      prompt: "Generate branch",
    };
    const generateBranchNameWithCodexExec = vi.fn(async () => "fix/focus-edge");
    const loadRepositoryMappings = vi.fn(async () => []);
    const dependencies = createGenerateWorktreeBranchNameDependencies({
      generateBranchNameWithCodexExec,
      loadRepositoryMappings,
    });

    const result = await dependencies.generateBranchName(request);

    expect(generateBranchNameWithCodexExec).toHaveBeenCalledWith(request);
    expect(result).toBe("fix/focus-edge");
  });

  it("loadRepositoryMappings を infra に委譲する", async () => {
    const loadRepositoryMappings = vi.fn(async () => [{ repoRoot: "/repos/app-a", mapValue: "app-a" }]);
    const dependencies = createGenerateWorktreeBranchNameDependencies({
      generateBranchNameWithCodexExec: vi.fn(async () => "fix/focus-edge"),
      loadRepositoryMappings,
    });

    const result = await dependencies.loadRepositoryMappings();

    expect(loadRepositoryMappings).toHaveBeenCalledWith();
    expect(result).toEqual([{ repoRoot: "/repos/app-a", mapValue: "app-a" }]);
  });
});
