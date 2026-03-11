import type {
  RoundState,
  RoundPhase,
  RoundSpec,
  FeatureBreakdown,
  DevResult,
  QAResult,
} from "../types/index.js";

const VALID_TRANSITIONS: Map<RoundPhase, RoundPhase[]> = new Map([
  ["PL_INIT", ["PLANNER_DEFINE"]],
  ["PLANNER_DEFINE", ["DEV_IMPLEMENT"]],
  ["DEV_IMPLEMENT", ["QA_REVIEW"]],
  ["QA_REVIEW", ["RELEASE", "RETRY_CHECK"]],
  ["RETRY_CHECK", ["DEV_IMPLEMENT", "FAILED"]],
  ["RELEASE", ["DONE"]],
]);

export function createRoundState(roundId: number): RoundState {
  return {
    roundId,
    retryCount: 0,
    backlog: [],
    phase: "PL_INIT",
    currentSpec: null,
    currentBreakdown: null,
    currentDevResult: null,
    currentQAResult: null,
  };
}

export function transition(
  state: RoundState,
  nextPhase: RoundPhase,
): RoundState {
  const allowed = VALID_TRANSITIONS.get(state.phase);

  if (!allowed || !allowed.includes(nextPhase)) {
    throw new Error(
      `Invalid transition: ${state.phase} → ${nextPhase}`,
    );
  }

  if (state.phase === "RETRY_CHECK" && nextPhase === "DEV_IMPLEMENT") {
    if (!canRetry(state)) {
      throw new Error(
        `Retry limit exceeded: ${state.retryCount}/${state.currentSpec?.maxRetries ?? 0}`,
      );
    }
  }

  return { ...state, phase: nextPhase };
}

export function canRetry(state: RoundState): boolean {
  if (!state.currentSpec) {
    return false;
  }
  return state.retryCount < state.currentSpec.maxRetries;
}

export function incrementRetry(state: RoundState): RoundState {
  return { ...state, retryCount: state.retryCount + 1 };
}

export function setSpec(state: RoundState, spec: RoundSpec): RoundState {
  return { ...state, currentSpec: spec };
}

export function setBreakdown(
  state: RoundState,
  breakdown: FeatureBreakdown,
): RoundState {
  return { ...state, currentBreakdown: breakdown };
}

export function setDevResult(
  state: RoundState,
  devResult: DevResult,
): RoundState {
  return { ...state, currentDevResult: devResult };
}

export function setQAResult(
  state: RoundState,
  qaResult: QAResult,
): RoundState {
  return { ...state, currentQAResult: qaResult };
}

export function addToBacklog(state: RoundState, item: string): RoundState {
  return { ...state, backlog: [...state.backlog, item] };
}
