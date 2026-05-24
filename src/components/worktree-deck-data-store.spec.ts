import { describe, expect, it, vi } from "vitest";

import type { WorktreeDeckContext } from "../application/list-worktrees.usecase";
import type { Worktree } from "../application/worktree.entity";
import type { WorktreeDeckDataStoreLoadRequest } from "./worktree-deck-data-store";
import { createWorktreeDeckDataStore } from "./worktree-deck-data-store";

type ListWorktreesResultForTest = Awaited<
  ReturnType<WorktreeDeckDataStoreLoadRequest["dependencies"]["initialSnapshot"]["listWorktrees"]>
>;

/**
 * 任意タイミングで解決できる Promise を作る
 */
function createDeferred<TValue>(): {
  promise: Promise<TValue>;
  resolve(value: TValue): void;
  reject(error: unknown): void;
} {
  let resolveValue: (value: TValue) => void = () => undefined;
  let rejectValue: (error: unknown) => void = () => undefined;
  const promise = new Promise<TValue>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });
  return {
    promise,
    resolve: resolveValue,
    reject: rejectValue,
  };
}

/**
 * テスト用の実行コンテキストを作る
 */
function buildContext(): WorktreeDeckContext {
  return {
    env: {},
    cwd: "/repo",
    homeDir: "/Users/tester",
    assetsPath: "/assets",
    packageDir: "/package",
    packageName: "worktree-deck",
  };
}

/**
 * テスト用 worktree を作る
 */
function buildWorktree(path: string): Worktree {
  return {
    repo: "repo",
    branch: "feature/a",
    path,
    originPath: "/repo",
  };
}

/**
 * 非同期の後続タスクを進める
 */
async function flushAsyncTasks(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * store 読み込みリクエストを作る
 */
function buildRequest(
  args: {
    listWorktrees?: WorktreeDeckDataStoreLoadRequest["dependencies"]["initialSnapshot"]["listWorktrees"];
  } = {},
): WorktreeDeckDataStoreLoadRequest {
  const worktree = buildWorktree("/worktrees/repo~_~feature-a");
  const listWorktrees =
    args.listWorktrees ??
    vi.fn(async () => ({
      basePath: "/worktrees",
      delimiter: "~_~",
      mappings: [{ repoRoot: "/repo", mapValue: "repo" }],
      worktrees: [worktree],
    }));

  return {
    context: buildContext(),
    displayCache: null,
    dependencies: {
      initialSnapshot: {
        listWorktrees,
        restoreDisplayCache: vi.fn((input) => ({
          worktrees: input.worktrees,
          titlesByPath: new Map(),
          originLastCommitByPath: new Map(),
          originBranchByPath: new Map(),
          openAppMetaByPath: new Map(),
        })),
        loadOpenAppMetaByWorktreePath: vi.fn(async () => new Map()),
      },
      titlesSnapshot: {
        loadTitlesForPaths: vi.fn(async () => new Map()),
        attachWorktreeTitles: vi.fn(async (input) => input.worktrees),
      },
      detailsSnapshot: {
        loadLastCommitAtByPath: vi.fn(async () => new Map()),
        loadCurrentBranchByPath: vi.fn(async () => new Map()),
        loadBaseRefByWorktreePath: vi.fn(async () => new Map()),
        loadOpenAppMetaByWorktreePath: vi.fn(async () => new Map()),
        loadWorktreeMetadata: vi.fn(async (items) => items),
        loadAheadBehindCounts: vi.fn(async () => null),
        resolveMergeTargetRef: vi.fn(async () => null),
      },
      sessionFile: {
        findFirstSessionFileByPath: vi.fn(async () => null),
        findLatestSessionFileByPath: vi.fn(async () => null),
        saveCodexThreadIdForWorktreePath: vi.fn(async () => undefined),
        openPathInZedClassic: vi.fn(async () => undefined),
        loadLatestSessionMessages: vi.fn(async () => []),
        loadSessionMessages: vi.fn(async () => []),
      },
    },
    logTiming: vi.fn(),
    logWorktreeNames: vi.fn(),
  };
}

describe("createWorktreeDeckDataStore", () => {
  it("ensureLoaded の同時呼び出しでは初期 snapshot 読み込みを共有する", async () => {
    const store = createWorktreeDeckDataStore();
    const deferred = createDeferred<ListWorktreesResultForTest>();
    const listWorktrees = vi.fn(() => deferred.promise);
    const request = buildRequest({ listWorktrees });

    const first = store.ensureLoaded(request);
    const second = store.ensureLoaded(request);

    expect(listWorktrees).toHaveBeenCalledTimes(1);

    deferred.resolve({
      basePath: "/worktrees",
      delimiter: "~_~",
      mappings: [{ repoRoot: "/repo", mapValue: "repo" }],
      worktrees: [buildWorktree("/worktrees/repo~_~feature-a")],
    });
    await Promise.all([first, second]);

    expect(store.getSnapshot().isLoading).toBe(false);
    expect(store.getSnapshot().worktrees).toHaveLength(1);
    expect(request.logTiming).toHaveBeenCalledWith("loadWorktreesState:listWorktrees", expect.any(Number));
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadWorktreesState:restoreDisplayCache(worktrees=1)",
      expect.any(Number),
    );
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadWorktreesState:loadOpenAppMetaByWorktreePath(paths=2)",
      expect.any(Number),
    );
    expect(request.logTiming).toHaveBeenCalledWith("loadWorktreesState", expect.any(Number));
  });

  it("読み込み済みの ensureLoaded では初期 snapshot を再取得しない", async () => {
    const store = createWorktreeDeckDataStore();
    const request = buildRequest();
    const listWorktrees = vi.mocked(request.dependencies.initialSnapshot.listWorktrees);

    await store.ensureLoaded(request);
    await store.ensureLoaded(request);

    expect(listWorktrees).toHaveBeenCalledTimes(1);
  });

  it("reload では初期 snapshot を明示的に再取得する", async () => {
    const store = createWorktreeDeckDataStore();
    const request = buildRequest();
    const listWorktrees = vi.mocked(request.dependencies.initialSnapshot.listWorktrees);

    await store.ensureLoaded(request);
    await store.reload(request);

    expect(listWorktrees).toHaveBeenCalledTimes(2);
  });

  it("タイトルと詳細の後続ロードを store 状態へ反映する", async () => {
    const store = createWorktreeDeckDataStore();
    const request = buildRequest();
    const titleEntry = {
      title: "Loaded session",
      status: "working" as const,
      latestMessage: null,
      updatedAt: 1,
      sessionKind: "main" as const,
    };
    vi.mocked(request.dependencies.titlesSnapshot.loadTitlesForPaths).mockResolvedValueOnce(
      new Map([["/worktrees/repo~_~feature-a", [titleEntry]]]),
    );
    vi.mocked(request.dependencies.titlesSnapshot.attachWorktreeTitles).mockResolvedValueOnce([
      { ...buildWorktree("/worktrees/repo~_~feature-a"), titleEntries: [titleEntry] },
    ]);
    vi.mocked(request.dependencies.detailsSnapshot.loadWorktreeMetadata).mockResolvedValueOnce([
      { ...buildWorktree("/worktrees/repo~_~feature-a"), mergeStatus: "synced", lastCommitAt: "2026-05-24 10:00" },
    ]);

    await store.ensureLoaded(request);
    await flushAsyncTasks();

    const snapshot = store.getSnapshot();
    expect(snapshot.titlesByPath.get("/worktrees/repo~_~feature-a")).toEqual([titleEntry]);
    expect(snapshot.worktrees[0]?.titleEntries).toEqual([titleEntry]);
    expect(snapshot.worktrees[0]?.mergeStatus).toBe("synced");
    expect(snapshot.worktrees[0]?.lastCommitAt).toBe("2026-05-24 10:00");
    expect(request.logTiming).toHaveBeenCalledWith("loadTitlesState:loadTitlesForPaths(paths=2)", expect.any(Number));
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadTitlesState:attachWorktreeTitles(worktrees=1)",
      expect.any(Number),
    );
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadWorktreeDetailsState:snapshot:loadLastCommitAtByPath(paths=1)",
      expect.any(Number),
    );
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadWorktreeDetailsState:snapshot:loadCurrentBranchByPath(paths=1)",
      expect.any(Number),
    );
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadWorktreeDetailsState:snapshot:loadBaseRefByWorktreePath(paths=1)",
      expect.any(Number),
    );
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadWorktreeDetailsState:snapshot:loadOpenAppMetaByWorktreePath(paths=2)",
      expect.any(Number),
    );
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadWorktreeDetailsState:snapshot:loadWorktreeMetadata(worktrees=1)",
      expect.any(Number),
    );
    expect(request.logTiming).toHaveBeenCalledWith(
      "loadWorktreeDetailsState:snapshot:attachWorktreeBaseDiffs(worktrees=1)",
      expect.any(Number),
    );
  });
});
