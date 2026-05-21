import type {
  ListWorktreesDependencies,
  WorktreeDeckContext,
  WorktreeDeckSettings,
} from "../application/list-worktrees.usecase";
import type { Worktree } from "../application/worktree.entity";
import type { RepositoryMapping } from "../domain/repository-mapping.service";
import {
  loadBasePathInfra,
  loadRepositoryMappingsInfra,
  loadWorktreeNameDelimiterInfra,
  loadWorktreesBaseInfra,
} from "../infrastructure/list-worktrees-infra";

/**
 * listWorktrees で使う外部依存の入力ポート
 */
type ListWorktreesInfra = {
  loadBasePath(context: WorktreeDeckContext): Promise<string>;
  loadWorktreeNameDelimiter(context: WorktreeDeckContext): Promise<string>;
  loadRepositoryMappings(): Promise<RepositoryMapping[]>;
  loadWorktreesBase(basePath: string, delimiter: string): Promise<Worktree[]>;
};

/**
 * 設定値を読み込む
 */
async function loadSettingsFromInfra(
  infra: Pick<ListWorktreesInfra, "loadBasePath" | "loadWorktreeNameDelimiter">,
  context: WorktreeDeckContext,
): Promise<WorktreeDeckSettings> {
  const basePath = await infra.loadBasePath(context);
  const delimiter = await infra.loadWorktreeNameDelimiter(context);
  return { basePath, delimiter };
}

/**
 * mapping を読み込み、失敗時は空配列にフォールバックする
 */
async function loadMappingsFromInfra(
  infra: Pick<ListWorktreesInfra, "loadRepositoryMappings">,
): Promise<RepositoryMapping[]> {
  try {
    return await infra.loadRepositoryMappings();
  } catch {
    return [];
  }
}

/**
 * 一覧取得ユースケース向けの依存アダプタを組み立てる
 */
export function createListWorktreesDependencies(infra: ListWorktreesInfra): ListWorktreesDependencies {
  return {
    loadSettings(context) {
      return loadSettingsFromInfra(infra, context);
    },
    loadMappings() {
      return loadMappingsFromInfra(infra);
    },
    loadWorktrees(basePath, delimiter) {
      return infra.loadWorktreesBase(basePath, delimiter);
    },
  };
}

/**
 * 既存 infra 実装を使った依存アダプタを生成する
 */
export function createDefaultListWorktreesDependencies(): ListWorktreesDependencies {
  return createListWorktreesDependencies({
    loadBasePath: loadBasePathInfra,
    loadWorktreeNameDelimiter: loadWorktreeNameDelimiterInfra,
    loadRepositoryMappings: loadRepositoryMappingsInfra,
    loadWorktreesBase: loadWorktreesBaseInfra,
  });
}
