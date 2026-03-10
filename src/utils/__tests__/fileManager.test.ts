import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ensureOutputDir,
  writeGameFile,
  readGameFile,
  deleteGameFile,
  gameFileExists,
} from "../fileManager.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "awgdas-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ensureOutputDir", () => {
  it("creates directory if it does not exist", async () => {
    const dir = await ensureOutputDir("my-game", tmpDir);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("returns the same path if directory already exists", async () => {
    const dir1 = await ensureOutputDir("my-game", tmpDir);
    const dir2 = await ensureOutputDir("my-game", tmpDir);
    expect(dir1).toBe(dir2);
  });
});

describe("writeGameFile", () => {
  it("writes content to the correct path", async () => {
    await ensureOutputDir("my-game", tmpDir);
    await writeGameFile("my-game", "index.html", "<html></html>", tmpDir);

    const content = await fs.readFile(
      path.join(tmpDir, "my-game", "index.html"),
      "utf-8",
    );
    expect(content).toBe("<html></html>");
  });

  it("creates intermediate directories", async () => {
    await writeGameFile("my-game", "js/main.js", "// main", tmpDir);

    const content = await fs.readFile(
      path.join(tmpDir, "my-game", "js", "main.js"),
      "utf-8",
    );
    expect(content).toBe("// main");
  });

  it("throws on path traversal", async () => {
    await expect(
      writeGameFile("my-game", "../../etc/passwd", "hack", tmpDir),
    ).rejects.toThrow("Path traversal");
  });
});

describe("readGameFile", () => {
  it("reads content from an existing file", async () => {
    await writeGameFile("my-game", "test.txt", "hello", tmpDir);
    const content = await readGameFile("my-game", "test.txt", tmpDir);
    expect(content).toBe("hello");
  });

  it("throws if file does not exist", async () => {
    await ensureOutputDir("my-game", tmpDir);
    await expect(
      readGameFile("my-game", "nope.txt", tmpDir),
    ).rejects.toThrow();
  });
});

describe("deleteGameFile", () => {
  it("deletes an existing file", async () => {
    await writeGameFile("my-game", "tmp.txt", "data", tmpDir);
    await deleteGameFile("my-game", "tmp.txt", tmpDir);

    const exists = await gameFileExists("my-game", "tmp.txt", tmpDir);
    expect(exists).toBe(false);
  });

  it("throws if file does not exist", async () => {
    await ensureOutputDir("my-game", tmpDir);
    await expect(
      deleteGameFile("my-game", "nope.txt", tmpDir),
    ).rejects.toThrow();
  });
});

describe("gameFileExists", () => {
  it("returns true if file exists", async () => {
    await writeGameFile("my-game", "a.txt", "x", tmpDir);
    expect(await gameFileExists("my-game", "a.txt", tmpDir)).toBe(true);
  });

  it("returns false if file does not exist", async () => {
    await ensureOutputDir("my-game", tmpDir);
    expect(await gameFileExists("my-game", "b.txt", tmpDir)).toBe(false);
  });
});
