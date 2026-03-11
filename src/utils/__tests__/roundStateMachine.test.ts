import { describe, it, expect } from "vitest";
import type {
  RoundState,
  RoundSpec,
  FeatureBreakdown,
  DevResult,
  QAResult,
} from "../../types/index.js";
import {
  createRoundState,
  transition,
  canRetry,
  incrementRetry,
  setSpec,
  setBreakdown,
  setDevResult,
  setQAResult,
  addToBacklog,
} from "../roundStateMachine.js";

const makeSpec = (maxRetries = 2): RoundSpec => ({
  roundId: 1,
  gameDescription: "test game",
  features: ["feat-1"],
  acceptanceCriteria: [{ id: "AC-1", description: "works" }],
  scopeLock: ["no extras"],
  maxRetries,
});

const makeBreakdown = (): FeatureBreakdown => ({
  roundId: 1,
  fileStructure: ["index.html"],
  features: [
    {
      id: "feat-1",
      name: "Feature 1",
      description: "desc",
      targetFiles: ["index.html"],
      edgeCases: [],
    },
  ],
});

const makeDevResult = (): DevResult => ({
  roundId: 1,
  implementedFeatures: ["feat-1"],
  summary: "implemented",
  changedFiles: [{ path: "index.html", action: "created" }],
});

const makeQAResult = (verdict: "PASS" | "REJECT"): QAResult => ({
  roundId: 1,
  verdict,
  fileIntegrity: true,
  results: [{ criteriaId: "AC-1", pass: verdict === "PASS", reason: "ok" }],
});

describe("createRoundState", () => {
  it("creates initial state with PL_INIT phase", () => {
    const state = createRoundState(1);

    expect(state.roundId).toBe(1);
    expect(state.phase).toBe("PL_INIT");
    expect(state.retryCount).toBe(0);
    expect(state.backlog).toEqual([]);
    expect(state.currentSpec).toBeNull();
    expect(state.currentBreakdown).toBeNull();
    expect(state.currentDevResult).toBeNull();
    expect(state.currentQAResult).toBeNull();
  });
});

describe("transition — PASS path", () => {
  it("follows PL_INIT → PLANNER_DEFINE → DEV_IMPLEMENT → QA_REVIEW → RELEASE → DONE", () => {
    let state = createRoundState(1);

    state = transition(state, "PLANNER_DEFINE");
    expect(state.phase).toBe("PLANNER_DEFINE");

    state = transition(state, "DEV_IMPLEMENT");
    expect(state.phase).toBe("DEV_IMPLEMENT");

    state = transition(state, "QA_REVIEW");
    expect(state.phase).toBe("QA_REVIEW");

    state = transition(state, "RELEASE");
    expect(state.phase).toBe("RELEASE");

    state = transition(state, "DONE");
    expect(state.phase).toBe("DONE");
  });
});

describe("transition — REJECT path", () => {
  it("follows QA_REVIEW → RETRY_CHECK → DEV_IMPLEMENT", () => {
    let state = createRoundState(1);
    state = setSpec(state, makeSpec(2));
    state = transition(state, "PLANNER_DEFINE");
    state = transition(state, "DEV_IMPLEMENT");
    state = transition(state, "QA_REVIEW");

    state = transition(state, "RETRY_CHECK");
    expect(state.phase).toBe("RETRY_CHECK");

    state = transition(state, "DEV_IMPLEMENT");
    expect(state.phase).toBe("DEV_IMPLEMENT");
  });
});

describe("transition — FAIL path", () => {
  it("follows RETRY_CHECK → FAILED when explicitly chosen", () => {
    let state = createRoundState(1);
    state = setSpec(state, makeSpec(2));
    state = transition(state, "PLANNER_DEFINE");
    state = transition(state, "DEV_IMPLEMENT");
    state = transition(state, "QA_REVIEW");
    state = transition(state, "RETRY_CHECK");

    state = transition(state, "FAILED");
    expect(state.phase).toBe("FAILED");
  });
});

describe("transition — invalid transitions", () => {
  it("throws on PL_INIT → DONE", () => {
    const state = createRoundState(1);
    expect(() => transition(state, "DONE")).toThrow("Invalid transition");
  });

  it("throws on DEV_IMPLEMENT → RELEASE", () => {
    let state = createRoundState(1);
    state = transition(state, "PLANNER_DEFINE");
    state = transition(state, "DEV_IMPLEMENT");

    expect(() => transition(state, "RELEASE")).toThrow("Invalid transition");
  });

  it("throws on PL_INIT → DEV_IMPLEMENT", () => {
    const state = createRoundState(1);
    expect(() => transition(state, "DEV_IMPLEMENT")).toThrow(
      "Invalid transition",
    );
  });

  it("throws on QA_REVIEW → DEV_IMPLEMENT (must go through RETRY_CHECK)", () => {
    let state = createRoundState(1);
    state = transition(state, "PLANNER_DEFINE");
    state = transition(state, "DEV_IMPLEMENT");
    state = transition(state, "QA_REVIEW");

    expect(() => transition(state, "DEV_IMPLEMENT")).toThrow(
      "Invalid transition",
    );
  });
});

describe("transition — terminal states", () => {
  it("throws on any transition from DONE", () => {
    let state = createRoundState(1);
    state = transition(state, "PLANNER_DEFINE");
    state = transition(state, "DEV_IMPLEMENT");
    state = transition(state, "QA_REVIEW");
    state = transition(state, "RELEASE");
    state = transition(state, "DONE");

    expect(() => transition(state, "PL_INIT")).toThrow("Invalid transition");
    expect(() => transition(state, "RELEASE")).toThrow("Invalid transition");
  });

  it("throws on any transition from FAILED", () => {
    let state = createRoundState(1);
    state = setSpec(state, makeSpec(2));
    state = transition(state, "PLANNER_DEFINE");
    state = transition(state, "DEV_IMPLEMENT");
    state = transition(state, "QA_REVIEW");
    state = transition(state, "RETRY_CHECK");
    state = transition(state, "FAILED");

    expect(() => transition(state, "PL_INIT")).toThrow("Invalid transition");
    expect(() => transition(state, "DEV_IMPLEMENT")).toThrow(
      "Invalid transition",
    );
  });
});

describe("canRetry", () => {
  it("returns true when retryCount < maxRetries", () => {
    let state = createRoundState(1);
    state = setSpec(state, makeSpec(2));

    expect(canRetry(state)).toBe(true);
  });

  it("returns true when retryCount is 1 and maxRetries is 2", () => {
    let state = createRoundState(1);
    state = setSpec(state, makeSpec(2));
    state = incrementRetry(state);

    expect(canRetry(state)).toBe(true);
  });

  it("returns false when retryCount equals maxRetries", () => {
    let state = createRoundState(1);
    state = setSpec(state, makeSpec(2));
    state = incrementRetry(state);
    state = incrementRetry(state);

    expect(canRetry(state)).toBe(false);
  });

  it("returns false when currentSpec is null", () => {
    const state = createRoundState(1);
    expect(canRetry(state)).toBe(false);
  });
});

describe("incrementRetry", () => {
  it("increments retryCount by 1", () => {
    const state = createRoundState(1);
    const next = incrementRetry(state);

    expect(next.retryCount).toBe(1);
  });

  it("preserves immutability", () => {
    const state = createRoundState(1);
    const next = incrementRetry(state);

    expect(state.retryCount).toBe(0);
    expect(next.retryCount).toBe(1);
  });
});

describe("RETRY_CHECK → DEV_IMPLEMENT with retry limit", () => {
  it("throws when retry limit is exceeded", () => {
    let state = createRoundState(1);
    state = setSpec(state, makeSpec(1));
    state = incrementRetry(state);
    state = transition(state, "PLANNER_DEFINE");
    state = transition(state, "DEV_IMPLEMENT");
    state = transition(state, "QA_REVIEW");
    state = transition(state, "RETRY_CHECK");

    expect(() => transition(state, "DEV_IMPLEMENT")).toThrow(
      "Retry limit exceeded",
    );
  });

  it("allows transition when retries remain", () => {
    let state = createRoundState(1);
    state = setSpec(state, makeSpec(2));
    state = incrementRetry(state);
    state = transition(state, "PLANNER_DEFINE");
    state = transition(state, "DEV_IMPLEMENT");
    state = transition(state, "QA_REVIEW");
    state = transition(state, "RETRY_CHECK");

    const next = transition(state, "DEV_IMPLEMENT");
    expect(next.phase).toBe("DEV_IMPLEMENT");
  });
});

describe("data slot setters", () => {
  it("setSpec sets currentSpec immutably", () => {
    const state = createRoundState(1);
    const spec = makeSpec();
    const next = setSpec(state, spec);

    expect(next.currentSpec).toBe(spec);
    expect(state.currentSpec).toBeNull();
  });

  it("setBreakdown sets currentBreakdown immutably", () => {
    const state = createRoundState(1);
    const breakdown = makeBreakdown();
    const next = setBreakdown(state, breakdown);

    expect(next.currentBreakdown).toBe(breakdown);
    expect(state.currentBreakdown).toBeNull();
  });

  it("setDevResult sets currentDevResult immutably", () => {
    const state = createRoundState(1);
    const devResult = makeDevResult();
    const next = setDevResult(state, devResult);

    expect(next.currentDevResult).toBe(devResult);
    expect(state.currentDevResult).toBeNull();
  });

  it("setQAResult sets currentQAResult immutably", () => {
    const state = createRoundState(1);
    const qaResult = makeQAResult("PASS");
    const next = setQAResult(state, qaResult);

    expect(next.currentQAResult).toBe(qaResult);
    expect(state.currentQAResult).toBeNull();
  });

  it("addToBacklog appends item immutably", () => {
    const state = createRoundState(1);
    const next1 = addToBacklog(state, "item-1");
    const next2 = addToBacklog(next1, "item-2");

    expect(next2.backlog).toEqual(["item-1", "item-2"]);
    expect(state.backlog).toEqual([]);
    expect(next1.backlog).toEqual(["item-1"]);
  });
});
