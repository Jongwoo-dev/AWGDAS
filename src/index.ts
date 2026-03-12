import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createLogger } from "./utils/logger.js";
import {
  createRoundState,
  transition,
  setSpec,
  setBreakdown,
  setDevResult,
  setQAResult,
  incrementRetry,
} from "./utils/roundStateMachine.js";
import { getModel } from "./utils/anthropicClient.js";
import { ensureOutputDir } from "./utils/fileManager.js";
import { runPLInit, evaluateQAResult, generateFailReport } from "./agents/plAgent.js";
import { runPlanner } from "./agents/plannerAgent.js";
import { runDeveloper } from "./agents/developerAgent.js";
import { runQA } from "./agents/qaAgent.js";

const logger = createLogger({ agent: "pipeline" });

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return slug || `game-${Date.now()}`;
}

async function readGameDescription(): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const description = await rl.question(
      "게임 설명을 입력하세요: ",
    );
    return description.trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  logger.info("AWGDAS pipeline started", { model: getModel() });

  const gameDescription = await readGameDescription();
  if (!gameDescription) {
    logger.error("Empty game description");
    process.exit(1);
  }

  logger.info("Game description received", {
    length: gameDescription.length,
  });

  let state = createRoundState(1);
  logger.info("Round state created", { phase: state.phase });

  // PL_INIT
  const spec = await runPLInit(gameDescription, state.roundId);
  state = setSpec(state, spec);
  logger.info("Phase complete: PL_INIT", {
    features: spec.features.length,
    ac: spec.acceptanceCriteria.length,
  });

  // PL_INIT → PLANNER_DEFINE
  state = transition(state, "PLANNER_DEFINE");
  logger.info("State transition", { phase: state.phase });

  // PLANNER_DEFINE
  const breakdown = await runPlanner(spec);
  state = setBreakdown(state, breakdown);
  logger.info("Phase complete: PLANNER_DEFINE", {
    files: breakdown.fileStructure.length,
    features: breakdown.features.length,
  });

  // PLANNER_DEFINE → DEV_IMPLEMENT
  state = transition(state, "DEV_IMPLEMENT");
  logger.info("State transition", { phase: state.phase });

  // DEV_IMPLEMENT (first run)
  const gameName = slugify(gameDescription);
  await ensureOutputDir(gameName);
  let devResult = await runDeveloper(breakdown, gameName, false);
  state = setDevResult(state, devResult);
  logger.info("Phase complete: DEV_IMPLEMENT", {
    features: devResult.implementedFeatures.length,
    files: devResult.changedFiles.length,
  });

  // DEV → QA → PL judgment loop
  let finalVerdict: "DONE" | "FAILED" = "DONE";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // DEV_IMPLEMENT → QA_REVIEW
    state = transition(state, "QA_REVIEW");
    logger.info("State transition", { phase: state.phase });

    const qaResult = await runQA(devResult, spec, gameName);
    state = setQAResult(state, qaResult);
    logger.info("Phase complete: QA_REVIEW", {
      verdict: qaResult.verdict,
      fileIntegrity: qaResult.fileIntegrity,
    });

    const decision = evaluateQAResult(state, qaResult);

    if (decision === "RELEASE") {
      // QA_REVIEW → RELEASE → DONE
      state = transition(state, "RELEASE");
      logger.info("State transition", { phase: state.phase });

      state = transition(state, "DONE");
      logger.info("State transition", { phase: state.phase });

      finalVerdict = "DONE";
      break;
    }

    // QA_REVIEW → RETRY_CHECK
    state = transition(state, "RETRY_CHECK");
    logger.info("State transition", { phase: state.phase });

    if (decision === "FAIL") {
      // RETRY_CHECK → FAILED
      state = transition(state, "FAILED");
      logger.info("State transition", { phase: state.phase });

      const failedACs = qaResult.results
        .filter((r) => !r.pass)
        .map((r) => r.criteriaId)
        .join(", ");
      const report = generateFailReport(
        state,
        `QA rejected — failed criteria: ${failedACs}`,
      );
      stdout.write("\n" + report + "\n");

      finalVerdict = "FAILED";
      break;
    }

    // decision === "RETRY": RETRY_CHECK → DEV_IMPLEMENT
    state = incrementRetry(state);
    state = transition(state, "DEV_IMPLEMENT");
    logger.info("State transition (retry)", {
      phase: state.phase,
      retryCount: state.retryCount,
    });

    devResult = await runDeveloper(breakdown, gameName, true, qaResult);
    state = setDevResult(state, devResult);
    logger.info("Phase complete: DEV_IMPLEMENT (retry)", {
      features: devResult.implementedFeatures.length,
      files: devResult.changedFiles.length,
    });
  }

  // 결과 출력
  stdout.write("\n=== RoundSpec ===\n");
  stdout.write(JSON.stringify(spec, null, 2));
  stdout.write("\n\n=== FeatureBreakdown ===\n");
  stdout.write(JSON.stringify(breakdown, null, 2));
  stdout.write("\n\n=== DevResult ===\n");
  stdout.write(JSON.stringify(devResult, null, 2));
  if (state.currentQAResult) {
    stdout.write("\n\n=== QAResult ===\n");
    stdout.write(JSON.stringify(state.currentQAResult, null, 2));
  }
  stdout.write("\n");

  logger.info("Pipeline completed", {
    finalPhase: state.phase,
    verdict: finalVerdict,
    retries: state.retryCount,
  });
}

main().catch((error: unknown) => {
  logger.error("Pipeline failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
