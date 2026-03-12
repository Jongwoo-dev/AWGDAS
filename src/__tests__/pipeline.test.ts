import { describe, it, expect, vi } from "vitest";
import type {
  RoundSpec,
  FeatureBreakdown,
  DevResult,
  QAResult,
} from "../types/index.js";

// Mock dependencies that plAgent.ts imports at module level
vi.mock("../utils/anthropicClient.js", () => ({
  callAgent: vi.fn(),
}));

vi.mock("../utils/parseJson.js", () => ({
  parseJsonResponse: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  }),
}));

import {
  createRoundState,
  transition,
  setSpec,
  setBreakdown,
  setDevResult,
  setQAResult,
  canRetry,
  incrementRetry,
} from "../utils/roundStateMachine.js";
import {
  evaluateQAResult,
  generateFailReport,
} from "../agents/plAgent.js";

// Use real roundStateMachine + real evaluateQAResult (no mocks)
// to verify data contract compatibility across agents

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

function makeBreakdown(spec: RoundSpec): FeatureBreakdown {
  return {
    roundId: spec.roundId,
    fileStructure: ["index.html", "js/main.js", "js/player.js"],
    features: spec.features.map((f, i) => ({
      id: `F${i + 1}`,
      name: f,
      description: `Implement ${f}`,
      targetFiles: ["js/main.js"],
      edgeCases: [],
    })),
  };
}

function makeDevResult(breakdown: FeatureBreakdown): DevResult {
  return {
    roundId: breakdown.roundId,
    implementedFeatures: breakdown.features.map((f) => f.name),
    summary: "All features implemented",
    changedFiles: breakdown.fileStructure.map((path) => ({
      path,
      action: "created" as const,
    })),
  };
}

function makeQAResult(
  spec: RoundSpec,
  verdict: "PASS" | "REJECT",
): QAResult {
  return {
    roundId: spec.roundId,
    verdict,
    fileIntegrity: true,
    results: spec.acceptanceCriteria.map((ac) => ({
      criteriaId: ac.id,
      pass: verdict === "PASS",
      reason: verdict === "PASS" ? "Works" : "Broken",
    })),
  };
}

describe("Pipeline data contract: PL → Planner", () => {
  it("RoundSpec flows into FeatureBreakdown with matching roundId", () => {
    const spec = makeSpec();
    let state = createRoundState(1);
    state = setSpec(state, spec);
    state = transition(state, "PLANNER_DEFINE");

    const breakdown = makeBreakdown(state.currentSpec!);

    expect(breakdown.roundId).toBe(spec.roundId);
    expect(breakdown.features.length).toBeGreaterThanOrEqual(1);
    expect(state.phase).toBe("PLANNER_DEFINE");
  });
});

describe("Pipeline data contract: Planner → Developer", () => {
  it("FeatureBreakdown flows into DevResult with matching roundId", () => {
    const spec = makeSpec();
    let state = createRoundState(1);
    state = setSpec(state, spec);
    state = transition(state, "PLANNER_DEFINE");

    const breakdown = makeBreakdown(spec);
    state = setBreakdown(state, breakdown);
    state = transition(state, "DEV_IMPLEMENT");

    const devResult = makeDevResult(state.currentBreakdown!);

    expect(devResult.roundId).toBe(breakdown.roundId);
    expect(devResult.implementedFeatures).toEqual(
      breakdown.features.map((f) => f.name),
    );
    expect(state.phase).toBe("DEV_IMPLEMENT");
  });
});

describe("Pipeline data contract: Developer → QA", () => {
  it("DevResult + RoundSpec flow into QAResult with matching roundId and criteria", () => {
    const spec = makeSpec();
    let state = createRoundState(1);
    state = setSpec(state, spec);
    state = transition(state, "PLANNER_DEFINE");

    const breakdown = makeBreakdown(spec);
    state = setBreakdown(state, breakdown);
    state = transition(state, "DEV_IMPLEMENT");

    const devResult = makeDevResult(breakdown);
    state = setDevResult(state, devResult);

    const qaResult = makeQAResult(spec, "PASS");

    expect(qaResult.roundId).toBe(devResult.roundId);
    expect(qaResult.results.length).toBe(spec.acceptanceCriteria.length);
    for (const r of qaResult.results) {
      const matchingAC = spec.acceptanceCriteria.find(
        (ac) => ac.id === r.criteriaId,
      );
      expect(matchingAC).toBeDefined();
    }
  });
});

describe("Pipeline data contract: QA → PL judgment (PASS)", () => {
  it("PASS verdict leads to RELEASE → DONE", () => {
    const spec = makeSpec();
    let state = createRoundState(1);
    state = setSpec(state, spec);
    state = transition(state, "PLANNER_DEFINE");
    state = setBreakdown(state, makeBreakdown(spec));
    state = transition(state, "DEV_IMPLEMENT");
    state = setDevResult(state, makeDevResult(makeBreakdown(spec)));
    state = transition(state, "QA_REVIEW");

    const qaResult = makeQAResult(spec, "PASS");
    state = setQAResult(state, qaResult);

    const decision = evaluateQAResult(state, qaResult);
    expect(decision).toBe("RELEASE");

    state = transition(state, "RELEASE");
    expect(state.phase).toBe("RELEASE");

    state = transition(state, "DONE");
    expect(state.phase).toBe("DONE");
  });
});

describe("Pipeline data contract: QA → PL judgment (REJECT → RETRY → PASS)", () => {
  it("REJECT with retry available leads to DEV_IMPLEMENT re-entry, then PASS → DONE", () => {
    const spec = makeSpec();
    let state = createRoundState(1);
    state = setSpec(state, spec);
    state = transition(state, "PLANNER_DEFINE");
    state = setBreakdown(state, makeBreakdown(spec));
    state = transition(state, "DEV_IMPLEMENT");
    state = setDevResult(state, makeDevResult(makeBreakdown(spec)));
    state = transition(state, "QA_REVIEW");

    // First QA: REJECT
    const rejectResult = makeQAResult(spec, "REJECT");
    state = setQAResult(state, rejectResult);

    const decision1 = evaluateQAResult(state, rejectResult);
    expect(decision1).toBe("RETRY");
    expect(canRetry(state)).toBe(true);

    // RETRY_CHECK → DEV_IMPLEMENT
    state = transition(state, "RETRY_CHECK");
    state = incrementRetry(state);
    expect(state.retryCount).toBe(1);

    state = transition(state, "DEV_IMPLEMENT");
    expect(state.phase).toBe("DEV_IMPLEMENT");

    // Second DEV → QA
    state = setDevResult(state, makeDevResult(makeBreakdown(spec)));
    state = transition(state, "QA_REVIEW");

    const passResult = makeQAResult(spec, "PASS");
    state = setQAResult(state, passResult);

    const decision2 = evaluateQAResult(state, passResult);
    expect(decision2).toBe("RELEASE");

    state = transition(state, "RELEASE");
    state = transition(state, "DONE");
    expect(state.phase).toBe("DONE");
    expect(state.retryCount).toBe(1);
  });
});

describe("Pipeline data contract: QA → PL judgment (REJECT → FAIL)", () => {
  it("REJECT when retries exhausted leads to FAILED", () => {
    const spec = makeSpec({ maxRetries: 2 });
    let state = createRoundState(1);
    state = setSpec(state, spec);
    state = transition(state, "PLANNER_DEFINE");
    state = setBreakdown(state, makeBreakdown(spec));
    state = transition(state, "DEV_IMPLEMENT");
    state = setDevResult(state, makeDevResult(makeBreakdown(spec)));

    // retry 1: retryCount 0→1, canRetry(1<2)=true
    state = transition(state, "QA_REVIEW");
    state = setQAResult(state, makeQAResult(spec, "REJECT"));
    state = transition(state, "RETRY_CHECK");
    state = incrementRetry(state); // retryCount=1
    state = transition(state, "DEV_IMPLEMENT");
    state = setDevResult(state, makeDevResult(makeBreakdown(spec)));

    // retry 2: retryCount 1→2, canRetry(2<2)=false → transition throws
    state = transition(state, "QA_REVIEW");
    state = setQAResult(state, makeQAResult(spec, "REJECT"));
    state = transition(state, "RETRY_CHECK");
    state = incrementRetry(state); // retryCount=2

    // canRetry is now false (2 >= 2)
    expect(canRetry(state)).toBe(false);

    const rejectResult = state.currentQAResult!;
    const decision = evaluateQAResult(state, rejectResult);
    expect(decision).toBe("FAIL");

    // RETRY_CHECK → FAILED (cannot go to DEV_IMPLEMENT)
    state = transition(state, "FAILED");
    expect(state.phase).toBe("FAILED");

    const report = generateFailReport(state, "QA rejected all retries");
    expect(report).toContain("[ROUND 1 FAILED]");
    expect(report).toContain("Retry:2/2");
  });
});
