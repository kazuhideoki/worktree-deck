import { existsSync, promises as fs } from "node:fs";
import { join, relative } from "node:path";

import { DEFAULT_WORKTREE_NAME_DELIMITER } from "./worktree-config-store";
import { resolveOriginRepoPath } from "./git-worktree-metadata-store";
import {
  WORKTREE_DECK_CACHE_VERSION,
  loadWorktreeDeckCache,
  saveWorktreeDeckCache,
  type CachedGitMarkerState,
  type CachedWorktreeDirectoryState,
  type CachedWorktreeEntry,
  type CachedWorktreeRepoState,
} from "./worktree-deck-cache-store";
import type { Worktree } from "./worktree-types";

type TopLevelRepoInfo = {
  name: string;
  path: string;
  mtimeMs: number;
};

type WorktreeRootsScanResult = {
  roots: string[];
  directories: CachedWorktreeDirectoryState[];
};

type TopLevelRepoWorktreesResult = {
  worktrees: Worktree[];
  repoState: CachedWorktreeRepoState;
};

async function findWorktreeRoots(repoRoot: string): Promise<WorktreeRootsScanResult> {
  const results: string[] = [];
  const directories: CachedWorktreeDirectoryState[] = [];

  const walk = async (dir: string, relativePath: string) => {
    const stat = await fs.stat(dir);
    directories.push({
      relativePath,
      mtimeMs: stat.mtimeMs,
    });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const hasGit = entries.some((entry) => entry.name === ".git");
    if (hasGit) {
      results.push(dir);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === ".git" || entry.isSymbolicLink()) {
        continue;
      }
      const childRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;
      await walk(join(dir, entry.name), childRelativePath);
    }
  };

  await walk(repoRoot, "");
  return {
    roots: results,
    directories,
  };
}

/**
 * worktree 名を repo と branch に分割する
 */
function splitWorktreeName(name: string, delimiter: string): { repo: string; branch: string } {
  const index = name.indexOf(delimiter);
  if (index === -1) {
    return { repo: name, branch: "root" };
  }
  const repo = name.slice(0, index).trim() || name;
  const branch = name.slice(index + delimiter.length).trim() || "root";
  return { repo, branch };
}

/**
 * .git ディレクトリの有無を確認する
 */
function hasGitDir(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

/**
 * トップレベル配下のリポジトリ情報を収集する
 */
async function loadTopLevelRepoInfos(basePath: string): Promise<TopLevelRepoInfo[]> {
  const repoEntries = await fs.readdir(basePath, { withFileTypes: true });
  const repos = repoEntries.filter((entry) => entry.isDirectory());
  const repoInfos = await Promise.all(
    repos.map(async (entry) => {
      const path = join(basePath, entry.name);
      const stat = await fs.stat(path);
      return {
        name: entry.name,
        path,
        mtimeMs: stat.mtimeMs,
      };
    }),
  );
  return repoInfos;
}

/**
 * 単一トップレベルディレクトリ配下から worktree 候補を読み取る
 */
async function loadWorktreesFromTopLevelRepo(
  args: TopLevelRepoInfo,
  delimiter: string,
): Promise<TopLevelRepoWorktreesResult> {
  const defaultRepoState: CachedWorktreeRepoState = {
    mtimeMs: args.mtimeMs,
    directories: [{ relativePath: "", mtimeMs: args.mtimeMs }],
    gitMarkers: [],
  };
  if (args.name.includes(delimiter)) {
    if (!hasGitDir(args.path)) {
      return {
        worktrees: [],
        repoState: defaultRepoState,
      };
    }
    const split = splitWorktreeName(args.name, delimiter);
    const originPath = await resolveOriginRepoPath(args.path);
    return {
      worktrees: [
        {
          repo: split.repo,
          branch: split.branch,
          path: args.path,
          originPath: originPath ?? undefined,
        },
      ],
      repoState: {
        ...defaultRepoState,
        gitMarkers: (await captureGitMarkers({ repoRoot: args.path, worktreePaths: [args.path] })).sort((left, right) =>
          left.relativePath.localeCompare(right.relativePath),
        ),
      },
    };
  }

  const scanResult = await findWorktreeRoots(args.path);
  const items: Worktree[] = [];
  for (const worktreePath of scanResult.roots) {
    const rel = relative(args.path, worktreePath);
    const originPath = await resolveOriginRepoPath(worktreePath);
    items.push({
      repo: args.name,
      branch: rel || "root",
      path: worktreePath,
      originPath: originPath ?? undefined,
    });
  }
  return {
    worktrees: items,
    repoState: {
      mtimeMs: args.mtimeMs,
      directories: scanResult.directories,
      gitMarkers: (await captureGitMarkers({ repoRoot: args.path, worktreePaths: scanResult.roots })).sort(
        (left, right) => left.relativePath.localeCompare(right.relativePath),
      ),
    },
  };
}

/**
 * 保存済みディレクトリ状態から絶対パスを復元する
 */
function resolveCachedDirectoryPath(repoPath: string, relativePath: string): string {
  if (!relativePath) {
    return repoPath;
  }
  return join(repoPath, relativePath);
}

/**
 * .git マーカーの相対パスを構築する
 */
function buildGitMarkerRelativePath(repoRoot: string, worktreePath: string): string {
  const relWorktreePath = relative(repoRoot, worktreePath);
  if (!relWorktreePath) {
    return ".git";
  }
  return join(relWorktreePath, ".git");
}

/**
 * 単一 worktree の .git マーカー状態を取得する
 */
async function captureGitMarker(args: {
  repoRoot: string;
  worktreePath: string;
}): Promise<CachedGitMarkerState | null> {
  const markerRelativePath = buildGitMarkerRelativePath(args.repoRoot, args.worktreePath);
  const markerPath = join(args.worktreePath, ".git");
  try {
    const stat = await fs.stat(markerPath);
    if (stat.isDirectory()) {
      return {
        relativePath: markerRelativePath,
        kind: "directory",
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        content: null,
      };
    }
    let content: string | null = null;
    try {
      content = await fs.readFile(markerPath, "utf8");
    } catch {
      content = null;
    }
    return {
      relativePath: markerRelativePath,
      kind: "file",
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      content,
    };
  } catch {
    return null;
  }
}

/**
 * 複数 worktree の .git マーカー状態を収集する
 */
async function captureGitMarkers(args: { repoRoot: string; worktreePaths: string[] }): Promise<CachedGitMarkerState[]> {
  const markers = await Promise.all(
    args.worktreePaths.map((worktreePath) => captureGitMarker({ repoRoot: args.repoRoot, worktreePath })),
  );
  return markers.filter((marker): marker is CachedGitMarkerState => marker != null);
}

/**
 * 保存済み .git マーカーが変化していないか判定する
 */
async function isGitMarkerUnchanged(args: { repoPath: string; marker: CachedGitMarkerState }): Promise<boolean> {
  const markerPath = resolveCachedDirectoryPath(args.repoPath, args.marker.relativePath);
  try {
    const stat = await fs.stat(markerPath);
    const kind = stat.isDirectory() ? "directory" : "file";
    if (kind !== args.marker.kind) {
      return false;
    }
    if (stat.mtimeMs !== args.marker.mtimeMs || stat.size !== args.marker.size) {
      return false;
    }
    if (kind === "file") {
      let content: string | null = null;
      try {
        content = await fs.readFile(markerPath, "utf8");
      } catch {
        content = null;
      }
      if (content !== args.marker.content) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 保存済み repo キャッシュを再利用できるか判定する
 */
async function canReuseCachedRepoState(args: {
  repoPath: string;
  currentMtimeMs: number;
  cachedState: CachedWorktreeRepoState;
}): Promise<boolean> {
  if (args.cachedState.mtimeMs !== args.currentMtimeMs) {
    return false;
  }
  for (const directory of args.cachedState.directories) {
    const dirPath = resolveCachedDirectoryPath(args.repoPath, directory.relativePath);
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return false;
      }
      if (stat.mtimeMs !== directory.mtimeMs) {
        return false;
      }
    } catch {
      return false;
    }
  }
  for (const marker of args.cachedState.gitMarkers) {
    const unchanged = await isGitMarkerUnchanged({
      repoPath: args.repoPath,
      marker,
    });
    if (!unchanged) {
      return false;
    }
  }
  return true;
}

/**
 * basePath 配下から worktree 一覧を構築する
 */
/**
 * basePath 配下から worktree 一覧を軽量に構築する
 */
export async function loadWorktreesBase(
  basePath: string,
  delimiter: string = DEFAULT_WORKTREE_NAME_DELIMITER,
): Promise<Worktree[]> {
  if (!existsSync(basePath)) {
    // 初期実行時など未作成なら空の一覧として扱う
    return [];
  }

  const stat = await fs.stat(basePath);
  if (!stat.isDirectory()) {
    throw new Error(`GIT_WORKTREE_PATH is not a directory: ${basePath}`);
  }

  const cached = await loadWorktreeDeckCache(basePath);
  const hasValidCache = cached?.basePath === basePath && cached.delimiter === delimiter;
  const cacheRepos = hasValidCache ? cached.repos : null;
  const cacheWorktreesByRepo = hasValidCache ? cached.worktreesByRepo : null;
  const repoInfos = await loadTopLevelRepoInfos(basePath);
  const nextRepos: Record<string, CachedWorktreeRepoState> = {};
  const nextWorktreesByRepo: Record<string, CachedWorktreeEntry[]> = {};
  const items: Worktree[] = [];

  for (const repoInfo of repoInfos) {
    const cachedRepoState = cacheRepos?.[repoInfo.name];
    const cachedWorktrees = cacheWorktreesByRepo?.[repoInfo.name];
    if (cachedRepoState && cachedWorktrees) {
      const canReuse = await canReuseCachedRepoState({
        repoPath: repoInfo.path,
        currentMtimeMs: repoInfo.mtimeMs,
        cachedState: cachedRepoState,
      });
      if (canReuse) {
        for (const cachedWorktree of cachedWorktrees) {
          items.push({
            repo: cachedWorktree.repo,
            branch: cachedWorktree.branch,
            path: cachedWorktree.path,
            originPath: cachedWorktree.originPath,
          });
        }
        nextRepos[repoInfo.name] = cachedRepoState;
        nextWorktreesByRepo[repoInfo.name] = cachedWorktrees;
        continue;
      }
    }

    const discovered = await loadWorktreesFromTopLevelRepo(repoInfo, delimiter);
    for (const item of discovered.worktrees) {
      items.push(item);
    }
    nextRepos[repoInfo.name] = discovered.repoState;
    nextWorktreesByRepo[repoInfo.name] = discovered.worktrees.map((item) => ({
      repo: item.repo,
      branch: item.branch ?? "",
      path: item.path,
      originPath: item.originPath,
    }));
  }

  await saveWorktreeDeckCache({
    version: WORKTREE_DECK_CACHE_VERSION,
    basePath,
    delimiter,
    cachedAt: Date.now(),
    repos: nextRepos,
    worktreesByRepo: nextWorktreesByRepo,
  });

  return items;
}
