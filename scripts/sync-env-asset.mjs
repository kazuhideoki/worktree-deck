import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * package root の絶対パスを返す
 */
function resolvePackageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Raycast がコピーできる env ファイルを用意する
 */
export function syncEnvAsset(packageRoot = resolvePackageRoot()) {
  const envPath = join(packageRoot, "assets", ".env");
  if (existsSync(envPath)) {
    return envPath;
  }

  const examplePath = join(packageRoot, "assets", ".env.example");
  if (!existsSync(examplePath)) {
    throw new Error("assets/.env and assets/.env.example were not found.");
  }

  copyFileSync(examplePath, envPath);
  return envPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncEnvAsset();
}
