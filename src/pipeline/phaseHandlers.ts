import {
  registerPhaseHandler,
  transition,
  canRetry,
  setSpec,
  setBreakdown,
  setDevResult,
  setQAResult,
  incrementRetry,
} from "../utils/roundStateMachine.js";
import { runPLInit, evaluateQAResult } from "../agents/plAgent.js";
import { runPlanner } from "../agents/plannerAgent.js";
import { runDeveloper } from "../agents/developerAgent.js";
import { runQA } from "../agents/qaAgent.js";
import { ensureOutputDir } from "../utils/fileManager.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger({ agent: "pipeline" });

registerPhaseHandler("PL_INIT", async (state, context) => {
  const spec = await runPLInit(context.gameDescription, state.roundId);
  let next = setSpec(state, spec);
  logger.info("Phase complete: PL_INIT", {
    features: spec.features.length,
    ac: spec.acceptanceCriteria.length,
  });
  next = transition(next, "PLANNER_DEFINE");
  return next;
});

registerPhaseHandler("PLANNER_DEFINE", async (state) => {
  if (!state.currentSpec) {
    throw new Error("PLANNER_DEFINE requires currentSpec");
  }
  const breakdown = await runPlanner(state.currentSpec);
  let next = setBreakdown(state, breakdown);
  logger.info("Phase complete: PLANNER_DEFINE", {
    files: breakdown.fileStructure.length,
    features: breakdown.features.length,
  });
  next = transition(next, "DEV_IMPLEMENT");
  return next;
});

registerPhaseHandler("DEV_IMPLEMENT", async (state, context) => {
  if (!state.currentBreakdown) {
    throw new Error("DEV_IMPLEMENT requires currentBreakdown");
  }
  await ensureOutputDir(context.gameName);
  const isRetry = state.retryCount > 0;
  const qaResult = isRetry ? state.currentQAResult ?? undefined : undefined;
  const devResult = await runDeveloper(
    state.currentBreakdown,
    context.gameName,
    isRetry,
    qaResult,
  );
  let next = setDevResult(state, devResult);
  logger.info(`Phase complete: DEV_IMPLEMENT${isRetry ? " (retry)" : ""}`, {
    features: devResult.implementedFeatures.length,
    files: devResult.changedFiles.length,
  });
  next = transition(next, "QA_REVIEW");
  return next;
});

registerPhaseHandler("QA_REVIEW", async (state, context) => {
  if (!state.currentDevResult || !state.currentSpec) {
    throw new Error("QA_REVIEW requires currentDevResult and currentSpec");
  }
  const qaResult = await runQA(state.currentDevResult, state.currentSpec, context.gameName);
  let next = setQAResult(state, qaResult);
  logger.info("Phase complete: QA_REVIEW", {
    verdict: qaResult.verdict,
    fileIntegrity: qaResult.fileIntegrity,
  });

  const decision = evaluateQAResult(next, qaResult);

  if (decision === "RELEASE") {
    next = transition(next, "RELEASE");
    return next;
  }

  next = transition(next, "RETRY_CHECK");
  return next;
});

registerPhaseHandler("RETRY_CHECK", async (state) => {
  if (!canRetry(state)) {
    const next = transition(state, "FAILED");
    return next;
  }

  let next = incrementRetry(state);
  next = transition(next, "DEV_IMPLEMENT");
  logger.info("Retry scheduled", { retryCount: next.retryCount });
  return next;
});

registerPhaseHandler("RELEASE", async (state) => {
  logger.info("Phase complete: RELEASE");
  return transition(state, "DONE");
});
