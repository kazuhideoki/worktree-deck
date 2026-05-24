import type {
  LoadWorktreeDeckDetailsSnapshotDependencies,
  LoadWorktreeDeckInitialSnapshotDependencies,
  LoadWorktreeDeckTitlesSnapshotDependencies,
} from "../application/worktree-deck-snapshot.usecase";
import { worktreeDeckSnapshotUsecase } from "../application/worktree-deck-snapshot.usecase";
import type { WorktreeSessionFileDependencies } from "../application/worktree-session-file.usecase";
import { worktreeSessionFileUsecase } from "../application/worktree-session-file.usecase";
import type { WorktreeDeckContext } from "../application/list-worktrees.usecase";
import type { Worktree } from "../application/worktree.entity";
import type { WorktreeTitle } from "../application/worktree-title.entity";
import type { RepositoryMapping } from "../domain/repository-mapping.service";
import type { WorktreeOpenAppMeta } from "../domain/worktree-open-app.service";
import { resolveUnresolvedCodexThreadPaths } from "./worktree-deck-view-model";

/**
 * 初期描画を優先するためのタイトル更新遅延
 */
const TITLE_REFRESH_DELAY_MS = 200;

/**
 * worktree-deck の表示データ状態
 */
type WorktreeDeckDataSnapshot = {
  worktrees: Worktree[];
  listedWorktrees: Worktree[];
  isLoading: boolean;
  isTitlesLoading: boolean;
  isDetailsLoading: boolean;
  errorMessage: string | null;
  errorId: number;
  basePath: string | null;
  titlesByPath: Map<string, WorktreeTitle[]>;
  repositoryMappings: RepositoryMapping[];
  originLastCommitByPath: Map<string, string | null>;
  originBranchByPath: Map<string, string | null>;
  openAppMetaByPath: Map<string, WorktreeOpenAppMeta>;
};

/**
 * data store が利用する依存群
 */
export type WorktreeDeckDataStoreDependencies = {
  initialSnapshot: LoadWorktreeDeckInitialSnapshotDependencies;
  titlesSnapshot: LoadWorktreeDeckTitlesSnapshotDependencies;
  detailsSnapshot: LoadWorktreeDeckDetailsSnapshotDependencies;
  sessionFile: WorktreeSessionFileDependencies;
};

/**
 * data store 読み込みリクエスト
 */
export type WorktreeDeckDataStoreLoadRequest = {
  context: WorktreeDeckContext;
  displayCache: unknown;
  includeOriginEntries: boolean;
  dependencies: WorktreeDeckDataStoreDependencies;
  logTiming(label: string, elapsedMs: number): void;
  logWorktreeNames(items: Worktree[]): void;
};

/**
 * 初期 snapshot 読み込み結果
 */
type LoadedInitialSnapshot = Awaited<ReturnType<typeof worktreeDeckSnapshotUsecase.loadInitialSnapshot>>;

/**
 * data store の購読解除関数
 */
type Unsubscribe = () => void;

/**
 * worktree-deck の表示データ store
 */
type WorktreeDeckDataStore = {
  getSnapshot(): WorktreeDeckDataSnapshot;
  subscribe(listener: () => void): Unsubscribe;
  ensureLoaded(request: WorktreeDeckDataStoreLoadRequest): Promise<void>;
  reload(request: WorktreeDeckDataStoreLoadRequest): Promise<void>;
  updateOpenAppMetaByPath(path: string, meta: WorktreeOpenAppMeta): void;
};

/**
 * 初期状態を作成する
 */
function createInitialSnapshot(): WorktreeDeckDataSnapshot {
  return {
    worktrees: [],
    listedWorktrees: [],
    isLoading: true,
    isTitlesLoading: false,
    isDetailsLoading: false,
    errorMessage: null,
    errorId: 0,
    basePath: null,
    titlesByPath: new Map(),
    repositoryMappings: [],
    originLastCommitByPath: new Map(),
    originBranchByPath: new Map(),
    openAppMetaByPath: new Map(),
  };
}

/**
 * path をキーにして worktree 更新情報を既存一覧へ反映する
 */
function mergeWorktreesByPath(current: Worktree[], updates: Worktree[]): Worktree[] {
  if (updates.length === 0) {
    return current;
  }
  const updateByPath = new Map(updates.map((item) => [item.path, item]));
  return current.map((item) => {
    const update = updateByPath.get(item.path);
    if (!update) {
      return item;
    }
    return { ...item, ...update };
  });
}

/**
 * path をキーにして titleEntries だけを既存一覧へ反映する
 */
function mergeWorktreeTitlesByPath(current: Worktree[], updates: Worktree[]): Worktree[] {
  if (updates.length === 0) {
    return current;
  }
  const updateByPath = new Map(updates.map((item) => [item.path, item]));
  return current.map((item) => {
    const update = updateByPath.get(item.path);
    if (!update) {
      return item;
    }
    return { ...item, titleEntries: update.titleEntries };
  });
}

/**
 * idempotent な表示データ store を作成する
 */
export function createWorktreeDeckDataStore(): WorktreeDeckDataStore {
  let state = createInitialSnapshot();
  let hasLoadedInitialSnapshot = false;
  let loadSequence = 0;
  let requestedIncludeOriginEntries = false;
  let lastIncludeOriginEntries: boolean | null = null;
  let initialLoadPromise: Promise<void> | null = null;
  let titleLoadTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  /**
   * 現在の購読者へ状態更新を通知する
   */
  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  /**
   * 状態を immutable に更新する
   */
  const updateState = (updater: (current: WorktreeDeckDataSnapshot) => WorktreeDeckDataSnapshot): void => {
    state = updater(state);
    emit();
  };

  /**
   * 予約済みタイトル更新を取り消す
   */
  const clearScheduledTitleLoad = (): void => {
    if (titleLoadTimer === null) {
      return;
    }
    clearTimeout(titleLoadTimer);
    titleLoadTimer = null;
  };

  /**
   * 現在の表示モード要求に合わせた読み込み request を返す
   */
  const buildCurrentIncludeRequest = (request: WorktreeDeckDataStoreLoadRequest): WorktreeDeckDataStoreLoadRequest => {
    if (request.includeOriginEntries === requestedIncludeOriginEntries) {
      return request;
    }
    return {
      ...request,
      includeOriginEntries: requestedIncludeOriginEntries,
    };
  };

  /**
   * 初期 snapshot を store 状態へ反映する
   */
  const applyInitialSnapshot = (
    request: WorktreeDeckDataStoreLoadRequest,
    snapshot: LoadedInitialSnapshot,
    loadId: number,
  ): void => {
    if (loadId !== loadSequence) {
      return;
    }
    hasLoadedInitialSnapshot = true;
    lastIncludeOriginEntries = request.includeOriginEntries;
    request.logWorktreeNames(snapshot.listedWorktrees);
    updateState((current) => ({
      ...current,
      basePath: snapshot.basePath,
      worktrees: snapshot.worktrees,
      listedWorktrees: snapshot.listedWorktrees,
      repositoryMappings: snapshot.mappings,
      originLastCommitByPath: snapshot.originLastCommitByPath,
      originBranchByPath: snapshot.originBranchByPath,
      openAppMetaByPath: snapshot.openAppMetaByPath,
      titlesByPath: snapshot.titlesByPath,
      errorMessage: null,
      isLoading: false,
    }));
  };

  /**
   * 検証済みの初期 snapshot へバックグラウンド更新する
   */
  const refreshInitialSnapshotFromFreshScan = async (
    request: WorktreeDeckDataStoreLoadRequest,
    loadId: number,
  ): Promise<void> => {
    const startMs = Date.now();
    try {
      const snapshot = await worktreeDeckSnapshotUsecase.loadInitialSnapshot({
        context: request.context,
        displayCache: request.displayCache,
        dependencies: request.dependencies.initialSnapshot,
        preferCachedWorktrees: false,
        includeOriginEntries: request.includeOriginEntries,
        timingLabelPrefix: "loadWorktreesState:refresh",
        logTiming: request.logTiming,
      });
      if (loadId !== loadSequence) {
        return;
      }
      const currentRequest = buildCurrentIncludeRequest(request);
      applyInitialSnapshot(currentRequest, snapshot, loadId);
      scheduleLoadTitles(currentRequest, snapshot.listedWorktrees, snapshot.mappings, loadId);
      void loadDetails(currentRequest, snapshot.listedWorktrees, snapshot.mappings, loadId);
    } catch {
      // cache-first 後の検証失敗は次回 reload で再試行する
    } finally {
      if (loadId === loadSequence) {
        request.logTiming("loadWorktreesState:refresh", Date.now() - startMs);
      }
    }
  };

  /**
   * 初期 snapshot 読み込みを開始する
   */
  const loadInitial = async (request: WorktreeDeckDataStoreLoadRequest, force: boolean): Promise<void> => {
    requestedIncludeOriginEntries = request.includeOriginEntries;
    if (initialLoadPromise !== null) {
      return initialLoadPromise;
    }
    if (!force && hasLoadedInitialSnapshot) {
      if (request.includeOriginEntries && lastIncludeOriginEntries === false) {
        lastIncludeOriginEntries = true;
        const loadId = loadSequence;
        scheduleLoadTitles(request, state.listedWorktrees, state.repositoryMappings, loadId);
        void loadDetails(request, state.listedWorktrees, state.repositoryMappings, loadId);
      }
      return;
    }

    const loadId = loadSequence + 1;
    loadSequence = loadId;
    clearScheduledTitleLoad();
    const startMs = Date.now();
    updateState((current) => ({
      ...current,
      isLoading: true,
      isTitlesLoading: false,
      isDetailsLoading: false,
    }));

    initialLoadPromise = worktreeDeckSnapshotUsecase
      .loadInitialSnapshot({
        context: request.context,
        displayCache: request.displayCache,
        dependencies: request.dependencies.initialSnapshot,
        preferCachedWorktrees: !force,
        includeOriginEntries: request.includeOriginEntries,
        timingLabelPrefix: "loadWorktreesState",
        logTiming: request.logTiming,
      })
      .then((snapshot) => {
        if (loadId !== loadSequence) {
          return;
        }
        const currentRequest = buildCurrentIncludeRequest(request);
        applyInitialSnapshot(currentRequest, snapshot, loadId);
        scheduleLoadTitles(currentRequest, snapshot.listedWorktrees, snapshot.mappings, loadId);
        void loadDetails(currentRequest, snapshot.listedWorktrees, snapshot.mappings, loadId);
        if (snapshot.isWorktreeListCacheHit) {
          void refreshInitialSnapshotFromFreshScan(request, loadId);
          return;
        }
      })
      .catch((error: unknown) => {
        if (loadId !== loadSequence) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        updateState((current) => ({
          ...current,
          worktrees: [],
          listedWorktrees: [],
          titlesByPath: new Map(),
          repositoryMappings: [],
          originLastCommitByPath: new Map(),
          originBranchByPath: new Map(),
          openAppMetaByPath: new Map(),
          errorMessage: message,
          errorId: current.errorId + 1,
          isLoading: false,
          isDetailsLoading: false,
          isTitlesLoading: false,
        }));
      })
      .finally(() => {
        if (loadId === loadSequence) {
          request.logTiming("loadWorktreesState", Date.now() - startMs);
        }
        initialLoadPromise = null;
      });

    return initialLoadPromise;
  };

  /**
   * セッションタイトルを非同期で更新する
   */
  const loadTitles = async (
    request: WorktreeDeckDataStoreLoadRequest,
    worktrees: Worktree[],
    mappings: RepositoryMapping[],
    loadId: number,
  ): Promise<void> => {
    const startMs = Date.now();
    if (loadId !== loadSequence) {
      return;
    }
    updateState((current) => ({ ...current, isTitlesLoading: true }));
    try {
      const snapshot = await worktreeDeckSnapshotUsecase.loadTitlesSnapshot({
        context: request.context,
        worktrees,
        mappings,
        dependencies: request.dependencies.titlesSnapshot,
        includeOriginEntries: request.includeOriginEntries,
        timingLabelPrefix: "loadTitlesState",
        logTiming: request.logTiming,
      });
      if (loadId !== loadSequence) {
        return;
      }
      updateState((current) => ({
        ...current,
        titlesByPath: snapshot.titlesByPath,
        worktrees: mergeWorktreeTitlesByPath(current.worktrees, snapshot.worktrees),
      }));
    } catch {
      // タイトル取得失敗は UI を壊さない
    } finally {
      if (loadId === loadSequence) {
        updateState((current) => ({ ...current, isTitlesLoading: false }));
        request.logTiming("loadTitlesState", Date.now() - startMs);
      }
    }
  };

  /**
   * セッションタイトル更新を初期描画後へ遅延する
   */
  const scheduleLoadTitles = (
    request: WorktreeDeckDataStoreLoadRequest,
    worktrees: Worktree[],
    mappings: RepositoryMapping[],
    loadId: number,
  ): void => {
    clearScheduledTitleLoad();
    titleLoadTimer = setTimeout(() => {
      titleLoadTimer = null;
      void loadTitles(request, worktrees, mappings, loadId);
    }, TITLE_REFRESH_DELAY_MS);
  };

  /**
   * Git 状態などの詳細情報を非同期で更新する
   */
  const loadDetails = async (
    request: WorktreeDeckDataStoreLoadRequest,
    worktrees: Worktree[],
    mappings: RepositoryMapping[],
    loadId: number,
  ): Promise<void> => {
    const startMs = Date.now();
    if (loadId !== loadSequence) {
      return;
    }
    updateState((current) => ({ ...current, isDetailsLoading: true }));
    try {
      const snapshotStartMs = Date.now();
      const snapshot = await worktreeDeckSnapshotUsecase.loadDetailsSnapshot({
        worktrees,
        mappings,
        dependencies: request.dependencies.detailsSnapshot,
        includeOriginEntries: request.includeOriginEntries,
        timingLabelPrefix: "loadWorktreeDetailsState:snapshot",
        logTiming: request.logTiming,
      });
      request.logTiming("loadWorktreeDetailsState:snapshot", Date.now() - snapshotStartMs);
      if (loadId !== loadSequence) {
        return;
      }
      updateState((current) => ({
        ...current,
        repositoryMappings: snapshot.mappings,
        originLastCommitByPath: snapshot.originLastCommitByPath,
        originBranchByPath: snapshot.originBranchByPath,
        openAppMetaByPath: snapshot.openAppMetaByPath,
        worktrees: mergeWorktreesByPath(current.worktrees, snapshot.worktrees),
      }));
      void resolveMissingCodexThreadIds(request, resolveUnresolvedCodexThreadPaths(snapshot.openAppMetaByPath), loadId);
    } catch {
      // 詳細取得失敗は UI を壊さない
    } finally {
      if (loadId === loadSequence) {
        updateState((current) => ({ ...current, isDetailsLoading: false }));
        request.logTiming("loadWorktreeDetailsState", Date.now() - startMs);
      }
    }
  };

  /**
   * 未解決の Codex thread id をセッションファイルから補完する
   */
  const resolveMissingCodexThreadIds = async (
    request: WorktreeDeckDataStoreLoadRequest,
    paths: string[],
    loadId: number,
  ): Promise<void> => {
    const uniquePaths = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
    if (uniquePaths.length === 0) {
      return;
    }
    const startMs = Date.now();
    for (const path of uniquePaths) {
      if (loadId !== loadSequence) {
        return;
      }
      try {
        const resolved = await worktreeSessionFileUsecase.resolveAndSaveCodexThreadId({
          worktreePath: path,
          context: request.context,
          dependencies: request.dependencies.sessionFile,
        });
        if (resolved === null || loadId !== loadSequence) {
          continue;
        }
        updateState((current) => {
          const currentMeta = current.openAppMetaByPath.get(path);
          if (
            currentMeta === undefined ||
            currentMeta.openApp !== "codex-app" ||
            currentMeta.threadId === resolved.threadId
          ) {
            return current;
          }
          const next = new Map(current.openAppMetaByPath);
          next.set(path, { ...currentMeta, threadId: resolved.threadId });
          return { ...current, openAppMetaByPath: next };
        });
      } catch {
        // thread id 解決失敗は次回起動時に再試行する
      }
    }
    if (loadId === loadSequence) {
      request.logTiming("resolveMissingCodexThreadIds", Date.now() - startMs);
    }
  };

  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ensureLoaded(request) {
      return loadInitial(request, false);
    },
    reload(request) {
      return loadInitial(request, true);
    },
    updateOpenAppMetaByPath(path, meta) {
      const normalizedPath = path.trim();
      if (normalizedPath.length === 0) {
        return;
      }
      updateState((current) => {
        const next = new Map(current.openAppMetaByPath);
        next.set(normalizedPath, meta);
        return { ...current, openAppMetaByPath: next };
      });
    },
  };
}

/**
 * Command 間で共有する表示データ store
 */
export const worktreeDeckDataStore = createWorktreeDeckDataStore();
