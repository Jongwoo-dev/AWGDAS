import type { Manifest, ManifestFile } from "../types/index.js";
import { readGameFile, writeGameFile } from "./fileManager.js";

const MANIFEST_FILENAME = "manifest.json";

async function writeManifest(
  gameName: string,
  manifest: Manifest,
  baseDir?: string,
): Promise<void> {
  await writeGameFile(
    gameName,
    MANIFEST_FILENAME,
    JSON.stringify(manifest, null, 2),
    baseDir,
  );
}

export async function createManifest(
  gameName: string,
  roundId: number,
  firstFile: ManifestFile,
  baseDir?: string,
): Promise<Manifest> {
  const manifest: Manifest = {
    gameName,
    round: roundId,
    files: [firstFile],
  };
  await writeManifest(gameName, manifest, baseDir);
  return manifest;
}

export async function readManifest(
  gameName: string,
  baseDir?: string,
): Promise<Manifest> {
  const raw = await readGameFile(gameName, MANIFEST_FILENAME, baseDir);
  return JSON.parse(raw) as Manifest;
}

export async function addFileToManifest(
  gameName: string,
  roundId: number,
  file: ManifestFile,
  baseDir?: string,
): Promise<Manifest> {
  const manifest = await readManifest(gameName, baseDir);

  const exists = manifest.files.some((f) => f.path === file.path);
  if (exists) {
    throw new Error(`File already in manifest: ${file.path}`);
  }

  manifest.files.push(file);
  manifest.round = roundId;
  await writeManifest(gameName, manifest, baseDir);
  return manifest;
}

export async function updateFileInManifest(
  gameName: string,
  roundId: number,
  filePath: string,
  newDescription: string,
  baseDir?: string,
): Promise<Manifest> {
  const manifest = await readManifest(gameName, baseDir);

  const entry = manifest.files.find((f) => f.path === filePath);
  if (!entry) {
    throw new Error(`File not found in manifest: ${filePath}`);
  }

  entry.description = newDescription;
  manifest.round = roundId;
  await writeManifest(gameName, manifest, baseDir);
  return manifest;
}

export async function removeFileFromManifest(
  gameName: string,
  roundId: number,
  filePath: string,
  baseDir?: string,
): Promise<Manifest> {
  const manifest = await readManifest(gameName, baseDir);

  const index = manifest.files.findIndex((f) => f.path === filePath);
  if (index === -1) {
    throw new Error(`File not found in manifest: ${filePath}`);
  }

  manifest.files.splice(index, 1);
  manifest.round = roundId;
  await writeManifest(gameName, manifest, baseDir);
  return manifest;
}
