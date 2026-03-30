import "dotenv/config";
import "./pipeline/phaseHandlers.js";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createLogger } from "./utils/logger.js";
import {
  createRoundState,
  runPhase,
  isTerminalPhase,
} from "./utils/roundStateMachine.js";
import { getModel, abortAllRequests, AgentCallError, resetUsageTracker, getAccumulatedUsage } from "./utils/anthropicClient.js";
import { generateFailReport } from "./agents/plAgent.js";
import type { PipelineStats, RoundState } from "./types/index.js";

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

/** 완료된 상태에서 각 단계의 결과물을 stdout에 출력한다. */
function printResults(state: RoundState): void {
  if (state.phase === "FAILED") {
    const failedACs = state.currentQAResult?.results
      .filter((r) => !r.pass)
      .map((r) => r.criteriaId)
      .join(", ") ?? "N/A";
    const report = generateFailReport(state, `QA rejected — failed criteria: ${failedACs}`);
    stdout.write("\n" + report + "\n");
  }

  if (state.currentSpec) {
    stdout.write("\n=== RoundSpec ===\n");
    stdout.write(JSON.stringify(state.currentSpec, null, 2));
  }
  if (state.currentBreakdown) {
    stdout.write("\n\n=== FeatureBreakdown ===\n");
    stdout.write(JSON.stringify(state.currentBreakdown, null, 2));
  }
  if (state.currentDevResult) {
    stdout.write("\n\n=== DevResult ===\n");
    stdout.write(JSON.stringify(state.currentDevResult, null, 2));
  }
  if (state.currentQAResult) {
    stdout.write("\n\n=== QAResult ===\n");
    stdout.write(JSON.stringify(state.currentQAResult, null, 2));
  }
}

/** 파이프라인 실행 통계를 stdout에 출력한다. */
function printStats(state: RoundState, startTime: number): void {
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
    verdict: state.phase === "DONE" ? "DONE" : "FAILED",
    ...stats,
  });
}

/**
 * AWGDAS 파이프라인 메인 진입점.
 * 상태 머신 루프로 PL_INIT부터 DONE/FAILED까지 페이즈를 디스패치한다.
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

  const gameName = slugify(gameDescription);
  const context = { gameDescription, gameName };
  let state = createRoundState(1);
  logger.info("Round state created", { phase: state.phase });

  while (!isTerminalPhase(state.phase)) {
    logger.info("Dispatching phase", { phase: state.phase });
    state = await runPhase(state, context);
  }

  printResults(state);
  printStats(state, startTime);
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
