import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RoundSpec, RoundState, QAResult } from "../../types/index.js";

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

vi.mock("../../utils/roundStateMachine.js", () => ({
  canRetry: vi.fn(),
}));

import { runPLInit, evaluateQAResult, generateFailReport } from "../plAgent.js";
import { callAgent } from "../../utils/anthropicClient.js";
import { canRetry } from "../../utils/roundStateMachine.js";

const mockCallAgent = vi.mocked(callAgent);
const mockCanRetry = vi.mocked(canRetry);

function makeSpec(overrides: Partial<RoundSpec> = {}): RoundSpec {
  return {
    roundId: 1,
    gameDescription: "A simple space shooter",
    features: ["player movement", "shooting"],
    acceptanceCriteria: [
      { id: "AC1", description: "Player moves with arrow keys" },
      { id: "AC2", description: "Player can shoot" },
    ],
    scopeLock: ["No power-ups"],
    maxRetries: 2,
    ...overrides,
  };
}

function makeState(overrides: Partial<RoundState> = {}): RoundState {
  return {
    roundId: 1,
    retryCount: 0,
    backlog: [],
    phase: "QA_REVIEW",
    currentSpec: makeSpec(),
    currentBreakdown: null,
    currentDevResult: null,
    currentQAResult: null,
    ...overrides,
  };
}

function makeQAResult(overrides: Partial<QAResult> = {}): QAResult {
  return {
    roundId: 1,
    verdict: "PASS",
    fileIntegrity: true,
    results: [
      { criteriaId: "AC1", pass: true, reason: "Works correctly" },
      { criteriaId: "AC2", pass: true, reason: "Works correctly" },
    ],
    ...overrides,
  };
}

describe("runPLInit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid RoundSpec from API response", async () => {
    const spec = makeSpec();
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(spec),
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await runPLInit("A simple space shooter", 1);

    expect(result).toEqual(spec);
  });

  it("passes correct role and messages to callAgent", async () => {
    const spec = makeSpec();
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(spec),
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    await runPLInit("My game", 1);

    expect(mockCallAgent).toHaveBeenCalledTimes(1);
    const args = mockCallAgent.mock.calls[0][0];
    expect(args.role).toBe("pl");
    expect(args.messages[0].content).toContain("My game");
    expect(args.messages[0].content).toContain("1");
  });
});

describe("evaluateQAResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns RELEASE when verdict is PASS", () => {
    const state = makeState();
    const qaResult = makeQAResult({ verdict: "PASS" });

    expect(evaluateQAResult(state, qaResult)).toBe("RELEASE");
  });

  it("returns RETRY when verdict is REJECT and canRetry is true", () => {
    const state = makeState();
    const qaResult = makeQAResult({ verdict: "REJECT" });
    mockCanRetry.mockReturnValueOnce(true);

    expect(evaluateQAResult(state, qaResult)).toBe("RETRY");
  });

  it("returns FAIL when verdict is REJECT and canRetry is false", () => {
    const state = makeState();
    const qaResult = makeQAResult({ verdict: "REJECT" });
    mockCanRetry.mockReturnValueOnce(false);

    expect(evaluateQAResult(state, qaResult)).toBe("FAIL");
  });
});

describe("generateFailReport", () => {
  it("produces correct format with failed ACs", () => {
    const qaResult = makeQAResult({
      verdict: "REJECT",
      results: [
        { criteriaId: "AC1", pass: true, reason: "OK" },
        { criteriaId: "AC2", pass: false, reason: "Broken" },
        { criteriaId: "AC3", pass: false, reason: "Missing" },
      ],
    });
    const state = makeState({
      phase: "FAILED",
      retryCount: 2,
      currentQAResult: qaResult,
      currentSpec: makeSpec({ maxRetries: 2 }),
    });

    const report = generateFailReport(state, "QA rejected");

    expect(report).toContain("ROUND 1");
    expect(report).toContain("FAILED");
    expect(report).toContain("Retries  : 2/2");
    expect(report).toContain("Reason   : QA rejected");
    expect(report).toContain("AC2");
    expect(report).toContain("AC3");
  });

  it("shows N/A when no QAResult is present", () => {
    const state = makeState({
      phase: "FAILED",
      currentQAResult: null,
      currentSpec: null,
    });

    const report = generateFailReport(state, "Unknown error");

    expect(report).toContain("Failed AC: N/A");
    expect(report).toContain("Retries  : 0/0");
  });
});
