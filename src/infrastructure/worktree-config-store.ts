import { expandHomePath, normalizePathValue } from "../domain/path-utils";
import { readEnvValueFromEnv, resolveRootEnvPath } from "./env/env-store";

/**
 * GIT_WORKTREE_PATH の値を実行環境の絶対パスへ正規化する
 */
function normalizeWorktreeBasePath(value: string, homeDir: string | null): string {
  return normalizePathValue(expandHomePath(value, homeDir));
}

/**
 * env ファイルから GIT_WORKTREE_PATH を取得する
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
  throw new Error(`GIT_WORKTREE_PATH is not set. Set it in Raycast Preferences or environment.${checkedText}`);
}
