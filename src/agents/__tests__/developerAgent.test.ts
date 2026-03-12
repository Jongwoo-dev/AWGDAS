import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  FeatureBreakdown,
  DevResult,
  QAResult,
} from "../../types/index.js";
import type { ToolAgentResponse } from "../../utils/anthropicClient.js";

vi.mock("../../utils/anthropicClient.js", () => ({
  callAgentWithTools: vi.fn(),
}));

vi.mock("../../utils/responseParser.js", () => ({
  parseAndValidate: vi.fn((text: string) => JSON.parse(text)),
}));

vi.mock("../../utils/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  }),
}));

vi.mock("../../utils/fileManager.js", () => ({
  writeGameFile: vi.fn(),
  readGameFile: vi.fn(),
  deleteGameFile: vi.fn(),
  gameFileExists: vi.fn(),
}));

vi.mock("../../utils/manifest.js", () => ({
  createManifest: vi.fn(),
  readManifest: vi.fn(),
  addFileToManifest: vi.fn(),
  updateFileInManifest: vi.fn(),
  removeFileFromManifest: vi.fn(),
}));

import { runDeveloper } from "../developerAgent.js";
import { callAgentWithTools } from "../../utils/anthropicClient.js";
import {
  writeGameFile,
  readGameFile,
  deleteGameFile,
  gameFileExists,
} from "../../utils/fileManager.js";
import {
  readManifest,
  createManifest,
  addFileToManifest,
  removeFileFromManifest,
} from "../../utils/manifest.js";

const mockCallAgentWithTools = vi.mocked(callAgentWithTools);
const mockWriteGameFile = vi.mocked(writeGameFile);
const mockReadGameFile = vi.mocked(readGameFile);
const mockDeleteGameFile = vi.mocked(deleteGameFile);
const mockGameFileExists = vi.mocked(gameFileExists);
const mockReadManifest = vi.mocked(readManifest);
const mockCreateManifest = vi.mocked(createManifest);
const mockAddFileToManifest = vi.mocked(addFileToManifest);
const mockRemoveFileFromManifest = vi.mocked(removeFileFromManifest);

function makeBreakdown(): FeatureBreakdown {
  return {
    roundId: 1,
    fileStructure: ["index.html", "js/main.js"],
    features: [
      {
        id: "F1",
        name: "player",
        description: "Player logic",
        targetFiles: ["js/main.js"],
        edgeCases: [],
      },
    ],
  };
}

function makeDevResult(): DevResult {
  return {
    roundId: 1,
    implementedFeatures: ["player"],
    summary: "Implemented player movement",
    changedFiles: [
      { path: "index.html", action: "created" },
      { path: "js/main.js", action: "created" },
    ],
  };
}

function makeEndTurnResponse(devResult: DevResult): ToolAgentResponse {
  return {
    content: [
      { type: "text", text: JSON.stringify(devResult), citations: null },
    ] as ToolAgentResponse["content"],
    stopReason: "end_turn",
    usage: { inputTokens: 500, outputTokens: 300 },
  };
}

function makeToolUseResponse(
  toolName: string,
  toolInput: Record<string, string>,
): ToolAgentResponse {
  return {
    content: [
      { type: "text", text: "Processing...", citations: null },
      {
        type: "tool_use",
        id: `toolu_${Date.now()}`,
        name: toolName,
        input: toolInput,
      },
    ] as ToolAgentResponse["content"],
    stopReason: "tool_use",
    usage: { inputTokens: 200, outputTokens: 100 },
  };
}

describe("runDeveloper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns DevResult on immediate end_turn (no tool use)", async () => {
    const devResult = makeDevResult();
    mockCallAgentWithTools.mockResolvedValueOnce(
      makeEndTurnResponse(devResult),
    );

    const result = await runDeveloper(makeBreakdown(), "test-game", false);

    expect(result).toEqual(devResult);
    expect(mockCallAgentWithTools).toHaveBeenCalledTimes(1);
  });

  it("handles write_file tool then end_turn", async () => {
    mockGameFileExists.mockResolvedValueOnce(false);
    mockReadManifest.mockRejectedValueOnce(new Error("not found"));
    mockCreateManifest.mockResolvedValueOnce({
      gameName: "test-game",
      round: 1,
      files: [{ path: "index.html", role: "entry", description: "index.html" }],
    });

    mockCallAgentWithTools.mockResolvedValueOnce(
      makeToolUseResponse("write_file", {
        path: "index.html",
        content: "<html></html>",
      }),
    );

    const devResult = makeDevResult();
    mockCallAgentWithTools.mockResolvedValueOnce(
      makeEndTurnResponse(devResult),
    );

    const result = await runDeveloper(makeBreakdown(), "test-game", false);

    expect(result).toEqual(devResult);
    expect(mockWriteGameFile).toHaveBeenCalledWith(
      "test-game",
      "index.html",
      "<html></html>",
    );
    expect(mockCallAgentWithTools).toHaveBeenCalledTimes(2);
  });

  it("handles read_file tool", async () => {
    mockReadGameFile.mockResolvedValueOnce("<html>content</html>");

    mockCallAgentWithTools.mockResolvedValueOnce(
      makeToolUseResponse("read_file", { path: "index.html" }),
    );

    const devResult = makeDevResult();
    mockCallAgentWithTools.mockResolvedValueOnce(
      makeEndTurnResponse(devResult),
    );

    const result = await runDeveloper(makeBreakdown(), "test-game", false);

    expect(result).toEqual(devResult);
    expect(mockReadGameFile).toHaveBeenCalledWith("test-game", "index.html");
  });

  it("handles delete_file tool", async () => {
    mockCallAgentWithTools.mockResolvedValueOnce(
      makeToolUseResponse("delete_file", { path: "old.js" }),
    );

    const devResult = makeDevResult();
    mockCallAgentWithTools.mockResolvedValueOnce(
      makeEndTurnResponse(devResult),
    );

    const result = await runDeveloper(makeBreakdown(), "test-game", false);

    expect(result).toEqual(devResult);
    expect(mockDeleteGameFile).toHaveBeenCalledWith("test-game", "old.js");
    expect(mockRemoveFileFromManifest).toHaveBeenCalledWith(
      "test-game",
      1,
      "old.js",
    );
  });

  it("includes QA feedback in user message on retry", async () => {
    const qaFeedback: QAResult = {
      roundId: 1,
      verdict: "REJECT",
      fileIntegrity: true,
      results: [
        { criteriaId: "AC1", pass: false, reason: "Player doesn't move" },
      ],
    };

    const devResult = makeDevResult();
    mockCallAgentWithTools.mockResolvedValueOnce(
      makeEndTurnResponse(devResult),
    );

    await runDeveloper(makeBreakdown(), "test-game", true, qaFeedback);

    const args = mockCallAgentWithTools.mock.calls[0][0];
    const userMessage = args.messages[0].content as string;
    expect(userMessage).toContain("QA Feedback");
    expect(userMessage).toContain("Player doesn't move");
  });

  it("throws when end_turn has no text block", async () => {
    mockCallAgentWithTools.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "write_file",
          input: {},
        },
      ] as ToolAgentResponse["content"],
      stopReason: "end_turn",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    await expect(
      runDeveloper(makeBreakdown(), "test-game", false),
    ).rejects.toThrow("no text");
  });

  it("throws when max tool loops exceeded", async () => {
    // Return tool_use 51 times to exceed MAX_TOOL_LOOPS (50)
    for (let i = 0; i < 51; i++) {
      mockCallAgentWithTools.mockResolvedValueOnce(
        makeToolUseResponse("read_file", { path: "index.html" }),
      );
      mockReadGameFile.mockResolvedValueOnce("<html></html>");
    }

    await expect(
      runDeveloper(makeBreakdown(), "test-game", false),
    ).rejects.toThrow("maximum tool loop");
  });
});
