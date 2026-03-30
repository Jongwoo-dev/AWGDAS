import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  RoundSpec,
  FeatureBreakdown,
  DevResult,
  QAResult,
  PipelineContext,
} from "../../types/index.js";
import {
  createRoundState,
  runPhase,
  isTerminalPhase,
  setSpec,
  setBreakdown,
  setDevResult,
} from "../../utils/roundStateMachine.js";

vi.mock("../../agents/plAgent.js", () => ({
  runPLInit: vi.fn(),
  evaluateQAResult: vi.fn(),
  generateFailReport: vi.fn(() => "FAIL REPORT"),
}));

vi.mock("../../agents/plannerAgent.js", () => ({
  runPlanner: vi.fn(),
}));

vi.mock("../../agents/developerAgent.js", () => ({
  runDeveloper: vi.fn(),
}));

vi.mock("../../agents/qaAgent.js", () => ({
  runQA: vi.fn(),
}));

vi.mock("../../utils/fileManager.js", () => ({
  ensureOutputDir: vi.fn(),
}));

// Import handlers (side-effect: registers all phase handlers)
import "../phaseHandlers.js";

// Import mocked modules to configure return values
import { runPLInit, evaluateQAResult } from "../../agents/plAgent.js";
import { runPlanner } from "../../agents/plannerAgent.js";
import { runDeveloper } from "../../agents/developerAgent.js";
import { runQA } from "../../agents/qaAgent.js";

const mockSpec: RoundSpec = {
  roundId: 1,
  gameDescription: "test game",
  features: ["feat-1"],
  acceptanceCriteria: [{ id: "AC-1", description: "works" }],
  scopeLock: [],
  maxRetries: 2,
};

const mockBreakdown: FeatureBreakdown = {
  roundId: 1,
  fileStructure: ["index.html"],
  features: [
    { id: "F-1", name: "Feature 1", description: "desc", targetFiles: ["index.html"], edgeCases: [] },
  ],
};

const mockDevResult: DevResult = {
  roundId: 1,
  implementedFeatures: ["feat-1"],
  summary: "done",
  changedFiles: [{ path: "index.html", action: "created" }],
};

const makeQAResult = (verdict: "PASS" | "REJECT"): QAResult => ({
  roundId: 1,
  verdict,
  fileIntegrity: true,
  results: [{ criteriaId: "AC-1", pass: verdict === "PASS", reason: "ok" }],
});

const context: PipelineContext = { gameDescription: "test game", gameName: "test-game" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("phaseHandlers — PASS path", () => {
  it("dispatches PL_INIT → PLANNER_DEFINE", async () => {
    vi.mocked(runPLInit).mockResolvedValue(mockSpec);

    const state = createRoundState(1);
    const next = await runPhase(state, context);

    expect(next.phase).toBe("PLANNER_DEFINE");
    expect(next.currentSpec).toBe(mockSpec);
    expect(runPLInit).toHaveBeenCalledWith("test game", 1);
  });

  it("dispatches PLANNER_DEFINE → DEV_IMPLEMENT", async () => {
    vi.mocked(runPlanner).mockResolvedValue(mockBreakdown);

    let state = createRoundState(1);
    state = setSpec(state, mockSpec);
    state = { ...state, phase: "PLANNER_DEFINE" };
    const next = await runPhase(state, context);

    expect(next.phase).toBe("DEV_IMPLEMENT");
    expect(next.currentBreakdown).toBe(mockBreakdown);
  });

  it("dispatches DEV_IMPLEMENT → QA_REVIEW", async () => {
    vi.mocked(runDeveloper).mockResolvedValue(mockDevResult);

    let state = createRoundState(1);
    state = setSpec(state, mockSpec);
    state = setBreakdown(state, mockBreakdown);
    state = { ...state, phase: "DEV_IMPLEMENT" };
    const next = await runPhase(state, context);

    expect(next.phase).toBe("QA_REVIEW");
    expect(next.currentDevResult).toBe(mockDevResult);
  });

  it("dispatches QA_REVIEW → RELEASE on PASS", async () => {
    const qaResult = makeQAResult("PASS");
    vi.mocked(runQA).mockResolvedValue(qaResult);
    vi.mocked(evaluateQAResult).mockReturnValue("RELEASE");

    let state = createRoundState(1);
    state = setSpec(state, mockSpec);
    state = setDevResult(state, mockDevResult);
    state = { ...state, phase: "QA_REVIEW" };
    const next = await runPhase(state, context);

    expect(next.phase).toBe("RELEASE");
  });

  it("dispatches RELEASE → DONE", async () => {
    let state = createRoundState(1);
    state = { ...state, phase: "RELEASE" };
    const next = await runPhase(state, context);

    expect(next.phase).toBe("DONE");
    expect(isTerminalPhase(next.phase)).toBe(true);
  });
});

describe("phaseHandlers — RETRY path", () => {
  it("dispatches QA_REVIEW → RETRY_CHECK on REJECT", async () => {
    const qaResult = makeQAResult("REJECT");
    vi.mocked(runQA).mockResolvedValue(qaResult);
    vi.mocked(evaluateQAResult).mockReturnValue("RETRY");

    let state = createRoundState(1);
    state = setSpec(state, mockSpec);
    state = setDevResult(state, mockDevResult);
    state = { ...state, phase: "QA_REVIEW" };
    const next = await runPhase(state, context);

    expect(next.phase).toBe("RETRY_CHECK");
  });

  it("dispatches RETRY_CHECK → DEV_IMPLEMENT with incremented retry", async () => {
    const qaResult = makeQAResult("REJECT");
    vi.mocked(evaluateQAResult).mockReturnValue("RETRY");

    let state = createRoundState(1);
    state = setSpec(state, mockSpec);
    state = { ...state, phase: "RETRY_CHECK", currentQAResult: qaResult };
    const next = await runPhase(state, context);

    expect(next.phase).toBe("DEV_IMPLEMENT");
    expect(next.retryCount).toBe(1);
  });
});

describe("phaseHandlers — FAIL path", () => {
  it("dispatches RETRY_CHECK → FAILED when retries exhausted", async () => {
    const qaResult = makeQAResult("REJECT");
    const exhaustedSpec = { ...mockSpec, maxRetries: 1 };

    let state = createRoundState(1);
    state = setSpec(state, exhaustedSpec);
    // retryCount === maxRetries → canRetry() returns false
    state = { ...state, phase: "RETRY_CHECK", retryCount: 1, currentQAResult: qaResult };
    const next = await runPhase(state, context);

    expect(next.phase).toBe("FAILED");
    expect(isTerminalPhase(next.phase)).toBe(true);
  });
});

describe("phaseHandlers — full loop", () => {
  it("runs PL_INIT through DONE in a state machine loop", async () => {
    vi.mocked(runPLInit).mockResolvedValue(mockSpec);
    vi.mocked(runPlanner).mockResolvedValue(mockBreakdown);
    vi.mocked(runDeveloper).mockResolvedValue(mockDevResult);
    vi.mocked(runQA).mockResolvedValue(makeQAResult("PASS"));
    vi.mocked(evaluateQAResult).mockReturnValue("RELEASE");

    let state = createRoundState(1);
    while (!isTerminalPhase(state.phase)) {
      state = await runPhase(state, context);
    }

    expect(state.phase).toBe("DONE");
    expect(runPLInit).toHaveBeenCalledTimes(1);
    expect(runPlanner).toHaveBeenCalledTimes(1);
    expect(runDeveloper).toHaveBeenCalledTimes(1);
    expect(runQA).toHaveBeenCalledTimes(1);
  });

  it("retries once then passes", async () => {
    vi.mocked(runPLInit).mockResolvedValue(mockSpec);
    vi.mocked(runPlanner).mockResolvedValue(mockBreakdown);
    vi.mocked(runDeveloper).mockResolvedValue(mockDevResult);

    const rejectResult = makeQAResult("REJECT");
    const passResult = makeQAResult("PASS");
    vi.mocked(runQA)
      .mockResolvedValueOnce(rejectResult)
      .mockResolvedValueOnce(passResult);
    // evaluateQAResult is only called in QA_REVIEW now (not RETRY_CHECK)
    vi.mocked(evaluateQAResult)
      .mockReturnValueOnce("RETRY")
      .mockReturnValueOnce("RELEASE");

    let state = createRoundState(1);
    while (!isTerminalPhase(state.phase)) {
      state = await runPhase(state, context);
    }

    expect(state.phase).toBe("DONE");
    expect(state.retryCount).toBe(1);
    expect(runDeveloper).toHaveBeenCalledTimes(2);
    expect(runQA).toHaveBeenCalledTimes(2);
  });
});
