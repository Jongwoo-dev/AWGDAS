import type { RoundSpec, FeatureBreakdown } from "../types/index.js";
import { callAgent } from "../utils/anthropicClient.js";
import { createLogger } from "../utils/logger.js";
import { parseAndValidate } from "../utils/responseParser.js";
import { PLANNER_SYSTEM_PROMPT } from "./prompts/index.js";

const logger = createLogger({ agent: "planner" });

/**
 * RoundSpec을 기반으로 기능 분해(FeatureBreakdown)를 생성한다.
 *
 * @param spec - PL이 생성한 라운드 스펙
 * @returns 파싱 및 검증된 FeatureBreakdown
 * @throws AgentCallError - API 호출 실패 시
 * @throws ResponseParseError | ValidationError - 응답 파싱 실패 시
 */
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

  const breakdown = parseAndValidate<FeatureBreakdown>(
    response.text,
    "Planner FeatureBreakdown",
    ["roundId", "fileStructure", "features"],
  );

  logger.info("FeatureBreakdown parsed", {
    files: breakdown.fileStructure.length,
    features: breakdown.features.length,
  });

  return breakdown;
}
