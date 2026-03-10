import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "output";

function resolveGameDir(gameName: string, baseDir?: string): string {
  const base = baseDir ?? path.join(process.cwd(), DEFAULT_OUTPUT_DIR);
  return path.resolve(base, gameName);
}

function assertWithinBase(resolved: string, gameDir: string): void {
  const normalized = path.normalize(resolved);
  if (!normalized.startsWith(gameDir)) {
    throw new Error(`Path traversal detected: ${resolved} is outside ${gameDir}`);
  }
}

export async function ensureOutputDir(
  gameName: string,
  baseDir?: string,
): Promise<string> {
  const gameDir = resolveGameDir(gameName, baseDir);
  await fs.mkdir(gameDir, { recursive: true });
  return gameDir;
}

export async function writeGameFile(
  gameName: string,
  filePath: string,
  content: string,
  baseDir?: string,
): Promise<void> {
  const gameDir = resolveGameDir(gameName, baseDir);
  const resolved = path.resolve(gameDir, filePath);
  assertWithinBase(resolved, gameDir);

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, "utf-8");
}

export async function readGameFile(
  gameName: string,
  filePath: string,
  baseDir?: string,
): Promise<string> {
  const gameDir = resolveGameDir(gameName, baseDir);
  const resolved = path.resolve(gameDir, filePath);
  assertWithinBase(resolved, gameDir);

  return fs.readFile(resolved, "utf-8");
}

export async function deleteGameFile(
  gameName: string,
  filePath: string,
  baseDir?: string,
): Promise<void> {
  const gameDir = resolveGameDir(gameName, baseDir);
  const resolved = path.resolve(gameDir, filePath);
  assertWithinBase(resolved, gameDir);

  await fs.unlink(resolved);
}

export async function gameFileExists(
  gameName: string,
  filePath: string,
  baseDir?: string,
): Promise<boolean> {
  const gameDir = resolveGameDir(gameName, baseDir);
  const resolved = path.resolve(gameDir, filePath);
  assertWithinBase(resolved, gameDir);

  try {
    await fs.access(resolved);
    return true;
  } catch {
    return false;
  }
}
