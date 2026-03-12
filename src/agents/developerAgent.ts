import type Anthropic from "@anthropic-ai/sdk";
import type {
  FeatureBreakdown,
  DevResult,
  QAResult,
  FileAction,
  ManifestFile,
  FileRole,
} from "../types/index.js";
import { callAgentWithTools } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseAndValidate } from "../utils/responseParser.js";
import {
  writeGameFile,
  readGameFile,
  deleteGameFile,
  gameFileExists,
} from "../utils/fileManager.js";
import {
  createManifest,
  readManifest,
  addFileToManifest,
  updateFileInManifest,
  removeFileFromManifest,
} from "../utils/manifest.js";
import { DEVELOPER_SYSTEM_PROMPT } from "./prompts/index.js";

const logger = createLogger({ agent: "developer" });

/** 무한 루프 방지를 위한 도구 호출 최대 반복 횟수. */
const MAX_TOOL_LOOPS = 50;

/** Developer 에이전트에 제공하는 파일 조작 도구 정의. */
const TOOLS: Anthropic.Tool[] = [
  {
    name: "write_file",
    description:
      "Create or overwrite a file in the game output directory. Path is relative to the game root (e.g. 'index.html', 'js/main.js').",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path" },
        content: { type: "string", description: "File content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "read_file",
    description:
      "Read a file from the game output directory. Path is relative to the game root.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path" },
      },
      required: ["path"],
    },
  },
  {
    name: "delete_file",
    description:
      "Delete a file from the game output directory. Path is relative to the game root.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path" },
      },
      required: ["path"],
    },
  },
];

/** 도구 호출 시 전달되는 입력 파라미터. */
interface ToolInput {
  path: string;
  content?: string;
}

/** 파일 경로로부터 FileRole을 추론한다. */
function inferRole(filePath: string): FileRole {
  if (filePath === "index.html") return "entry";
  if (filePath.endsWith(".html")) return "entry";
  if (filePath.includes("main.")) return "core";
  if (filePath.includes("render")) return "render";
  if (
    filePath.endsWith(".png") ||
    filePath.endsWith(".jpg") ||
    filePath.endsWith(".svg") ||
    filePath.endsWith(".css")
  )
    return "asset";
  return "feature";
}

/** 파일을 작성하고 trackedFiles와 매니페스트를 갱신한다. */
async function handleWriteFile(
  gameName: string,
  roundId: number,
  input: ToolInput,
  trackedFiles: Map<string, FileAction>,
): Promise<string> {
  const filePath = input.path;
  const content = input.content ?? "";
  const existed = await gameFileExists(gameName, filePath);

  await writeGameFile(gameName, filePath, content);

  const action: FileAction = existed ? "modified" : "created";
  trackedFiles.set(filePath, action);

  // manifest.json 자체는 manifest로 추적하지 않는다
  if (filePath !== "manifest.json") {
    await updateManifest(gameName, roundId, filePath, action);
  }

  logger.info("File written", { path: filePath, action });
  return `File ${action}: ${filePath}`;
}

/** 파일 내용을 읽어 반환한다. */
async function handleReadFile(
  gameName: string,
  input: ToolInput,
): Promise<string> {
  const content = await readGameFile(gameName, input.path);
  logger.info("File read", { path: input.path });
  return content;
}

/** 파일을 삭제하고 trackedFiles와 매니페스트를 갱신한다. */
async function handleDeleteFile(
  gameName: string,
  roundId: number,
  input: ToolInput,
  trackedFiles: Map<string, FileAction>,
): Promise<string> {
  await deleteGameFile(gameName, input.path);
  trackedFiles.set(input.path, "deleted");

  if (input.path !== "manifest.json") {
    await removeFileFromManifest(gameName, roundId, input.path);
  }

  logger.info("File deleted", { path: input.path });
  return `File deleted: ${input.path}`;
}

/** 파일 액션에 따라 매니페스트를 생성하거나 갱신한다. */
async function updateManifest(
  gameName: string,
  roundId: number,
  filePath: string,
  action: FileAction,
): Promise<void> {
  if (action === "deleted") {
    return;
  }

  let manifestExists = true;
  try {
    await readManifest(gameName);
  } catch {
    manifestExists = false;
  }

  if (!manifestExists) {
    const file: ManifestFile = {
      path: filePath,
      role: inferRole(filePath),
      description: filePath,
    };
    await createManifest(gameName, roundId, file);
    return;
  }

  if (action === "created") {
    const file: ManifestFile = {
      path: filePath,
      role: inferRole(filePath),
      description: filePath,
    };
    await addFileToManifest(gameName, roundId, file);
  } else {
    await updateFileInManifest(gameName, roundId, filePath, filePath);
  }
}

/** 단일 도구 호출을 실행하고 ToolResultBlockParam을 반환한다. */
async function processToolUse(
  gameName: string,
  roundId: number,
  block: Anthropic.ToolUseBlock,
  trackedFiles: Map<string, FileAction>,
): Promise<Anthropic.ToolResultBlockParam> {
  const input = block.input as ToolInput;

  try {
    let result: string;

    switch (block.name) {
      case "write_file":
        result = await handleWriteFile(gameName, roundId, input, trackedFiles);
        break;
      case "read_file":
        result = await handleReadFile(gameName, input);
        break;
      case "delete_file":
        result = await handleDeleteFile(
          gameName,
          roundId,
          input,
          trackedFiles,
        );
        break;
      default:
        result = `Unknown tool: ${block.name}`;
    }

    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Tool execution failed", { tool: block.name, error: message });
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Error: ${message}`,
      is_error: true,
    };
  }
}

/**
 * FeatureBreakdown에 따라 게임 파일을 구현한다.
 * 도구 루프를 통해 파일을 생성/수정/삭제하고, 최종 DevResult를 반환한다.
 *
 * @param breakdown - Planner가 생성한 기능 분해
 * @param gameName - 게임 이름 (출력 디렉토리명)
 * @param isRetry - 재시도 여부
 * @param qaFeedback - 재시도 시 이전 QA 결과 (수정 대상 피드백)
 * @returns 파싱 및 검증된 DevResult
 * @throws AgentCallError - API 호출 실패 시
 * @throws 도구 루프가 MAX_TOOL_LOOPS를 초과할 경우 Error
 */
export async function runDeveloper(
  breakdown: FeatureBreakdown,
  gameName: string,
  isRetry: boolean,
  qaFeedback?: QAResult,
): Promise<DevResult> {
  logger.info("DEV_IMPLEMENT started", {
    roundId: breakdown.roundId,
    gameName,
    isRetry,
  });

  let userContent = JSON.stringify(breakdown);
  if (isRetry && qaFeedback) {
    userContent += `\n\n--- QA Feedback (fix these issues) ---\n${JSON.stringify(qaFeedback)}`;
  }

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  const trackedFiles = new Map<string, FileAction>();

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const response = await callAgentWithTools({
      role: "developer",
      systemPrompt: DEVELOPER_SYSTEM_PROMPT,
      messages,
      tools: TOOLS,
    });

    logger.info("Developer API call completed", {
      loop,
      stopReason: response.stopReason,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });

    if (response.stopReason === "end_turn") {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      if (!textBlock) {
        throw new Error("Developer returned no text in final response");
      }

      const devResult = parseAndValidate<DevResult>(
        textBlock.text,
        "Developer DevResult",
        ["roundId", "implementedFeatures", "summary", "changedFiles"],
      );

      logger.info("DevResult parsed", {
        features: devResult.implementedFeatures.length,
        files: devResult.changedFiles.length,
      });

      return devResult;
    }

    // tool_use: 모든 도구 호출을 순차 처리
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      throw new Error(
        `Developer stopped with reason "${response.stopReason}" but no tool_use blocks`,
      );
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await processToolUse(
        gameName,
        breakdown.roundId,
        block,
        trackedFiles,
      );
      toolResults.push(result);
    }

    // assistant turn (API 응답) + user turn (도구 결과)
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(
    `Developer exceeded maximum tool loop iterations (${MAX_TOOL_LOOPS})`,
  );
}
