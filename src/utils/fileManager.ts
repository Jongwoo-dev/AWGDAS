import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "output";

/** 게임 디렉토리의 절대 경로를 반환한다. */
function resolveGameDir(gameName: string, baseDir?: string): string {
  const base = baseDir ?? path.join(process.cwd(), DEFAULT_OUTPUT_DIR);
  return path.resolve(base, gameName);
}

/** 경로가 게임 디렉토리 외부를 가리키면 에러를 던진다 (경로 순회 방지). */
function assertWithinBase(resolved: string, gameDir: string): void {
  const normalized = path.normalize(resolved);
  if (!normalized.startsWith(gameDir)) {
    throw new Error(`Path traversal detected: ${resolved} is outside ${gameDir}`);
  }
}

/**
 * 게임 출력 디렉토리를 생성하고 절대 경로를 반환한다.
 *
 * @param gameName - 게임 이름 (디렉토리명으로 사용)
 * @param baseDir - 출력 기본 디렉토리 (기본값: process.cwd()/output)
 * @returns 생성된 게임 디렉토리의 절대 경로
 */
export async function ensureOutputDir(
  gameName: string,
  baseDir?: string,
): Promise<string> {
  const gameDir = resolveGameDir(gameName, baseDir);
  await fs.mkdir(gameDir, { recursive: true });
  return gameDir;
}

/**
 * 게임 출력 디렉토리에 파일을 작성한다.
 *
 * @param gameName - 게임 이름
 * @param filePath - 게임 루트 기준 상대 경로
 * @param content - 파일 내용
 * @param baseDir - 출력 기본 디렉토리
 * @throws 경로가 게임 디렉토리 외부를 가리킬 경우 Error
 */
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

/**
 * 게임 출력 디렉토리에서 파일을 읽는다.
 *
 * @param gameName - 게임 이름
 * @param filePath - 게임 루트 기준 상대 경로
 * @param baseDir - 출력 기본 디렉토리
 * @returns 파일 내용 문자열
 * @throws 경로가 게임 디렉토리 외부를 가리킬 경우 Error
 */
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

/**
 * 게임 출력 디렉토리에서 파일을 삭제한다.
 *
 * @param gameName - 게임 이름
 * @param filePath - 게임 루트 기준 상대 경로
 * @param baseDir - 출력 기본 디렉토리
 * @throws 경로가 게임 디렉토리 외부를 가리킬 경우 Error
 */
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

/**
 * 게임 출력 디렉토리에 파일이 존재하는지 확인한다.
 *
 * @param gameName - 게임 이름
 * @param filePath - 게임 루트 기준 상대 경로
 * @param baseDir - 출력 기본 디렉토리
 * @returns 파일 존재 여부
 * @throws 경로가 게임 디렉토리 외부를 가리킬 경우 Error
 */
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
