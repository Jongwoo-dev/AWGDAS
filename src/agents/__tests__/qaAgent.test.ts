import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DevResult, RoundSpec, QAResult } from "../../types/index.js";

vi.mock("../../utils/anthropicClient.js", () => ({
  callAgent: vi.fn(),
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

vi.mock("../../utils/manifest.js", () => ({
  readManifest: vi.fn(),
}));

vi.mock("../../utils/fileManager.js", () => ({
  readGameFile: vi.fn(),
  gameFileExists: vi.fn(),
}));

import { runQA } from "../qaAgent.js";
import { callAgent } from "../../utils/anthropicClient.js";
import { readManifest } from "../../utils/manifest.js";
import {
  readGameFile,
  gameFileExists,
} from "../../utils/fileManager.js";

const mockCallAgent = vi.mocked(callAgent);
const mockReadManifest = vi.mocked(readManifest);
const mockReadGameFile = vi.mocked(readGameFile);
const mockGameFileExists = vi.mocked(gameFileExists);

function makeSpec(): RoundSpec {
  return {
    roundId: 1,
    gameDescription: "A simple space shooter",
    features: ["player movement"],
    acceptanceCriteria: [
      { id: "AC1", description: "Player moves with arrow keys" },
    ],
    scopeLock: [],
    maxRetries: 2,
  };
}

function makeDevResult(): DevResult {
  return {
    roundId: 1,
    implementedFeatures: ["player movement"],
    summary: "Implemented player movement",
    changedFiles: [{ path: "index.html", action: "created" }],
  };
}

function makeQAResult(overrides: Partial<QAResult> = {}): QAResult {
  return {
    roundId: 1,
    verdict: "PASS",
    fileIntegrity: true,
    results: [
      { criteriaId: "AC1", pass: true, reason: "Works correctly" },
    ],
    ...overrides,
  };
}

function setupManifestMocks(filesMissing: string[] = []) {
  mockReadManifest.mockResolvedValueOnce({
    gameName: "test-game",
    round: 1,
    files: [
      { path: "index.html", role: "entry", description: "HTML entry" },
      { path: "js/main.js", role: "core", description: "Game loop" },
    ],
  });

  // gameFileExists for integrity check
  mockGameFileExists
    .mockResolvedValueOnce(!filesMissing.includes("index.html"))
    .mockResolvedValueOnce(!filesMissing.includes("js/main.js"));

  // readGameFile for content collection
  if (!filesMissing.includes("index.html")) {
    mockReadGameFile.mockResolvedValueOnce("<html></html>");
  } else {
    mockReadGameFile.mockRejectedValueOnce(new Error("not found"));
  }
  if (!filesMissing.includes("js/main.js")) {
    mockReadGameFile.mockResolvedValueOnce("console.log('game');");
  } else {
    mockReadGameFile.mockRejectedValueOnce(new Error("not found"));
  }
}

describe("runQA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns PASS verdict when all criteria pass", async () => {
    setupManifestMocks();
    const qaResult = makeQAResult({ verdict: "PASS" });
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(qaResult),
      usage: { inputTokens: 300, outputTokens: 150 },
    });

    const result = await runQA(makeDevResult(), makeSpec(), "test-game");

    expect(result.verdict).toBe("PASS");
    expect(result.fileIntegrity).toBe(true);
  });

  it("returns REJECT verdict when criteria fail", async () => {
    setupManifestMocks();
    const qaResult = makeQAResult({
      verdict: "REJECT",
      results: [
        { criteriaId: "AC1", pass: false, reason: "Player doesn't move" },
      ],
    });
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(qaResult),
      usage: { inputTokens: 300, outputTokens: 150 },
    });

    const result = await runQA(makeDevResult(), makeSpec(), "test-game");

    expect(result.verdict).toBe("REJECT");
  });

  it("forces REJECT when file integrity fails", async () => {
    setupManifestMocks(["js/main.js"]);
    // API returns PASS, but integrity failure overrides
    const qaResult = makeQAResult({ verdict: "PASS", fileIntegrity: true });
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(qaResult),
      usage: { inputTokens: 300, outputTokens: 150 },
    });

    const result = await runQA(makeDevResult(), makeSpec(), "test-game");

    expect(result.verdict).toBe("REJECT");
    expect(result.fileIntegrity).toBe(false);
  });

  it("uses [FILE NOT FOUND] for files that fail to read", async () => {
    // All files exist in integrity check but one fails to read
    mockReadManifest.mockResolvedValueOnce({
      gameName: "test-game",
      round: 1,
      files: [
        { path: "index.html", role: "entry", description: "HTML entry" },
      ],
    });
    mockGameFileExists.mockResolvedValueOnce(true);
    mockReadGameFile.mockRejectedValueOnce(new Error("read error"));

    const qaResult = makeQAResult();
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(qaResult),
      usage: { inputTokens: 300, outputTokens: 150 },
    });

    const result = await runQA(makeDevResult(), makeSpec(), "test-game");

    // Verify callAgent was called (meaning the flow continued despite read error)
    expect(mockCallAgent).toHaveBeenCalledTimes(1);
    const userMessage = mockCallAgent.mock.calls[0][0].messages[0]
      .content as string;
    expect(userMessage).toContain("[FILE NOT FOUND]");
    expect(result.verdict).toBe("PASS");
  });

  it("passes correct role to callAgent", async () => {
    setupManifestMocks();
    const qaResult = makeQAResult();
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(qaResult),
      usage: { inputTokens: 300, outputTokens: 150 },
    });

    await runQA(makeDevResult(), makeSpec(), "test-game");

    const args = mockCallAgent.mock.calls[0][0];
    expect(args.role).toBe("qa");
  });
});
