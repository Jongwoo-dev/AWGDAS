import type { RoundSpec, RoundState, QAResult } from "../types/index.js";
import { callAgent } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseJsonResponse } from "../utils/parseJson.js";
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

  const spec = parseJsonResponse<RoundSpec>(response.text, "PL RoundSpec");

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

  return `[ROUND ${state.roundId} FAILED] Phase:${state.phase} | Retry:${state.retryCount}/${maxRetries} | Reason:${reason} | Failed:${failedACs}`;
}
