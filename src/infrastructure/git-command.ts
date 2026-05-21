import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * git コマンド実行を Promise 化する
 */
const execFileAsync = promisify(execFile);

/**
 * git コマンドを共通オプション付きで実行する
 */
export async function execGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", ["--no-optional-locks", "-C", cwd, ...args], { cwd });
}
