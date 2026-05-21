import { describe, expect, it, vi } from "vitest";
import { openPathInZedClassic } from "./worktree-zed-infra";

describe("openPathInZedClassic", () => {
  it("macOS の Zed アプリで指定パスを開く", async () => {
    const execFileMock = vi.fn(async () => ({ stdout: "", stderr: "" }));

    await openPathInZedClassic("/repos/app-a", execFileMock);

    expect(execFileMock).toHaveBeenCalledWith("open", ["-a", "Zed", "/repos/app-a"]);
  });

  it("空のパスはエラーにする", async () => {
    const execFileMock = vi.fn(async () => ({ stdout: "", stderr: "" }));

    await expect(openPathInZedClassic("  ", execFileMock)).rejects.toThrow("Path is required.");
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
