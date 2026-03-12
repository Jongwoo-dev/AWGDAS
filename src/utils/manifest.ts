import type { Manifest, ManifestFile } from "../types/index.js";
import { readGameFile, writeGameFile } from "./fileManager.js";

const MANIFEST_FILENAME = "manifest.json";

/** manifest.json을 게임 디렉토리에 기록한다. */
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

/**
 * 초기 파일 하나로 새 매니페스트를 생성한다.
 *
 * @param gameName - 게임 이름
 * @param roundId - 현재 라운드 ID
 * @param firstFile - 매니페스트에 등록할 첫 번째 파일
 * @param baseDir - 출력 기본 디렉토리
 * @returns 생성된 Manifest
 */
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

/**
 * 게임 디렉토리에서 manifest.json을 읽어 파싱한다.
 *
 * @param gameName - 게임 이름
 * @param baseDir - 출력 기본 디렉토리
 * @returns 파싱된 Manifest
 */
export async function readManifest(
  gameName: string,
  baseDir?: string,
): Promise<Manifest> {
  const raw = await readGameFile(gameName, MANIFEST_FILENAME, baseDir);
  return JSON.parse(raw) as Manifest;
}

/**
 * 매니페스트에 새 파일을 추가한다.
 *
 * @param gameName - 게임 이름
 * @param roundId - 현재 라운드 ID
 * @param file - 추가할 파일 정보
 * @param baseDir - 출력 기본 디렉토리
 * @returns 갱신된 Manifest
 * @throws 이미 동일 경로의 파일이 존재할 경우 Error
 */
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

/**
 * 매니페스트에서 파일의 설명을 갱신한다.
 *
 * @param gameName - 게임 이름
 * @param roundId - 현재 라운드 ID
 * @param filePath - 갱신할 파일 경로
 * @param newDescription - 새 설명
 * @param baseDir - 출력 기본 디렉토리
 * @returns 갱신된 Manifest
 * @throws 해당 경로의 파일이 매니페스트에 없을 경우 Error
 */
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

/**
 * 매니페스트에서 파일을 제거한다.
 *
 * @param gameName - 게임 이름
 * @param roundId - 현재 라운드 ID
 * @param filePath - 제거할 파일 경로
 * @param baseDir - 출력 기본 디렉토리
 * @returns 갱신된 Manifest
 * @throws 해당 경로의 파일이 매니페스트에 없을 경우 Error
 */
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
