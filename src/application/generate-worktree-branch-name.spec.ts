import { describe, expect, it, vi } from "vitest";

import {
  generateWorktreeBranchNameUsecase,
  type GenerateWorktreeBranchNameDependencies,
} from "./generate-worktree-branch-name.usecase";

/**
 * テスト用依存ポートを作成する
 */
function buildDependencies(): GenerateWorktreeBranchNameDependencies {
  return {
    generateBranchName: vi.fn(async () => "fix/focus-edge"),
    loadRepositoryMappings: vi.fn(async () => []),
  };
}

describe("generate", () => {
  it("Codex 生成結果を branch 名として返す", async () => {
    const dependencies = buildDependencies();

    const result = await generateWorktreeBranchNameUsecase.generate({
      command: {
        repoRoot: "/repos/app-a",
        initialPrompt: "Fix focus handling",
      },
      dependencies,
    });

    expect(dependencies.generateBranchName).toHaveBeenCalledWith({
      repoRoot: "/repos/app-a",
      prompt: expect.stringContaining("Fix focus handling"),
    });
    expect(result).toEqual({ branch: "fix/focus-edge" });
  });

  it("repository 別の追加プロンプトと正規表現を使って branch 名を生成する", async () => {
    const dependencies = buildDependencies();
    vi.mocked(dependencies.loadRepositoryMappings).mockResolvedValue([
      {
        repoRoot: "/repos/app-a",
        mapValue: "app-a",
        branchNamePattern: "^feat/[a-z0-9-]+$",
        branchNamePrompt: "Use feat/ for new behavior.",
      },
    ]);
    vi.mocked(dependencies.generateBranchName).mockResolvedValue("feat/focus-edge");

    const result = await generateWorktreeBranchNameUsecase.generate({
      command: {
        repoRoot: "/repos/app-a",
        initialPrompt: "Add focus handling",
      },
      dependencies,
    });

    expect(dependencies.generateBranchName).toHaveBeenCalledWith({
      repoRoot: "/repos/app-a",
      prompt: expect.stringContaining("^feat/[a-z0-9-]+$"),
    });
    expect(vi.mocked(dependencies.generateBranchName).mock.calls[0]?.[0].prompt).toContain(
      "Use feat/ for new behavior.",
    );
    expect(result).toEqual({ branch: "feat/focus-edge" });
  });

  it("正規表現に一致しない生成結果は最大3回まで再生成する", async () => {
    const dependencies = buildDependencies();
    vi.mocked(dependencies.loadRepositoryMappings).mockResolvedValue([
      {
        repoRoot: "/repos/app-a",
        mapValue: "app-a",
        branchNamePattern: "^feat/[a-z0-9-]+$",
      },
    ]);
    vi.mocked(dependencies.generateBranchName)
      .mockResolvedValueOnce("fix/focus-edge")
      .mockResolvedValueOnce("chore/focus-edge")
      .mockResolvedValueOnce("feat/focus-edge");

    const result = await generateWorktreeBranchNameUsecase.generate({
      command: {
        repoRoot: "/repos/app-a",
        initialPrompt: "Add focus handling",
      },
      dependencies,
    });

    expect(dependencies.generateBranchName).toHaveBeenCalledTimes(3);
    expect(vi.mocked(dependencies.generateBranchName).mock.calls[1]?.[0].prompt).toContain("fix/focus-edge");
    expect(result).toEqual({ branch: "feat/focus-edge" });
  });

  it("3回とも正規表現に一致しなければ英語エラーで失敗する", async () => {
    const dependencies = buildDependencies();
    vi.mocked(dependencies.loadRepositoryMappings).mockResolvedValue([
      {
        repoRoot: "/repos/app-a",
        mapValue: "app-a",
        branchNamePattern: "^feat/[a-z0-9-]+$",
      },
    ]);
    vi.mocked(dependencies.generateBranchName).mockResolvedValue("fix/focus-edge");

    await expect(
      generateWorktreeBranchNameUsecase.generate({
        command: {
          repoRoot: "/repos/app-a",
          initialPrompt: "Add focus handling",
        },
        dependencies,
      }),
    ).rejects.toThrow("Generated branch name does not match pattern");
    expect(dependencies.generateBranchName).toHaveBeenCalledTimes(3);
  });

  it("repository が空なら英語エラーで失敗する", async () => {
    const dependencies = buildDependencies();

    await expect(
      generateWorktreeBranchNameUsecase.generate({
        command: {
          repoRoot: "  ",
          initialPrompt: "Fix focus handling",
        },
        dependencies,
      }),
    ).rejects.toThrow("Repository is required.");
  });
});
