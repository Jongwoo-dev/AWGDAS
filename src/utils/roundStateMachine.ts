import type {
  RoundState,
  RoundPhase,
  RoundSpec,
  FeatureBreakdown,
  DevResult,
  QAResult,
} from "../types/index.js";

/** 페이즈 간 허용된 전이 맵. */
const VALID_TRANSITIONS: Map<RoundPhase, RoundPhase[]> = new Map([
  ["PL_INIT", ["PLANNER_DEFINE"]],
  ["PLANNER_DEFINE", ["DEV_IMPLEMENT"]],
  ["DEV_IMPLEMENT", ["QA_REVIEW"]],
  ["QA_REVIEW", ["RELEASE", "RETRY_CHECK"]],
  ["RETRY_CHECK", ["DEV_IMPLEMENT", "FAILED"]],
  ["RELEASE", ["DONE"]],
]);

/**
 * 초기 상태의 RoundState를 생성한다.
 *
 * @param roundId - 라운드 식별자
 * @returns PL_INIT 페이즈의 초기 RoundState
 */
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

/**
 * 현재 페이즈에서 다음 페이즈로 전이한다.
 *
 * @param state - 현재 RoundState
 * @param nextPhase - 전이할 대상 페이즈
 * @returns 전이된 새 RoundState
 * @throws 허용되지 않은 전이이거나 재시도 한도 초과 시 Error
 */
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

/** 현재 상태에서 재시도 가능 여부를 반환한다. */
export function canRetry(state: RoundState): boolean {
  if (!state.currentSpec) {
    return false;
  }
  return state.retryCount < state.currentSpec.maxRetries;
}

/** retryCount를 1 증가시킨 새 상태를 반환한다. */
export function incrementRetry(state: RoundState): RoundState {
  return { ...state, retryCount: state.retryCount + 1 };
}

/** RoundState에 RoundSpec을 설정한 새 상태를 반환한다. */
export function setSpec(state: RoundState, spec: RoundSpec): RoundState {
  return { ...state, currentSpec: spec };
}

/** RoundState에 FeatureBreakdown을 설정한 새 상태를 반환한다. */
export function setBreakdown(
  state: RoundState,
  breakdown: FeatureBreakdown,
): RoundState {
  return { ...state, currentBreakdown: breakdown };
}

/** RoundState에 DevResult를 설정한 새 상태를 반환한다. */
export function setDevResult(
  state: RoundState,
  devResult: DevResult,
): RoundState {
  return { ...state, currentDevResult: devResult };
}

/** RoundState에 QAResult를 설정한 새 상태를 반환한다. */
export function setQAResult(
  state: RoundState,
  qaResult: QAResult,
): RoundState {
  return { ...state, currentQAResult: qaResult };
}

/** 백로그에 항목을 추가한 새 상태를 반환한다. */
export function addToBacklog(state: RoundState, item: string): RoundState {
  return { ...state, backlog: [...state.backlog, item] };
}
