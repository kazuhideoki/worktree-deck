import type { RepositoryMapping } from "../domain/repository-mapping.service";
import type { WorktreeOpenAppMeta } from "../domain/worktree-open-app.service";
import type { ListWorktreesResult, WorktreeDeckContext } from "./list-worktrees.usecase";
import type { Worktree } from "./worktree.entity";
import type { WorktreeTitle } from "./worktree-title.entity";
export type { WorktreeTitle };

/**
 * 表示キャッシュ適用後の一覧状態
 */
export type RestoredWorktreeDeckSnapshot = {
  worktrees: Worktree[];
  titlesByPath: Map<string, WorktreeTitle[]>;
  originLastCommitByPath: Map<string, string | null>;
  originBranchByPath: Map<string, string | null>;
  openAppMetaByPath: Map<string, WorktreeOpenAppMeta>;
};

/**
 * 初期 snapshot 読み込みの依存ポート
 */
export type LoadWorktreeDeckInitialSnapshotDependencies = {
  listWorktrees(context: WorktreeDeckContext): Promise<ListWorktreesResult>;
  restoreDisplayCache(args: {
    worktrees: Worktree[];
    mappings: RepositoryMapping[];
    displayCache: unknown;
  }): RestoredWorktreeDeckSnapshot;
  loadOpenAppMetaByWorktreePath(paths: string[]): Promise<Map<string, WorktreeOpenAppMeta>>;
};

/**
 * 初期 snapshot 読み込み結果
 */
type WorktreeDeckInitialSnapshot = {
  basePath: string;
  delimiter: string;
  mappings: RepositoryMapping[];
  listedWorktrees: Worktree[];
  worktrees: Worktree[];
  titlesByPath: Map<string, WorktreeTitle[]>;
  originLastCommitByPath: Map<string, string | null>;
  originBranchByPath: Map<string, string | null>;
  openAppMetaByPath: Map<string, WorktreeOpenAppMeta>;
};

/**
 * タイトル snapshot 読み込みの依存ポート
 */
export type LoadWorktreeDeckTitlesSnapshotDependencies = {
  loadTitlesForPaths(args: {
    paths: string[];
    env: NodeJS.ProcessEnv;
    cwd: string;
    homeDir: string | null;
    assetsPath: string;
    packageDir: string;
    packageName: string;
  }): Promise<Map<string, WorktreeTitle[]>>;
  attachWorktreeTitles(args: {
    worktrees: Worktree[];
    env: NodeJS.ProcessEnv;
    cwd: string;
    homeDir: string | null;
    assetsPath: string;
    packageDir: string;
    packageName: string;
    titlesByPath: Map<string, WorktreeTitle[]>;
  }): Promise<Worktree[]>;
};

/**
 * タイトル snapshot 読み込み結果
 */
type WorktreeDeckTitlesSnapshot = {
  titlesByPath: Map<string, WorktreeTitle[]>;
  worktrees: Worktree[];
};

/**
 * 詳細 snapshot 読み込みの依存ポート
 */
export type LoadWorktreeDeckDetailsSnapshotDependencies = {
  loadLastCommitAtByPath(paths: string[]): Promise<Map<string, string | null>>;
  loadCurrentBranchByPath(paths: string[]): Promise<Map<string, string | null>>;
  loadBaseRefByWorktreePath(paths: string[]): Promise<Map<string, string>>;
  loadOpenAppMetaByWorktreePath(paths: string[]): Promise<Map<string, WorktreeOpenAppMeta>>;
  loadWorktreeMetadata(worktrees: Worktree[], options: { baseRefByPath: Map<string, string> }): Promise<Worktree[]>;
  loadAheadBehindCounts(args: {
    worktreePath: string;
    baseRef: string;
  }): Promise<{ aheadCount: number; behindCount: number } | null>;
  resolveMergeTargetRef(worktreePath: string): Promise<string | null>;
};

/**
 * 詳細 snapshot 読み込み結果
 */
type WorktreeDeckDetailsSnapshot = {
  mappings: RepositoryMapping[];
  originLastCommitByPath: Map<string, string | null>;
  originBranchByPath: Map<string, string | null>;
  openAppMetaByPath: Map<string, WorktreeOpenAppMeta>;
  worktrees: Worktree[];
};

/**
 * worktree と mapping から重複なしの表示対象パスを返す
 */
function collectDisplayPaths(args: { worktrees: Worktree[]; mappings: RepositoryMapping[] }): string[] {
  const paths = new Set<string>();
  for (const item of args.worktrees) {
    paths.add(item.path);
    if (item.originPath != null && item.originPath.length > 0) {
      paths.add(item.originPath);
    }
  }
  for (const mapping of args.mappings) {
    if (mapping.repoRoot != null && mapping.repoRoot.length > 0) {
      paths.add(mapping.repoRoot);
    }
  }
  return Array.from(paths);
}

/**
 * worktree と mapping から重複なしの origin パスを返す
 */
function collectOriginPaths(args: { worktrees: Worktree[]; mappings: RepositoryMapping[] }): string[] {
  const paths = new Set<string>();
  for (const item of args.worktrees) {
    if (item.originPath != null && item.originPath.length > 0) {
      paths.add(item.originPath);
    }
  }
  for (const mapping of args.mappings) {
    if (mapping.repoRoot != null && mapping.repoRoot.length > 0) {
      paths.add(mapping.repoRoot);
    }
  }
  return Array.from(paths);
}

/**
 * 初期一覧 snapshot を読み込む
 */
async function loadInitialSnapshot(args: {
  context: WorktreeDeckContext;
  displayCache: unknown;
  dependencies: LoadWorktreeDeckInitialSnapshotDependencies;
}): Promise<WorktreeDeckInitialSnapshot> {
  const listed = await args.dependencies.listWorktrees(args.context);
  const restored = args.dependencies.restoreDisplayCache({
    worktrees: listed.worktrees,
    mappings: listed.mappings,
    displayCache: args.displayCache,
  });
  let openAppMetaByPath = restored.openAppMetaByPath;
  try {
    openAppMetaByPath = await args.dependencies.loadOpenAppMetaByWorktreePath(
      collectDisplayPaths({ worktrees: listed.worktrees, mappings: listed.mappings }),
    );
  } catch {
    // 起動アプリ設定の先読み失敗時は表示キャッシュを利用する
  }
  return {
    basePath: listed.basePath,
    delimiter: listed.delimiter,
    mappings: listed.mappings,
    listedWorktrees: listed.worktrees,
    worktrees: restored.worktrees,
    titlesByPath: restored.titlesByPath,
    originLastCommitByPath: restored.originLastCommitByPath,
    originBranchByPath: restored.originBranchByPath,
    openAppMetaByPath,
  };
}

/**
 * セッションタイトル snapshot を読み込む
 */
async function loadTitlesSnapshot(args: {
  context: WorktreeDeckContext;
  worktrees: Worktree[];
  mappings: RepositoryMapping[];
  dependencies: LoadWorktreeDeckTitlesSnapshotDependencies;
}): Promise<WorktreeDeckTitlesSnapshot> {
  let titlesByPath = new Map<string, WorktreeTitle[]>();
  try {
    titlesByPath = await args.dependencies.loadTitlesForPaths({
      paths: collectDisplayPaths({ worktrees: args.worktrees, mappings: args.mappings }),
      env: args.context.env,
      cwd: args.context.cwd,
      homeDir: args.context.homeDir,
      assetsPath: args.context.assetsPath,
      packageDir: args.context.packageDir,
      packageName: args.context.packageName,
    });
  } catch {
    titlesByPath = new Map();
  }
  const worktrees = await args.dependencies.attachWorktreeTitles({
    worktrees: args.worktrees,
    env: args.context.env,
    cwd: args.context.cwd,
    homeDir: args.context.homeDir,
    assetsPath: args.context.assetsPath,
    packageDir: args.context.packageDir,
    packageName: args.context.packageName,
    titlesByPath,
  });
  return { titlesByPath, worktrees };
}

/**
 * baseRef と ahead/behind 情報を付与する
 */
async function attachWorktreeBaseDiffs(args: {
  worktrees: Worktree[];
  baseRefByPath: Map<string, string>;
  dependencies: Pick<LoadWorktreeDeckDetailsSnapshotDependencies, "loadAheadBehindCounts" | "resolveMergeTargetRef">;
}): Promise<Worktree[]> {
  return Promise.all(
    args.worktrees.map(async (item) => {
      const storedBaseRef = args.baseRefByPath.get(item.path) ?? null;
      if (item.mergeStatus === "dirty") {
        const resolvedBaseRef =
          item.baseRef ?? storedBaseRef ?? (await args.dependencies.resolveMergeTargetRef(item.path));
        return {
          ...item,
          baseRef: resolvedBaseRef,
          aheadCount: null,
          behindCount: null,
        };
      }
      const resolved = await resolveBaseRefWithCounts({
        worktreePath: item.path,
        baseRef: item.baseRef ?? storedBaseRef,
        storedBaseRef,
        dependencies: args.dependencies,
      });
      return {
        ...item,
        baseRef: resolved.baseRef,
        aheadCount: resolved.aheadCount,
        behindCount: resolved.behindCount,
      };
    }),
  );
}

/**
 * baseRef を優先して差分情報を取得する
 */
async function resolveBaseRefWithCounts(args: {
  worktreePath: string;
  baseRef: string | null;
  storedBaseRef: string | null;
  dependencies: Pick<LoadWorktreeDeckDetailsSnapshotDependencies, "loadAheadBehindCounts" | "resolveMergeTargetRef">;
}): Promise<{ baseRef: string | null; aheadCount: number | null; behindCount: number | null }> {
  const resolvedBaseRef = args.baseRef ?? args.storedBaseRef;
  if (resolvedBaseRef == null || resolvedBaseRef.length === 0) {
    return { baseRef: null, aheadCount: null, behindCount: null };
  }
  const counts = await args.dependencies.loadAheadBehindCounts({
    worktreePath: args.worktreePath,
    baseRef: resolvedBaseRef,
  });
  if (counts != null) {
    return { baseRef: resolvedBaseRef, aheadCount: counts.aheadCount, behindCount: counts.behindCount };
  }
  if (args.storedBaseRef != null && args.storedBaseRef.length > 0 && resolvedBaseRef === args.storedBaseRef) {
    const fallbackBaseRef = await args.dependencies.resolveMergeTargetRef(args.worktreePath);
    if (fallbackBaseRef == null || fallbackBaseRef.length === 0) {
      return { baseRef: resolvedBaseRef, aheadCount: null, behindCount: null };
    }
    const fallbackCounts = await args.dependencies.loadAheadBehindCounts({
      worktreePath: args.worktreePath,
      baseRef: fallbackBaseRef,
    });
    return {
      baseRef: fallbackBaseRef,
      aheadCount: fallbackCounts?.aheadCount ?? null,
      behindCount: fallbackCounts?.behindCount ?? null,
    };
  }
  return { baseRef: resolvedBaseRef, aheadCount: null, behindCount: null };
}

/**
 * 詳細情報 snapshot を読み込む
 */
async function loadDetailsSnapshot(args: {
  worktrees: Worktree[];
  mappings: RepositoryMapping[];
  dependencies: LoadWorktreeDeckDetailsSnapshotDependencies;
}): Promise<WorktreeDeckDetailsSnapshot> {
  let originLastCommitByPath = new Map<string, string | null>();
  let originBranchByPath = new Map<string, string | null>();
  let baseRefByPath = new Map<string, string>();
  let openAppMetaByPath = new Map<string, WorktreeOpenAppMeta>();
  try {
    const originPaths = collectOriginPaths({ worktrees: args.worktrees, mappings: args.mappings });
    originLastCommitByPath = await args.dependencies.loadLastCommitAtByPath(originPaths);
    originBranchByPath = await args.dependencies.loadCurrentBranchByPath(originPaths);
  } catch {
    originLastCommitByPath = new Map();
    originBranchByPath = new Map();
  }
  try {
    baseRefByPath = await args.dependencies.loadBaseRefByWorktreePath(args.worktrees.map((item) => item.path));
  } catch {
    baseRefByPath = new Map();
  }
  try {
    openAppMetaByPath = await args.dependencies.loadOpenAppMetaByWorktreePath(
      collectDisplayPaths({ worktrees: args.worktrees, mappings: args.mappings }),
    );
  } catch {
    openAppMetaByPath = new Map();
  }
  const itemsWithMeta = await args.dependencies.loadWorktreeMetadata(args.worktrees, { baseRefByPath });
  const worktrees = await attachWorktreeBaseDiffs({
    worktrees: itemsWithMeta,
    baseRefByPath,
    dependencies: args.dependencies,
  });
  return {
    mappings: args.mappings,
    originLastCommitByPath,
    originBranchByPath,
    openAppMetaByPath,
    worktrees,
  };
}

/**
 * worktree 一覧 snapshot ユースケース関数群
 */
export const worktreeDeckSnapshotUsecase = {
  loadInitialSnapshot,
  loadTitlesSnapshot,
  loadDetailsSnapshot,
} as const;
