import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ManifestFile } from "../../types/index.js";
import { writeGameFile } from "../fileManager.js";
import {
  createManifest,
  readManifest,
  addFileToManifest,
  updateFileInManifest,
  removeFileFromManifest,
} from "../manifest.js";

let tmpDir: string;

const sampleFile: ManifestFile = {
  path: "index.html",
  role: "entry",
  description: "HTML entry point",
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "awgdas-manifest-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createManifest", () => {
  it("creates manifest.json with correct schema", async () => {
    const manifest = await createManifest("test-game", 1, sampleFile, tmpDir);

    expect(manifest.gameName).toBe("test-game");
    expect(manifest.round).toBe(1);
    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0]).toEqual(sampleFile);
  });

  it("writes valid JSON to disk", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);

    const raw = await fs.readFile(
      path.join(tmpDir, "test-game", "manifest.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.gameName).toBe("test-game");
  });
});

describe("readManifest", () => {
  it("reads and parses existing manifest", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);
    const manifest = await readManifest("test-game", tmpDir);

    expect(manifest.gameName).toBe("test-game");
    expect(manifest.files).toHaveLength(1);
  });

  it("throws if manifest does not exist", async () => {
    await expect(readManifest("no-game", tmpDir)).rejects.toThrow();
  });
});

describe("addFileToManifest", () => {
  it("adds a new file entry", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);

    const newFile: ManifestFile = {
      path: "js/main.js",
      role: "core",
      description: "Game loop",
    };
    const manifest = await addFileToManifest("test-game", 2, newFile, tmpDir);

    expect(manifest.files).toHaveLength(2);
    expect(manifest.files[1]).toEqual(newFile);
  });

  it("updates the round number", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);

    const newFile: ManifestFile = {
      path: "js/main.js",
      role: "core",
      description: "Game loop",
    };
    const manifest = await addFileToManifest("test-game", 3, newFile, tmpDir);
    expect(manifest.round).toBe(3);
  });

  it("throws on duplicate file path", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);

    await expect(
      addFileToManifest("test-game", 2, sampleFile, tmpDir),
    ).rejects.toThrow("File already in manifest");
  });
});

describe("updateFileInManifest", () => {
  it("updates description of existing file", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);

    const manifest = await updateFileInManifest(
      "test-game",
      2,
      "index.html",
      "Updated HTML entry",
      tmpDir,
    );

    expect(manifest.files[0].description).toBe("Updated HTML entry");
    expect(manifest.files[0].path).toBe("index.html");
    expect(manifest.files[0].role).toBe("entry");
  });

  it("updates the round number", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);
    const manifest = await updateFileInManifest(
      "test-game",
      5,
      "index.html",
      "new desc",
      tmpDir,
    );
    expect(manifest.round).toBe(5);
  });

  it("throws if file not found", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);

    await expect(
      updateFileInManifest("test-game", 2, "nope.js", "desc", tmpDir),
    ).rejects.toThrow("File not found in manifest");
  });
});

describe("removeFileFromManifest", () => {
  it("removes the specified file entry", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);
    const newFile: ManifestFile = {
      path: "js/main.js",
      role: "core",
      description: "Game loop",
    };
    await addFileToManifest("test-game", 1, newFile, tmpDir);

    const manifest = await removeFileFromManifest(
      "test-game",
      2,
      "index.html",
      tmpDir,
    );

    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0].path).toBe("js/main.js");
  });

  it("updates the round number", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);
    const newFile: ManifestFile = {
      path: "js/main.js",
      role: "core",
      description: "Game loop",
    };
    await addFileToManifest("test-game", 1, newFile, tmpDir);

    const manifest = await removeFileFromManifest(
      "test-game",
      4,
      "index.html",
      tmpDir,
    );
    expect(manifest.round).toBe(4);
  });

  it("throws if file not found", async () => {
    await createManifest("test-game", 1, sampleFile, tmpDir);

    await expect(
      removeFileFromManifest("test-game", 2, "nope.js", tmpDir),
    ).rejects.toThrow("File not found in manifest");
  });
});
