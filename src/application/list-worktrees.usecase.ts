import type { RepositoryMapping } from "../domain/repository-mapping.service";
import type { Worktree } from "./worktree.entity";
import { worktreeFilterService } from "../domain/worktree-filter.service";

/**
 * 一覧取得で共通利用する実行コンテキスト
 */
export type WorktreeDeckContext = {
  env: NodeJS.ProcessEnv;
  cwd: string;
  homeDir: string | null;
  assetsPath: string;
  packageDir: string;
  packageName: string;
};

/**
 * 一覧表示に必要な設定値
 */
export type WorktreeDeckSettings = {
  basePath: string;
  delimiter: string;
};

/**
 * 一覧取得ユースケースの依存ポート
 */
export type ListWorktreesDependencies = {
  loadSettings(context: WorktreeDeckContext): Promise<WorktreeDeckSettings>;
  loadMappings(): Promise<RepositoryMapping[]>;
  loadWorktrees(basePath: string, delimiter: string): Promise<Worktree[]>;
};

/**
 * 一覧取得ユースケースの返却値
 */
export type ListWorktreesResult = {
  basePath: string;
  delimiter: string;
  mappings: RepositoryMapping[];
  worktrees: Worktree[];
};

/**
 * worktree 一覧を取得し mapping で表示対象を絞り込む
 */
async function list(args: {
  context: WorktreeDeckContext;
  dependencies: ListWorktreesDependencies;
}): Promise<ListWorktreesResult> {
  const settings = await args.dependencies.loadSettings(args.context);
  const mappings = await args.dependencies.loadMappings();
  const worktrees = await args.dependencies.loadWorktrees(settings.basePath, settings.delimiter);
  const filteredWorktrees = worktreeFilterService.filterByMappings({
    worktrees,
    mappings,
    homeDir: args.context.homeDir,
  });
  return {
    basePath: settings.basePath,
    delimiter: settings.delimiter,
    mappings,
    worktrees: filteredWorktrees,
  };
}

/**
 * worktree 一覧ユースケース関数群
 */
export const listWorktreesUsecase = {
  list,
} as const;
