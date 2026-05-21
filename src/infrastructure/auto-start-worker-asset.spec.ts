import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Auto Start worker asset の内容を読み込む
 */
async function readAutoStartWorkerAsset(): Promise<string> {
  return readFile(join(process.cwd(), "assets", "auto_start_worker.js"), "utf8");
}

describe("auto_start_worker.js", () => {
  it("Codex app-server の local image 入力形式を使う", async () => {
    const source = await readAutoStartWorkerAsset();

    expect(source).toContain('type: "localImage"');
    expect(source).not.toContain('type: "local_image"');
  });

  it("thread/start と turn/start に serviceTier を渡す", async () => {
    const source = await readAutoStartWorkerAsset();

    expect(source.match(/serviceTier: payload\.metadata\.serviceTier \|\| "default"/g)).toHaveLength(2);
  });
});
