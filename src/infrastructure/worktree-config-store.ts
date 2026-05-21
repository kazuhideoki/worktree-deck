import { expandHomePath, normalizePathValue } from "../domain/path-utils";
import { loadEnvValue, readEnvValueFromEnv, resolveRootEnvPath } from "./env/env-store";

/**
 * worktree 名の既定区切り文字
 */
export const DEFAULT_WORKTREE_NAME_DELIMITER = "~_~";

const ENV_WORKTREE_NAME_DELIMITER = "WORKTREE_NAME_DELIMITER";

/**
 * GIT_WORKTREE_PATH の値を実行環境の絶対パスへ正規化する
 */
function normalizeWorktreeBasePath(value: string, homeDir: string | null): string {
  return normalizePathValue(expandHomePath(value, homeDir));
}

/**
 * .env から GIT_WORKTREE_PATH を取得する
 */
async function readWorktreePathFromEnv(envPath: string): Promise<string | null> {
  return readEnvValueFromEnv(envPath, "GIT_WORKTREE_PATH");
}

export async function loadBasePath(args: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  homeDir: string | null;
  assetsPath: string;
  packageDir: string;
  packageName: string;
}): Promise<string> {
  const fromEnv = args.env.GIT_WORKTREE_PATH?.trim();
  if (fromEnv) {
    return normalizeWorktreeBasePath(fromEnv, args.homeDir);
  }

  const checked: string[] = [];

  const rootEnvPath = await resolveRootEnvPath(args);
  if (rootEnvPath) {
    const basePath = await readWorktreePathFromEnv(rootEnvPath);
    checked.push(rootEnvPath);
    if (basePath) {
      return normalizeWorktreeBasePath(basePath, args.homeDir);
    }
  }

  const checkedText = checked.length > 0 ? ` Checked: ${checked.join(", ")}.` : "";
  throw new Error(`GIT_WORKTREE_PATH is not set. Add it to assets/.env or environment.${checkedText}`);
}

export async function loadWorktreeNameDelimiter(args: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  homeDir: string | null;
  assetsPath: string;
  packageDir: string;
  packageName: string;
}): Promise<string> {
  const raw = await loadEnvValue(args, ENV_WORKTREE_NAME_DELIMITER);
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_WORKTREE_NAME_DELIMITER;
  }
  return trimmed;
}
