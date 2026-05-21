import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * package root の絶対パスを返す
 */
function resolvePackageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Raycast がコピーできる env ファイルの存在を確認する
 */
function syncEnvAsset() {
  const packageRoot = resolvePackageRoot();
  const envPath = join(packageRoot, "assets", ".env");
  if (!existsSync(envPath)) {
    throw new Error("assets/.env was not found.");
  }
}

syncEnvAsset();
