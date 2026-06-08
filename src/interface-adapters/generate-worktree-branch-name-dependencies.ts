import type {
  GenerateWorktreeBranchNameDependencies,
  GenerateWorktreeBranchNameRequest,
} from "../application/generate-worktree-branch-name.usecase";
import type { RepositoryMapping } from "../domain/repository-mapping.service";
import { loadRepositoryMappings } from "../infrastructure/repository-mapping-store";
import { generateBranchNameWithCodexExec } from "../infrastructure/worktree-branch-name-infra";

/**
 * branch 名生成ユースケース向け infra 入力
 */
type GenerateWorktreeBranchNameInfra = {
  generateBranchNameWithCodexExec(request: GenerateWorktreeBranchNameRequest): Promise<string>;
  loadRepositoryMappings(): Promise<RepositoryMapping[]>;
};

/**
 * branch 名生成ユースケース向け依存アダプタを組み立てる
 */
export function createGenerateWorktreeBranchNameDependencies(
  infra: GenerateWorktreeBranchNameInfra,
): GenerateWorktreeBranchNameDependencies {
  return {
    generateBranchName(request) {
      return infra.generateBranchNameWithCodexExec(request);
    },
    loadRepositoryMappings() {
      return infra.loadRepositoryMappings();
    },
  };
}

/**
 * 既存 infra 実装を使った branch 名生成依存を組み立てる
 */
export function createDefaultGenerateWorktreeBranchNameDependencies(): GenerateWorktreeBranchNameDependencies {
  return createGenerateWorktreeBranchNameDependencies({
    generateBranchNameWithCodexExec,
    loadRepositoryMappings,
  });
}
