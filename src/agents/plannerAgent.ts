import type { RoundSpec, FeatureBreakdown } from "../types/index.js";
import { callAgent } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseJsonResponse } from "../utils/parseJson.js";
import { PLANNER_SYSTEM_PROMPT } from "./prompts/index.js";

const logger = createLogger({ agent: "planner" });

export async function runPlanner(
  spec: RoundSpec,
): Promise<FeatureBreakdown> {
  logger.info("PLANNER_DEFINE started", { roundId: spec.roundId });

  const response = await callAgent({
    role: "planner",
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify(spec),
      },
    ],
  });

  logger.info("Planner API call completed", {
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  });

  const breakdown = parseJsonResponse<FeatureBreakdown>(
    response.text,
    "Planner FeatureBreakdown",
  );

  logger.info("FeatureBreakdown parsed", {
    files: breakdown.fileStructure.length,
    features: breakdown.features.length,
  });

  return breakdown;
}
