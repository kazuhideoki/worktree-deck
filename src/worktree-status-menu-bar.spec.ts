import { describe, expect, it, vi } from "vitest";

import type { ListWorktreesResult } from "./application/list-worktrees.usecase";
import type { WorktreeTitle } from "./application/worktree-title.entity";

const raycastMocks = vi.hoisted(() => {
  return {
    localStorageGetItem: vi.fn<() => Promise<string | null>>(),
    localStorageSetItem: vi.fn<(_key: string, _value: string) => Promise<void>>(),
  };
});

vi.mock("@raycast/api", () => {
  return {
    Color: {
      Blue: "blue",
      Green: "green",
      Red: "red",
      Yellow: "yellow",
    },
    Icon: new Proxy(
      {},
      {
        get: () => "icon",
      },
    ),
    LocalStorage: {
      getItem: raycastMocks.localStorageGetItem,
      setItem: raycastMocks.localStorageSetItem,
    },
    MenuBarExtra: Object.assign(
      vi.fn(() => null),
      {
        Item: vi.fn(() => null),
        Section: vi.fn(() => null),
      },
    ),
    environment: { assetsPath: "/assets" },
    getPreferenceValues: vi.fn(() => ({})),
    openExtensionPreferences: vi.fn(),
  };
});

import {
  loadStoredWorktreeMenuBarSummary,
  loadWorktreeMenuBarSummaryWithDependencies,
  normalizeStoredWorktreeMenuBarSummary,
  saveStoredWorktreeMenuBarSummary,
  type WorktreeMenuBarSummarySnapshot,
} from "./worktree-status-menu-bar";

/**
 * テスト用セッションタイトルを作成する
 */
function buildTitle(args: { status: WorktreeTitle["status"]; isWaitingForUser?: boolean }): WorktreeTitle {
  return {
    title: "session",
    latestMessage: null,
    updatedAt: 100,
    status: args.status,
    sessionKind: "main",
    isWaitingForUser: args.isWaitingForUser,
  };
}

describe("loadWorktreeMenuBarSummaryWithDependencies", () => {
  it("キャッシュではなく実値を取得してメニューバー状態を保存する", async () => {
    const listed: ListWorktreesResult = {
      basePath: "/base",
      mappings: [],
      worktrees: [
        { repo: "repo", path: "/worktree/done", branch: "done" },
        { repo: "repo", path: "/worktree/working", branch: "working" },
        { repo: "repo", path: "/worktree/waiting", branch: "waiting" },
      ],
      isCacheHit: false,
    };
    const listWorktrees = vi.fn(async () => listed);
    const loadTitlesForPaths = vi.fn(async () => {
      return new Map<string, WorktreeTitle[]>([
        ["/worktree/done", [buildTitle({ status: "done" })]],
        ["/worktree/working", [buildTitle({ status: "working" })]],
        ["/worktree/waiting", [buildTitle({ status: "working", isWaitingForUser: true })]],
      ]);
    });
    const saveLastSummary = vi.fn<(_snapshot: WorktreeMenuBarSummarySnapshot) => Promise<void>>(async () => undefined);

    const result = await loadWorktreeMenuBarSummaryWithDependencies({
      dependencies: {
        listWorktrees,
        loadTitlesForPaths,
        saveLastSummary,
      },
    });

    expect(listWorktrees).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { preferCache: false },
      }),
    );
    expect(result).toEqual({
      summary: { blue: 1, green: 1, yellow: 1 },
      total: 3,
    });
    expect(saveLastSummary).toHaveBeenCalledWith(result);
  });
});

describe("stored worktree menu bar summary", () => {
  it("直近正常値を Raycast LocalStorage に保存して復元する", async () => {
    const snapshot: WorktreeMenuBarSummarySnapshot = {
      summary: { blue: 2, green: 3, yellow: 1 },
      total: 6,
    };
    raycastMocks.localStorageSetItem.mockResolvedValue();

    await saveStoredWorktreeMenuBarSummary(snapshot);

    const storedValue = raycastMocks.localStorageSetItem.mock.calls[0]?.[1] ?? "";
    raycastMocks.localStorageGetItem.mockResolvedValue(storedValue);
    await expect(loadStoredWorktreeMenuBarSummary()).resolves.toEqual(snapshot);
  });

  it("不正な保存値は復元しない", () => {
    expect(normalizeStoredWorktreeMenuBarSummary({ summary: { blue: 1, green: 0 }, total: 1 })).toBeNull();
    expect(normalizeStoredWorktreeMenuBarSummary({ summary: { blue: 1, green: 0, yellow: 0 }, total: "1" })).toBeNull();
  });
});
