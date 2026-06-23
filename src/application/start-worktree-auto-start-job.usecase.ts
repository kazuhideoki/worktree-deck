import type { ClaudeInitialSessionMetadata } from "./start-claude-initial-session.usecase";
import type { CodexInitialSessionMetadata } from "./start-codex-initial-session.usecase";
import type { WorktreeOpenApp } from "../domain/worktree-open-app.service";

/**
 * provider 共通の Auto Start job 入力値
 */
type StartWorktreeAutoStartJobCommandBase = {
  repoRoot: string;
  baseBranch: string;
  initialPrompt: string;
  imagePaths?: string[];
  scriptPath: string;
  mapValue: string;
  openApp: WorktreeOpenApp;
};

/**
 * Auto Start job を開始する入力値（provider で適用メタ情報が分岐する）
 *
 * - ca = Codex（App Server へ thread/start）
 * - cc = Claude Code（`claude -p` を CLI 実行）
 */
export type StartWorktreeAutoStartJobCommand =
  | (StartWorktreeAutoStartJobCommandBase & { provider: "ca"; metadata: CodexInitialSessionMetadata })
  | (StartWorktreeAutoStartJobCommandBase & { provider: "cc"; claude: ClaudeInitialSessionMetadata });

/**
 * Auto Start job の開始結果
 */
export type StartWorktreeAutoStartJobResult = {
  jobId: string;
  statePath: string;
};

/**
 * Auto Start job 開始ユースケースの依存ポート
 */
export type StartWorktreeAutoStartJobDependencies = {
  startJob(command: StartWorktreeAutoStartJobCommand): Promise<StartWorktreeAutoStartJobResult>;
};

/**
 * Auto Start job を detached worker として開始する
 */
async function start(args: {
  command: StartWorktreeAutoStartJobCommand;
  dependencies: StartWorktreeAutoStartJobDependencies;
}): Promise<StartWorktreeAutoStartJobResult> {
  const repoRoot = args.command.repoRoot.trim();
  if (!repoRoot) {
    throw new Error("Repository is required.");
  }
  const baseBranch = args.command.baseBranch.trim();
  if (!baseBranch) {
    throw new Error("Base branch is required.");
  }
  const initialPrompt = args.command.initialPrompt.trim();
  if (!initialPrompt) {
    throw new Error("Initial prompt is required.");
  }
  const imagePaths = args.command.imagePaths?.map((path) => path.trim()).filter(Boolean) ?? [];
  const mapValue = args.command.mapValue.trim();
  if (!mapValue) {
    throw new Error("Repository mapping is required.");
  }
  const base = {
    repoRoot,
    baseBranch,
    initialPrompt,
    imagePaths,
    mapValue,
    scriptPath: args.command.scriptPath,
    openApp: args.command.openApp,
  };
  return args.dependencies.startJob(
    args.command.provider === "cc"
      ? { ...base, provider: "cc", claude: args.command.claude }
      : { ...base, provider: "ca", metadata: args.command.metadata },
  );
}

/**
 * Auto Start job ユースケース関数群
 */
export const startWorktreeAutoStartJobUsecase = {
  start,
} as const;
