import type { DevResult, RoundSpec, QAResult, Manifest } from "../types/index.js";
import { callAgent } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseAndValidate } from "../utils/responseParser.js";
import { readManifest } from "../utils/manifest.js";
import { readGameFile, gameFileExists } from "../utils/fileManager.js";
import { QA_SYSTEM_PROMPT } from "./prompts/index.js";

const logger = createLogger({ agent: "qa" });

/** 매니페스트에 등록된 파일의 실제 존재 여부를 검증한다. */
async function checkFileIntegrity(
  manifest: Manifest,
  gameName: string,
): Promise<{ integrity: boolean; missingFiles: string[] }> {
  const missingFiles: string[] = [];

  for (const file of manifest.files) {
    const exists = await gameFileExists(gameName, file.path);
    if (!exists) {
      missingFiles.push(file.path);
    }
  }

  return {
    integrity: missingFiles.length === 0,
    missingFiles,
  };
}

/** 매니페스트의 모든 파일 내용을 읽어 반환한다. 읽기 실패 시 "[FILE NOT FOUND]"로 대체한다. */
async function readAllGameFiles(
  manifest: Manifest,
  gameName: string,
): Promise<{ path: string; content: string }[]> {
  const fileContents: { path: string; content: string }[] = [];

  for (const file of manifest.files) {
    try {
      const content = await readGameFile(gameName, file.path);
      fileContents.push({ path: file.path, content });
    } catch {
      fileContents.push({ path: file.path, content: "[FILE NOT FOUND]" });
    }
  }

  return fileContents;
}

/** QA 에이전트에 전달할 사용자 메시지를 조립한다. */
function buildUserMessage(
  devResult: DevResult,
  spec: RoundSpec,
  manifest: Manifest,
  fileContents: { path: string; content: string }[],
  fileIntegrity: boolean,
  missingFiles: string[],
): string {
  const parts: string[] = [];

  parts.push("## DevResult\n" + JSON.stringify(devResult, null, 2));

  parts.push(
    "## Acceptance Criteria\n" +
      spec.acceptanceCriteria
        .map((ac) => `- ${ac.id}: ${ac.description}`)
        .join("\n"),
  );

  parts.push("## manifest.json\n" + JSON.stringify(manifest, null, 2));

  if (!fileIntegrity) {
    parts.push(
      "## File Integrity Warning\nMissing files: " + missingFiles.join(", "),
    );
  }

  parts.push("## File Contents");
  for (const file of fileContents) {
    parts.push(`### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``);
  }

  return parts.join("\n\n");
}

/**
 * 개발 결과를 수락 기준에 따라 검증한다.
 * 파일 무결성 실패 시 verdict를 자동으로 REJECT로 강제한다.
 *
 * @param devResult - Developer의 구현 결과
 * @param spec - PL이 생성한 라운드 스펙
 * @param gameName - 게임 이름 (출력 디렉토리명)
 * @returns 파싱 및 검증된 QAResult
 * @throws AgentCallError - API 호출 실패 시
 * @throws ResponseParseError | ValidationError - 응답 파싱 실패 시
 */
export async function runQA(
  devResult: DevResult,
  spec: RoundSpec,
  gameName: string,
): Promise<QAResult> {
  logger.info("QA_REVIEW started", { roundId: devResult.roundId, gameName });

  const manifest = await readManifest(gameName);
  logger.info("Manifest loaded", { files: manifest.files.length });

  const { integrity, missingFiles } = await checkFileIntegrity(
    manifest,
    gameName,
  );
  if (!integrity) {
    logger.warn("File integrity check failed", { missingFiles });
  }

  const fileContents = await readAllGameFiles(manifest, gameName);

  const userMessage = buildUserMessage(
    devResult,
    spec,
    manifest,
    fileContents,
    integrity,
    missingFiles,
  );

  const response = await callAgent({
    role: "qa",
    systemPrompt: QA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  logger.info("QA API call completed", {
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  });

  const qaResult = parseAndValidate<QAResult>(response.text, "QA QAResult", [
    "roundId",
    "verdict",
    "fileIntegrity",
    "results",
  ]);

  if (!integrity) {
    qaResult.fileIntegrity = false;
    qaResult.verdict = "REJECT";
    logger.warn("Verdict forced to REJECT due to file integrity failure");
  }

  logger.info("QAResult parsed", {
    verdict: qaResult.verdict,
    fileIntegrity: qaResult.fileIntegrity,
    results: qaResult.results.length,
  });

  return qaResult;
}
