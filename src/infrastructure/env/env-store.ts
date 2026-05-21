import { existsSync, promises as fs } from "node:fs";
import { dirname, join } from "node:path";

type EnvValues = Record<string, string>;
/**
 * Raycast 実行ディレクトリへコピーされる env ミラーのファイル名
 */
const WORKTREE_DECK_ENV_ASSET_FILE_NAME = ".env";

export type EnvLookupArgs = {
  env: NodeJS.ProcessEnv;
  cwd: string;
  homeDir: string | null;
  assetsPath?: string;
  packageDir: string;
  packageName: string;
};

/**
 * ホームディレクトリの候補を解決する
 */
function resolveHomeDir(env: NodeJS.ProcessEnv): string | null {
  const home = env.HOME?.trim();
  if (home !== undefined && home.length > 0) {
    return home;
  }
  const userProfile = env.USERPROFILE?.trim();
  if (userProfile !== undefined && userProfile.length > 0) {
    return userProfile;
  }
  return null;
}

/**
 * EnvLookupArgs を現在のプロセス情報から組み立てる
 */
export function buildEnvLookupArgs(packageDir: string, packageName: string): EnvLookupArgs {
  return {
    env: process.env,
    cwd: process.cwd(),
    homeDir: resolveHomeDir(process.env),
    packageDir,
    packageName,
  };
}

/**
 * .env を読み込み、コメントや空行を除外して辞書化する
 */
async function readEnvFile(envPath: string): Promise<EnvValues> {
  const content = await fs.readFile(envPath, "utf8");
  const result: EnvValues = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    let line = trimmed;
    if (line.startsWith("export ")) {
      line = line.slice("export ".length).trim();
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * .env から指定キーの値だけを取得する
 */
export async function readEnvValueFromEnv(envPath: string, key: string): Promise<string | null> {
  if (!existsSync(envPath)) {
    return null;
  }
  const envValues = await readEnvFile(envPath);
  const value = envValues[key]?.trim();
  return value || null;
}

/**
 * package.json を遡り name が一致するルートを探す
 */
async function findPackageRoot(startDir: string, packageName: string): Promise<string | null> {
  let current = startDir;
  while (true) {
    const candidate = join(current, "package.json");
    if (existsSync(candidate)) {
      try {
        const content = await fs.readFile(candidate, "utf8");
        const data = JSON.parse(content) as { name?: string };
        if (data.name === packageName) {
          return current;
        }
      } catch {
        // 解析エラーは無視する
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * 重複を除いた候補ディレクトリを返す
 */
function uniqueDirectories(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

/**
 * assets ディレクトリ内の .env パスを返す
 */
function resolveAssetsDirEnvPath(directory: string): string | null {
  const envPath = join(directory, "assets", WORKTREE_DECK_ENV_ASSET_FILE_NAME);
  if (existsSync(envPath)) {
    return envPath;
  }
  return null;
}

/**
 * assets 内の env ミラーファイルパスを返す
 */
function resolveAssetEnvPath(assetsPath: string | null | undefined): string | null {
  const normalizedAssetsPath = assetsPath?.trim();
  if (!normalizedAssetsPath) {
    return null;
  }
  const envPath = join(normalizedAssetsPath, WORKTREE_DECK_ENV_ASSET_FILE_NAME);
  if (existsSync(envPath)) {
    return envPath;
  }
  return null;
}

/**
 * worktree-deck package root の .env パスを返す
 */
export async function resolveRootEnvPath(args: EnvLookupArgs): Promise<string | null> {
  const assetEnvPath = resolveAssetEnvPath(args.assetsPath);
  if (assetEnvPath) {
    return assetEnvPath;
  }

  const directCandidates = uniqueDirectories([args.packageDir, dirname(args.packageDir), args.cwd, dirname(args.cwd)]);
  for (const candidate of directCandidates) {
    const envPath = resolveAssetsDirEnvPath(candidate);
    if (envPath) {
      return envPath;
    }
  }

  const packageRootCandidates = uniqueDirectories([
    args.assetsPath ? dirname(args.assetsPath) : null,
    args.packageDir,
    args.cwd,
  ]);
  for (const candidate of packageRootCandidates) {
    const packageRoot = await findPackageRoot(candidate, args.packageName);
    if (!packageRoot) {
      continue;
    }
    const envPath = join(packageRoot, "assets", WORKTREE_DECK_ENV_ASSET_FILE_NAME);
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  return null;
}

/**
 * 環境変数と複数の .env 探索順で値を解決する
 */
export async function loadEnvValue(args: EnvLookupArgs, key: string): Promise<string | null> {
  const fromEnv = args.env[key]?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const rootEnvPath = await resolveRootEnvPath(args);
  if (rootEnvPath) {
    const envValue = await readEnvValueFromEnv(rootEnvPath, key);
    if (envValue) {
      return envValue;
    }
  }

  return null;
}
