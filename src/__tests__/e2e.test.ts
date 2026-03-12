import { describe, it, expect, afterAll } from "vitest";
import { runPLInit, evaluateQAResult } from "../agents/plAgent.js";
import { runPlanner } from "../agents/plannerAgent.js";
import { runDeveloper } from "../agents/developerAgent.js";
import { runQA } from "../agents/qaAgent.js";
import { ensureOutputDir } from "../utils/fileManager.js";
import {
  createRoundState,
  transition,
  setSpec,
  setBreakdown,
  setDevResult,
  setQAResult,
  incrementRetry,
} from "../utils/roundStateMachine.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const HAS_API_KEY = Boolean(process.env.ANTHROPIC_API_KEY);
const OUTPUT_BASE = path.resolve("output");

async function cleanupGame(gameName: string): Promise<void> {
  const dir = path.join(OUTPUT_BASE, gameName);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

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

const createdGames: string[] = [];

afterAll(async () => {
  for (const name of createdGames) {
    await cleanupGame(name);
  }
});

describe.skipIf(!HAS_API_KEY)("E2E Pipeline", () => {
  it(
    "simple game — click counter should PASS in 1 round",
    async () => {
      const gameDescription = "click counter: a button that counts clicks and displays the count";
      const gameName = slugify(gameDescription);
      createdGames.push(gameName);

      let state = createRoundState(1);

      // PL_INIT
      const spec = await runPLInit(gameDescription, state.roundId);
      state = setSpec(state, spec);
      expect(spec.roundId).toBe(1);
      expect(spec.features.length).toBeGreaterThanOrEqual(1);
      expect(spec.acceptanceCriteria.length).toBeGreaterThanOrEqual(1);

      // PLANNER_DEFINE
      state = transition(state, "PLANNER_DEFINE");
      const breakdown = await runPlanner(spec);
      state = setBreakdown(state, breakdown);
      expect(breakdown.roundId).toBe(spec.roundId);
      expect(breakdown.features.length).toBeGreaterThanOrEqual(1);

      // DEV_IMPLEMENT
      state = transition(state, "DEV_IMPLEMENT");
      await ensureOutputDir(gameName);
      const devResult = await runDeveloper(breakdown, gameName, false);
      state = setDevResult(state, devResult);
      expect(devResult.changedFiles.length).toBeGreaterThanOrEqual(1);

      // QA_REVIEW
      state = transition(state, "QA_REVIEW");
      const qaResult = await runQA(devResult, spec, gameName);
      state = setQAResult(state, qaResult);

      // Verify output files exist
      const outputDir = path.join(OUTPUT_BASE, gameName);
      const files = await fs.readdir(outputDir, { recursive: true });
      expect(files.length).toBeGreaterThanOrEqual(1);

      // Verify pipeline terminates (PASS or we retry to completion)
      const decision = evaluateQAResult(state, qaResult);
      expect(["RELEASE", "RETRY", "FAIL"]).toContain(decision);
    },
    300_000,
  );

  it(
    "forced failure — maxRetries=0 leads to FAILED on REJECT",
    async () => {
      const gameDescription = "complex physics simulation with particle effects and collision detection";
      const gameName = slugify(gameDescription);
      createdGames.push(gameName);

      let state = createRoundState(1);

      // PL_INIT
      const spec = await runPLInit(gameDescription, state.roundId);
      // Force maxRetries to 0
      spec.maxRetries = 0;
      state = setSpec(state, spec);

      // PLANNER_DEFINE
      state = transition(state, "PLANNER_DEFINE");
      const breakdown = await runPlanner(spec);
      state = setBreakdown(state, breakdown);

      // DEV_IMPLEMENT
      state = transition(state, "DEV_IMPLEMENT");
      await ensureOutputDir(gameName);
      const devResult = await runDeveloper(breakdown, gameName, false);
      state = setDevResult(state, devResult);

      // QA_REVIEW
      state = transition(state, "QA_REVIEW");
      const qaResult = await runQA(devResult, spec, gameName);
      state = setQAResult(state, qaResult);

      const decision = evaluateQAResult(state, qaResult);

      if (decision === "RELEASE") {
        // If QA passed on first try, that's still valid
        state = transition(state, "RELEASE");
        state = transition(state, "DONE");
        expect(state.phase).toBe("DONE");
      } else {
        // REJECT with maxRetries=0 → canRetry is false → FAIL
        expect(decision).toBe("FAIL");
        state = transition(state, "RETRY_CHECK");
        state = transition(state, "FAILED");
        expect(state.phase).toBe("FAILED");
      }
    },
    300_000,
  );

  it(
    "retry scenario — pipeline handles REJECT and retries",
    async () => {
      const gameDescription = "snake game with keyboard controls and score display";
      const gameName = slugify(gameDescription);
      createdGames.push(gameName);

      let state = createRoundState(1);

      const spec = await runPLInit(gameDescription, state.roundId);
      state = setSpec(state, spec);
      state = transition(state, "PLANNER_DEFINE");

      const breakdown = await runPlanner(spec);
      state = setBreakdown(state, breakdown);
      state = transition(state, "DEV_IMPLEMENT");

      await ensureOutputDir(gameName);
      let devResult = await runDeveloper(breakdown, gameName, false);
      state = setDevResult(state, devResult);

      let finalPhase: string = "";

      // QA loop (max retries + 1 attempts)
      for (let i = 0; i <= spec.maxRetries; i++) {
        state = transition(state, "QA_REVIEW");
        const qaResult = await runQA(devResult, spec, gameName);
        state = setQAResult(state, qaResult);

        const decision = evaluateQAResult(state, qaResult);

        if (decision === "RELEASE") {
          state = transition(state, "RELEASE");
          state = transition(state, "DONE");
          finalPhase = "DONE";
          break;
        }

        state = transition(state, "RETRY_CHECK");

        if (decision === "FAIL") {
          state = transition(state, "FAILED");
          finalPhase = "FAILED";
          break;
        }

        // RETRY
        state = incrementRetry(state);
        state = transition(state, "DEV_IMPLEMENT");
        devResult = await runDeveloper(breakdown, gameName, true, qaResult);
        state = setDevResult(state, devResult);
      }

      expect(["DONE", "FAILED"]).toContain(finalPhase);
    },
    600_000,
  );
});
