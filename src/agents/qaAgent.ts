import type { DevResult, RoundSpec, QAResult, Manifest } from "../types/index.js";
import { callAgent } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseJsonResponse } from "../utils/parseJson.js";
import { readManifest } from "../utils/manifest.js";
import { readGameFile, gameFileExists } from "../utils/fileManager.js";
import { QA_SYSTEM_PROMPT } from "./prompts/index.js";

const logger = createLogger({ agent: "qa" });

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

  const qaResult = parseJsonResponse<QAResult>(response.text, "QA QAResult");

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
