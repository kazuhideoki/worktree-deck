import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { expandHomePath, normalizePathValue } from "../../domain/path-utils";
import { loadEnvValue, resolveRootEnvPath, type EnvLookupArgs } from "../env/env-store";

/**
 * file storage ディレクトリ指定の正規環境変数名
 */
const ENV_FILE_STORAGE_DIR = "WORKTREE_DECK_STORAGE_DIR";
/**
 * file storage ディレクトリの既定値
 */
const DEFAULT_FILE_STORAGE_DIR = "~/.worktree-deck/storage";

/**
 * file storage ディレクトリ設定値を解決する
 */
async function resolveFileStorageDirValue(args: EnvLookupArgs): Promise<string> {
  const primaryValue = (await loadEnvValue(args, ENV_FILE_STORAGE_DIR))?.trim();
  if (primaryValue) {
    return primaryValue;
  }
  return DEFAULT_FILE_STORAGE_DIR;
}

/**
 * file storage のベースディレクトリを解決する
 */
async function resolveFileStorageBaseDir(args: EnvLookupArgs): Promise<string> {
  const value = await resolveFileStorageDirValue(args);
  const expanded = expandHomePath(value, args.homeDir);
  if (isAbsolute(expanded)) {
    return normalizePathValue(expanded);
  }
  const envRootPath = await resolveRootEnvPath(args);
  const baseRoot = envRootPath ? dirname(envRootPath) : args.cwd;
  return normalizePathValue(join(baseRoot, expanded));
}

/**
 * file storage の JSON パスを組み立てる
 */
async function resolveFileStoragePath(args: EnvLookupArgs, fileName: string): Promise<string> {
  const storageDir = await resolveFileStorageBaseDir(args);
  return join(storageDir, fileName);
}

/**
 * file storage の JSON を読み込む
 */
export async function readWorktreeDeckFileStorageJson<T>(args: EnvLookupArgs, fileName: string): Promise<T | null> {
  const filePath = await resolveFileStoragePath(args, fileName);
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return null;
      }
    }
    throw error;
  }
}

/**
 * file storage の JSON を書き込む
 */
export async function writeWorktreeDeckFileStorageJson(
  args: EnvLookupArgs,
  fileName: string,
  value: unknown,
): Promise<void> {
  const filePath = await resolveFileStoragePath(args, fileName);
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value), "utf8");
}
