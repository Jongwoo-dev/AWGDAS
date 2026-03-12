import type { RoundSpec, RoundState, QAResult } from "../types/index.js";
import { callAgent } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseAndValidate } from "../utils/responseParser.js";
import { canRetry } from "../utils/roundStateMachine.js";
import { PL_SYSTEM_PROMPT } from "./prompts/index.js";

const logger = createLogger({ agent: "pl" });

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

export type PLDecision = "RELEASE" | "RETRY" | "FAIL";

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
