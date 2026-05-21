import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * execFile を Promise 化した実行関数
 */
const execFileAsync = promisify(execFile);

/**
 * Zed 起動で利用する execFile 互換関数
 */
type ExecFileImpl = typeof execFileAsync;

/**
 * 指定パスを Zed アプリで開く
 */
export async function openPathInZedClassic(path: string, execFileImpl: ExecFileImpl = execFileAsync): Promise<void> {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    throw new Error("Path is required.");
  }

  await execFileImpl("open", ["-a", "Zed", trimmedPath]);
}
