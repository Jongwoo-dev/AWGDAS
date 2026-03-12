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
import { getModel, abortAllRequests, AgentCallError, resetUsageTracker, getAccumulatedUsage } from "./utils/anthropicClient.js";
import type { PipelineStats } from "./types/index.js";
import { ensureOutputDir } from "./utils/fileManager.js";
import { runPLInit, evaluateQAResult, generateFailReport } from "./agents/plAgent.js";
import { runPlanner } from "./agents/plannerAgent.js";
import { runDeveloper } from "./agents/developerAgent.js";
import { runQA } from "./agents/qaAgent.js";

const logger = createLogger({ agent: "pipeline" });

let shutdownRequested = false;

/** SIGINT 시그널을 처리하여 진행 중인 API 호출을 중단한다. */
function setupGracefulShutdown(): void {
  process.on("SIGINT", () => {
    if (shutdownRequested) {
      logger.warn("Force shutdown requested");
      process.exit(1);
    }
    shutdownRequested = true;
    logger.info("Graceful shutdown requested (SIGINT). Waiting for current operation...");
    abortAllRequests();
  });
}

/** 게임 설명을 파일 시스템에 안전한 디렉토리명으로 변환한다. */
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

/** 밀리초를 "분 초" 형태의 한국어 문자열로 변환한다. */
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}초`;
  return `${min}분 ${sec}초`;
}

/** stdin에서 게임 설명을 대화형으로 입력받는다. */
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

/**
 * AWGDAS 파이프라인 메인 진입점.
 * PL_INIT → PLANNER_DEFINE → DEV_IMPLEMENT → QA_REVIEW 루프를 실행한다.
 */
async function main(): Promise<void> {
  setupGracefulShutdown();
  logger.info("AWGDAS pipeline started", { model: getModel() });

  const gameDescription = await readGameDescription();
  if (!gameDescription) {
    logger.error("Empty game description");
    process.exit(1);
  }

  const startTime = Date.now();
  resetUsageTracker();

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

  // 파이프라인 실행 통계
  const elapsedMs = Date.now() - startTime;
  const usage = getAccumulatedUsage();
  const qaCycles = 1 + state.retryCount;
  const stats: PipelineStats = {
    model: getModel(),
    totalInputTokens: usage.totalInputTokens,
    totalOutputTokens: usage.totalOutputTokens,
    totalApiCalls: usage.totalApiCalls,
    qaCycles,
    retryCount: state.retryCount,
    elapsed: formatElapsed(elapsedMs),
    elapsedMs,
  };

  stdout.write("\n\n=== 파이프라인 실행 통계 ===\n");
  stdout.write(`  사용 모델:       ${stats.model}\n`);
  stdout.write(`  입력 토큰:       ${stats.totalInputTokens.toLocaleString()}\n`);
  stdout.write(`  출력 토큰:       ${stats.totalOutputTokens.toLocaleString()}\n`);
  stdout.write(`  API 호출 수:     ${stats.totalApiCalls}\n`);
  stdout.write(`  QA 검증 횟수:    ${stats.qaCycles} (재시도 ${stats.retryCount}회)\n`);
  stdout.write(`  총 소요 시간:    ${stats.elapsed}\n`);

  logger.info("Pipeline completed", {
    finalPhase: state.phase,
    verdict: finalVerdict,
    ...stats,
  });
}

main().catch((error: unknown) => {
  if (error instanceof AgentCallError && error.category === "timeout" && shutdownRequested) {
    logger.info("Pipeline aborted by user (SIGINT)");
    process.exit(130);
  }
  logger.error("Pipeline failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
