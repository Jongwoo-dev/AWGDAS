import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RoundSpec, FeatureBreakdown } from "../../types/index.js";

vi.mock("../../utils/anthropicClient.js", () => ({
  callAgent: vi.fn(),
}));

vi.mock("../../utils/responseParser.js", () => ({
  parseAndValidate: vi.fn((text: string) => JSON.parse(text)),
}));

vi.mock("../../utils/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  }),
}));

import { runPlanner } from "../plannerAgent.js";
import { callAgent } from "../../utils/anthropicClient.js";
import { parseAndValidate } from "../../utils/responseParser.js";

const mockCallAgent = vi.mocked(callAgent);
const mockParseAndValidate = vi.mocked(parseAndValidate);

function makeSpec(): RoundSpec {
  return {
    roundId: 1,
    gameDescription: "A simple space shooter",
    features: ["player movement", "shooting"],
    acceptanceCriteria: [
      { id: "AC1", description: "Player moves with arrow keys" },
    ],
    scopeLock: [],
    maxRetries: 2,
  };
}

function makeBreakdown(): FeatureBreakdown {
  return {
    roundId: 1,
    fileStructure: ["index.html", "js/main.js", "js/player.js"],
    features: [
      {
        id: "F1",
        name: "player movement",
        description: "Arrow key movement",
        targetFiles: ["js/player.js"],
        edgeCases: ["boundary check"],
      },
    ],
  };
}

describe("runPlanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid FeatureBreakdown from API response", async () => {
    const breakdown = makeBreakdown();
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(breakdown),
      usage: { inputTokens: 200, outputTokens: 100 },
    });

    const result = await runPlanner(makeSpec());

    expect(result).toEqual(breakdown);
  });

  it("passes spec as JSON string in user message", async () => {
    const spec = makeSpec();
    const breakdown = makeBreakdown();
    mockCallAgent.mockResolvedValueOnce({
      text: JSON.stringify(breakdown),
      usage: { inputTokens: 200, outputTokens: 100 },
    });

    await runPlanner(spec);

    expect(mockCallAgent).toHaveBeenCalledTimes(1);
    const args = mockCallAgent.mock.calls[0][0];
    expect(args.role).toBe("planner");
    expect(args.messages[0].content).toBe(JSON.stringify(spec));
  });

  it("propagates parseAndValidate errors", async () => {
    mockCallAgent.mockResolvedValueOnce({
      text: "not-json",
      usage: { inputTokens: 200, outputTokens: 100 },
    });
    mockParseAndValidate.mockImplementationOnce(() => {
      throw new Error("Failed to parse JSON");
    });

    await expect(runPlanner(makeSpec())).rejects.toThrow(
      "Failed to parse JSON",
    );
  });
});
