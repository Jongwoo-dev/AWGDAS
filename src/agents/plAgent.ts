import type { RoundSpec } from "../types/index.js";
import { callAgent } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseJsonResponse } from "../utils/parseJson.js";
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
