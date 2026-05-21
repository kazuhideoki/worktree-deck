import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type {
  StartWorktreeAutoStartJobCommand,
  StartWorktreeAutoStartJobResult,
} from "../application/start-worktree-auto-start-job.usecase";
import { expandHomePath, normalizePathValue } from "../domain/path-utils";

const AUTO_START_WORKER_FILE_NAME = "auto_start_worker.js";

type AutoStartJobPayload = StartWorktreeAutoStartJobCommand & {
  id: string;
  statePath: string;
  workerPath: string;
};

/**
 * unknown からエラーメッセージを取り出す
 */
function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Auto Start job の現在状態を読み込む
 */
async function readAutoStartJobState(statePath: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * worker 起動前後の失敗を job state に残す
 */
async function writeAutoStartJobFailure(statePath: string, error: unknown): Promise<void> {
  const current = await readAutoStartJobState(statePath);
  await writeFile(
    statePath,
    JSON.stringify(
      {
        ...current,
        status: "failed",
        errorMessage: extractErrorMessage(error),
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

/**
 * .env から指定キーの値を読み込む
 */
async function readEnvValue(envRoot: string | null | undefined, key: string): Promise<string | null> {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) {
    return fromProcess;
  }
  const envRootValue = envRoot?.trim();
  if (!envRootValue) {
    return null;
  }
  const envPath = join(envRootValue, ".env");
  if (!existsSync(envPath)) {
    return null;
  }
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const line = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const envKey = line.slice(0, eqIndex).trim();
    if (envKey !== key) {
      continue;
    }
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value.trim() || null;
  }
  return null;
}

/**
 * worktree-deck の storage ディレクトリを解決する
 */
async function resolveStorageDir(envRoot: string | null | undefined): Promise<string> {
  const configured = await readEnvValue(envRoot, "WORKTREE_DECK_STORAGE_DIR");
  if (configured) {
    return normalizePathValue(expandHomePath(configured, process.env.HOME?.trim() || homedir()));
  }
  return join(process.env.HOME?.trim() || homedir(), ".worktree-deck", "storage");
}

/**
 * Auto Start worker の配置パスを解決する
 */
function resolveAutoStartWorkerPath(scriptPath: string): string {
  const workerPath = join(dirname(scriptPath), AUTO_START_WORKER_FILE_NAME);
  if (!existsSync(workerPath)) {
    throw new Error("Auto Start worker script was not found.");
  }
  return workerPath;
}

/**
 * Auto Start worker を detached process として開始する
 */
async function startDetachedAutoStartWorker(payload: AutoStartJobPayload): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const rejectWithState = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      void writeAutoStartJobFailure(payload.statePath, error).finally(() => reject(error));
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, [payload.workerPath, payload.statePath], {
        detached: true,
        stdio: "ignore",
      });
    } catch (error) {
      rejectWithState(error);
      return;
    }
    child.once("error", rejectWithState);
    child.unref();
    setImmediate(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    });
  });
}

/**
 * Auto Start job の状態ファイルを作成して worker を起動する
 */
export async function startWorktreeAutoStartJob(
  command: StartWorktreeAutoStartJobCommand,
): Promise<StartWorktreeAutoStartJobResult> {
  const jobId = randomUUID();
  const jobDir = join(await resolveStorageDir(command.envRoot), "auto-start-jobs");
  const statePath = join(jobDir, `${jobId}.json`);
  const payload: AutoStartJobPayload = {
    ...command,
    id: jobId,
    statePath,
    workerPath: resolveAutoStartWorkerPath(command.scriptPath),
  };
  await mkdir(jobDir, { recursive: true });
  await writeFile(
    statePath,
    JSON.stringify(
      {
        ...payload,
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  await startDetachedAutoStartWorker(payload);
  return { jobId, statePath };
}
