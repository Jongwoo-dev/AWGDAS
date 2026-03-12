import type { RoundSpec, RoundState, QAResult } from "../types/index.js";
import { callAgent } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseAndValidate } from "../utils/responseParser.js";
import { canRetry } from "../utils/roundStateMachine.js";
import { PL_SYSTEM_PROMPT } from "./prompts/index.js";

const logger = createLogger({ agent: "pl" });

/**
 * 게임 설명으로부터 RoundSpec을 생성한다 (PL_INIT 페이즈).
 *
 * @param gameDescription - 사용자가 입력한 게임 설명
 * @param roundId - 라운드 식별자
 * @returns 파싱 및 검증된 RoundSpec
 * @throws AgentCallError - API 호출 실패 시
 * @throws ResponseParseError | ValidationError - 응답 파싱 실패 시
 */
export async function runPLInit(
  gameDescription: string,
  roundId: number,
): Promise<RoundSpec> {
  logger.info("PL_INIT started", { roundId });

  const response = await callAgent({
    role: "pl",
    systemPrompt: PL_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Game: ${gameDescription}\nRound: ${roundId}`,
      },
    ],
  });

  logger.info("PL API call completed", {
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  });

  const spec = parseAndValidate<RoundSpec>(response.text, "PL RoundSpec", [
    "roundId",
    "gameDescription",
    "features",
    "acceptanceCriteria",
    "scopeLock",
    "maxRetries",
  ]);

  logger.info("RoundSpec parsed", {
    features: spec.features.length,
    ac: spec.acceptanceCriteria.length,
  });

  return spec;
}

/** PL의 QA 결과 판정 — 릴리스, 재시도, 실패 중 하나. */
export type PLDecision = "RELEASE" | "RETRY" | "FAIL";

/**
 * QA 결과와 현재 상태를 기반으로 PL 판정을 내린다.
 *
 * @param state - 현재 라운드 상태
 * @param qaResult - QA 에이전트의 검증 결과
 * @returns RELEASE(통과), RETRY(재시도), FAIL(실패) 중 하나
 */
export function evaluateQAResult(
  state: RoundState,
  qaResult: QAResult,
): PLDecision {
  if (qaResult.verdict === "PASS") {
    logger.info("PL decision: RELEASE", { roundId: state.roundId });
    return "RELEASE";
  }

  if (canRetry(state)) {
    logger.info("PL decision: RETRY", {
      roundId: state.roundId,
      retryCount: state.retryCount,
    });
    return "RETRY";
  }

  logger.info("PL decision: FAIL", {
    roundId: state.roundId,
    retryCount: state.retryCount,
  });
  return "FAIL";
}

/**
 * 라운드 실패 시 사람이 읽을 수 있는 박스형 리포트를 생성한다.
 *
 * @param state - 현재 라운드 상태
 * @param reason - 실패 사유
 * @returns 포맷팅된 리포트 문자열
 */
export function generateFailReport(
  state: RoundState,
  reason: string,
): string {
  const failedACs = state.currentQAResult?.results
    .filter((r) => !r.pass)
    .map((r) => r.criteriaId)
    .join(", ") ?? "N/A";

  const maxRetries = state.currentSpec?.maxRetries ?? 0;

  const w = 42;
  const line = "═".repeat(w);
  const pad = (s: string) => {
    const trimmed = s.slice(0, w - 2);
    return trimmed + " ".repeat(w - 2 - trimmed.length);
  };
  const title = `ROUND ${state.roundId} — FAILED`;
  const titlePad = " ".repeat(Math.max(0, Math.floor((w - 2 - title.length) / 2)));

  return [
    `╔${line}╗`,
    `║${titlePad}${title}${" ".repeat(w - 2 - titlePad.length - title.length)}║`,
    `╠${line}╣`,
    `║ ${pad(`Phase    : ${state.phase}`)} ║`,
    `║ ${pad(`Retries  : ${state.retryCount}/${maxRetries}`)} ║`,
    `║ ${pad(`Reason   : ${reason}`)} ║`,
    `║ ${pad(`Failed AC: ${failedACs}`)} ║`,
    `╚${line}╝`,
  ].join("\n");
}
