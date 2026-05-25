import { describe, expect, it, vi } from "vitest";
import { openPathInIdeApp, resolveIdeAppMacOSName } from "./worktree-ide-infra";

describe("resolveIdeAppMacOSName", () => {
  it("対応 IDE の macOS アプリ名を返す", () => {
    expect(resolveIdeAppMacOSName("zed")).toBe("Zed");
    expect(resolveIdeAppMacOSName("vscode")).toBe("Visual Studio Code");
    expect(resolveIdeAppMacOSName("cursor")).toBe("Cursor");
  });
});

describe("openPathInIdeApp", () => {
  it("macOS の指定 IDE アプリで指定パスを開く", async () => {
    const execFileMock = vi.fn(async () => ({ stdout: "", stderr: "" }));

    await openPathInIdeApp("/repos/app-a", "vscode", execFileMock);

    expect(execFileMock).toHaveBeenCalledWith("open", ["-a", "Visual Studio Code", "/repos/app-a"]);
  });

  it("空のパスはエラーにする", async () => {
    const execFileMock = vi.fn(async () => ({ stdout: "", stderr: "" }));

    await expect(openPathInIdeApp("  ", "zed", execFileMock)).rejects.toThrow("Path is required.");
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
