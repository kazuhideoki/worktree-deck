import { describe, expect, it } from "vitest";

import {
  applyRepositoryBranchNamingSuggestionToDraft,
  resolveRepositoryBranchNamingSuggestions,
  resolveRepositoryMappingFormDraft,
  resolveRepositoryMappingFormReturnToRoot,
  shouldAutoOpenRepositoryMappingForm,
} from "./repository-mapping-manager";

describe("shouldAutoOpenRepositoryMappingForm", () => {
  it("初回用の manager で読み込み完了後に mapping が空なら追加フォームを自動表示する", () => {
    expect(
      shouldAutoOpenRepositoryMappingForm({
        autoOpenAddForm: true,
        hasAutoOpened: false,
        isLoading: false,
        errorMessage: null,
        mappingCount: 0,
      }),
    ).toBe(true);
  });

  it("通常の manager・再表示済み・読み込み中・エラー中・設定済みでは自動表示しない", () => {
    expect(
      shouldAutoOpenRepositoryMappingForm({
        autoOpenAddForm: false,
        hasAutoOpened: false,
        isLoading: false,
        errorMessage: null,
        mappingCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldAutoOpenRepositoryMappingForm({
        autoOpenAddForm: true,
        hasAutoOpened: true,
        isLoading: false,
        errorMessage: null,
        mappingCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldAutoOpenRepositoryMappingForm({
        autoOpenAddForm: true,
        hasAutoOpened: false,
        isLoading: true,
        errorMessage: null,
        mappingCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldAutoOpenRepositoryMappingForm({
        autoOpenAddForm: true,
        hasAutoOpened: false,
        isLoading: false,
        errorMessage: "failed",
        mappingCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldAutoOpenRepositoryMappingForm({
        autoOpenAddForm: true,
        hasAutoOpened: false,
        isLoading: false,
        errorMessage: null,
        mappingCount: 1,
      }),
    ).toBe(false);
  });
});

describe("resolveRepositoryMappingFormReturnToRoot", () => {
  it("初回用の manager から開いた追加フォームは保存後に root へ戻す", () => {
    expect(resolveRepositoryMappingFormReturnToRoot(true)).toBe(true);
  });

  it("通常の manager から開いた追加フォームは保存後に manager へ戻す", () => {
    expect(resolveRepositoryMappingFormReturnToRoot(false)).toBe(false);
  });
});

describe("resolveRepositoryBranchNamingSuggestions", () => {
  it("repository mapping から現在 repo 以外の branch 命名規則候補を返す", () => {
    expect(
      resolveRepositoryBranchNamingSuggestions({
        currentRepoRoot: "/repos/current",
        mappings: [
          { repoRoot: "/repos/current", mapValue: "current", branchNamePattern: "^current/.+" },
          {
            repoRoot: "/repos/app",
            mapValue: "app",
            branchNamePattern: "^feature/[a-z0-9-]+$",
            branchNamePrompt: "Use feature/ for product changes.",
          },
        ],
      }),
    ).toEqual([
      {
        sourceRepoRoot: "/repos/app",
        sourceMapValue: "app",
        branchNamePattern: "^feature/[a-z0-9-]+$",
        branchNamePrompt: "Use feature/ for product changes.",
      },
    ]);
  });
});

describe("resolveRepositoryMappingFormDraft", () => {
  it("mapping からフォーム入力値を初期化する", () => {
    expect(
      resolveRepositoryMappingFormDraft({
        repoRoot: "/repos/app",
        mapValue: "app",
        branchNamePattern: "^feat/.+",
        branchNamePrompt: "Use feat/.",
      }),
    ).toEqual({
      repoRoot: "/repos/app",
      mapValue: "app",
      branchNamePattern: "^feat/.+",
      branchNamePrompt: "Use feat/.",
    });
  });

  it("新規作成時は空文字で初期化する", () => {
    expect(resolveRepositoryMappingFormDraft()).toEqual({
      repoRoot: "",
      mapValue: "",
      branchNamePattern: "",
      branchNamePrompt: "",
    });
  });
});

describe("applyRepositoryBranchNamingSuggestionToDraft", () => {
  it("branch 命名規則候補を反映して入力中の repository path と map value は保持する", () => {
    expect(
      applyRepositoryBranchNamingSuggestionToDraft(
        {
          repoRoot: "/repos/new-app",
          mapValue: "new-app",
          branchNamePattern: "",
          branchNamePrompt: "",
        },
        {
          sourceRepoRoot: "/repos/source",
          sourceMapValue: "source",
          branchNamePattern: "^feature/[a-z0-9-]+$",
          branchNamePrompt: "Use feature/.",
        },
      ),
    ).toEqual({
      repoRoot: "/repos/new-app",
      mapValue: "new-app",
      branchNamePattern: "^feature/[a-z0-9-]+$",
      branchNamePrompt: "Use feature/.",
    });
  });
});
