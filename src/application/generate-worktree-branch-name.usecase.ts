import { worktreeBranchNameService } from "../domain/worktree-branch-name.service";
import { repositoryMappingService, type RepositoryMapping } from "../domain/repository-mapping.service";

/**
 * branch 名生成の最大試行回数
 */
const BRANCH_NAME_GENERATION_MAX_ATTEMPTS = 3;

/**
 * 初期プロンプトから branch 名を生成する入力値
 */
type GenerateWorktreeBranchNameCommand = {
  repoRoot: string;
  initialPrompt: string;
};

/**
 * Codex に branch 名生成を依頼する入力値
 */
export type GenerateWorktreeBranchNameRequest = {
  repoRoot: string;
  prompt: string;
};

/**
 * branch 名生成ユースケースの依存ポート
 */
export type GenerateWorktreeBranchNameDependencies = {
  generateBranchName(request: GenerateWorktreeBranchNameRequest): Promise<string>;
  loadRepositoryMappings(): Promise<RepositoryMapping[]>;
};

/**
 * 初期プロンプトから branch 名を生成する
 */
async function generate(args: {
  command: GenerateWorktreeBranchNameCommand;
  dependencies: GenerateWorktreeBranchNameDependencies;
}): Promise<{ branch: string }> {
  const repoRoot = args.command.repoRoot.trim();
  if (!repoRoot) {
    throw new Error("Repository is required.");
  }
  const mappings = await args.dependencies.loadRepositoryMappings();
  const mapping = repositoryMappingService.findByRepoRoot(mappings, repoRoot);
  const rule = {
    pattern: mapping?.branchNamePattern ?? "",
    prompt: mapping?.branchNamePrompt ?? "",
  };
  let rejected: { branch: string; error: string } | null = null;
  let lastError = "";
  for (let attempt = 1; attempt <= BRANCH_NAME_GENERATION_MAX_ATTEMPTS; attempt += 1) {
    const promptResult = worktreeBranchNameService.buildGenerationPrompt(args.command.initialPrompt, rule, rejected);
    if (!promptResult.ok) {
      throw new Error(promptResult.error);
    }
    const rawBranchName = await args.dependencies.generateBranchName({ repoRoot, prompt: promptResult.value });
    const branchResult = worktreeBranchNameService.normalizeGeneratedBranchName(rawBranchName);
    if (!branchResult.ok) {
      lastError = branchResult.error;
      rejected = { branch: rawBranchName.trim(), error: branchResult.error };
      continue;
    }
    const ruleResult = worktreeBranchNameService.validateBranchNameRule(branchResult.value, rule);
    if (!ruleResult.ok) {
      lastError = ruleResult.error;
      rejected = { branch: branchResult.value, error: ruleResult.error };
      continue;
    }
    return {
      branch: ruleResult.value,
    };
  }
  throw new Error(lastError || "Failed to generate branch name.");
}

/**
 * branch 名生成ユースケース関数群
 */
export const generateWorktreeBranchNameUsecase = {
  generate,
} as const;
