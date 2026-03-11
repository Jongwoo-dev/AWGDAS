import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createLogger } from "./utils/logger.js";
import {
  createRoundState,
  transition,
  setSpec,
  setBreakdown,
} from "./utils/roundStateMachine.js";
import { runPLInit } from "./agents/plAgent.js";
import { runPlanner } from "./agents/plannerAgent.js";

const logger = createLogger({ agent: "pipeline" });

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
  logger.info("AWGDAS pipeline started");

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

  // 결과 출력
  stdout.write("\n=== RoundSpec ===\n");
  stdout.write(JSON.stringify(spec, null, 2));
  stdout.write("\n\n=== FeatureBreakdown ===\n");
  stdout.write(JSON.stringify(breakdown, null, 2));
  stdout.write("\n");

  logger.info("Pipeline completed successfully", {
    finalPhase: state.phase,
  });
}

main().catch((error: unknown) => {
  logger.error("Pipeline failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
