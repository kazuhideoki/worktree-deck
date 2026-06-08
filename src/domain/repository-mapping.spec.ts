import { describe, expect, it } from "vitest";

import { repositoryMappingService } from "./repository-mapping.service";

describe("normalizeRepositoryMappings", () => {
  it("repoRoot重複時は後勝ちで正規化する", () => {
    const result = repositoryMappingService.normalize([
      { repoRoot: " /tmp/repo-a ", mapValue: " first " },
      { repoRoot: "", mapValue: "ignored" },
      { repoRoot: "/tmp/repo-a", mapValue: "second", branchNamePattern: " ^feat/.+ ", branchNamePrompt: " Use feat/ " },
      { repoRoot: "/tmp/repo-b" },
    ]);

    expect(result).toEqual([
      { repoRoot: "/tmp/repo-a", mapValue: "second", branchNamePattern: "^feat/.+", branchNamePrompt: "Use feat/" },
      { repoRoot: "/tmp/repo-b", mapValue: "repo-b" },
    ]);
  });
});

describe("validateRepositoryMappings", () => {
  it("branch name pattern が正規表現として有効なら成功する", () => {
    expect(
      repositoryMappingService.validate([
        { repoRoot: "/tmp/repo-a", mapValue: "Alpha", branchNamePattern: "^feat/.+" },
      ]),
    ).toEqual({ ok: true });
  });

  it("branch name pattern が正規表現として不正なら失敗する", () => {
    expect(
      repositoryMappingService.validate([{ repoRoot: "/tmp/repo-a", mapValue: "Alpha", branchNamePattern: "[" }]),
    ).toEqual({
      ok: false,
      error: "Branch name pattern must be a valid regular expression.",
    });
  });
});

describe("findRepositoryMappingByRepoRoot", () => {
  it("repoRoot が一致する mapping を返す", () => {
    expect(
      repositoryMappingService.findByRepoRoot(
        [
          { repoRoot: "/tmp/repo-a", mapValue: "Alpha" },
          { repoRoot: "/tmp/repo-b", mapValue: "Bravo" },
        ],
        "/tmp/repo-b",
      ),
    ).toEqual({ repoRoot: "/tmp/repo-b", mapValue: "Bravo" });
  });
});

describe("listRepositoryBranchNamingSuggestions", () => {
  it("現在 repo 以外の branch 命名規則を重複なしで返す", () => {
    const result = repositoryMappingService.listBranchNamingSuggestions(
      [
        {
          repoRoot: "/tmp/current",
          mapValue: "current",
          branchNamePattern: "^current/.+",
          branchNamePrompt: "Use current.",
        },
        { repoRoot: "/tmp/no-rule", mapValue: "no-rule" },
        {
          repoRoot: "/tmp/alpha",
          mapValue: "Alpha",
          branchNamePattern: "^feat/[a-z0-9-]+$",
          branchNamePrompt: "Use feat/ for product changes.",
        },
        {
          repoRoot: "/tmp/duplicate",
          mapValue: "Duplicate",
          branchNamePattern: "^feat/[a-z0-9-]+$",
          branchNamePrompt: "Use feat/ for product changes.",
        },
        {
          repoRoot: "/tmp/bravo",
          mapValue: "Bravo",
          branchNamePrompt: "Use type/short-kebab-description.",
        },
      ],
      "/tmp/current",
    );

    expect(result).toEqual([
      {
        sourceRepoRoot: "/tmp/alpha",
        sourceMapValue: "Alpha",
        branchNamePattern: "^feat/[a-z0-9-]+$",
        branchNamePrompt: "Use feat/ for product changes.",
      },
      {
        sourceRepoRoot: "/tmp/bravo",
        sourceMapValue: "Bravo",
        branchNamePrompt: "Use type/short-kebab-description.",
      },
    ]);
  });
});

describe("sortRepositoryMappings", () => {
  it("mapValueとrepoRootの順でソートする", () => {
    const result = repositoryMappingService.sort([
      { repoRoot: "/z", mapValue: "bbb" },
      { repoRoot: "/a", mapValue: "aaa" },
      { repoRoot: "/b", mapValue: "aaa" },
    ]);

    expect(result).toEqual([
      { repoRoot: "/a", mapValue: "aaa" },
      { repoRoot: "/b", mapValue: "aaa" },
      { repoRoot: "/z", mapValue: "bbb" },
    ]);
  });
});

describe("parseRepositoryMappingsFromStorageValue", () => {
  it("オブジェクト形式とJSON文字列形式を正規化して扱える", () => {
    const objectResult = repositoryMappingService.parseFromStorageValue({
      "/tmp/repo-a": "Alpha",
      "/tmp/repo-b": "",
    });
    const stringResult = repositoryMappingService.parseFromStorageValue(
      JSON.stringify([{ repoRoot: "/tmp/repo-c", mapValue: "Charlie" }]),
    );

    expect(objectResult).toEqual([
      { repoRoot: "/tmp/repo-a", mapValue: "Alpha" },
      { repoRoot: "/tmp/repo-b", mapValue: "repo-b" },
    ]);
    expect(stringResult).toEqual([{ repoRoot: "/tmp/repo-c", mapValue: "Charlie" }]);
  });
});
