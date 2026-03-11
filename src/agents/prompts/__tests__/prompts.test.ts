import { describe, it, expect } from "vitest";
import {
  PL_SYSTEM_PROMPT,
  PLANNER_SYSTEM_PROMPT,
  DEVELOPER_SYSTEM_PROMPT,
  QA_SYSTEM_PROMPT,
} from "../index.js";

describe("PL_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof PL_SYSTEM_PROMPT).toBe("string");
    expect(PL_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("contains RoundSpec output schema fields", () => {
    expect(PL_SYSTEM_PROMPT).toContain("roundId");
    expect(PL_SYSTEM_PROMPT).toContain("gameDescription");
    expect(PL_SYSTEM_PROMPT).toContain("features");
    expect(PL_SYSTEM_PROMPT).toContain("acceptanceCriteria");
    expect(PL_SYSTEM_PROMPT).toContain("scopeLock");
    expect(PL_SYSTEM_PROMPT).toContain("maxRetries");
  });

  it("contains forbidden actions", () => {
    expect(PL_SYSTEM_PROMPT).toContain("MUST NOT implement features directly");
    expect(PL_SYSTEM_PROMPT).toContain("MUST NOT expand scope");
  });

  it("contains AC rules with Yes/No requirement", () => {
    expect(PL_SYSTEM_PROMPT).toContain("Yes/No");
  });

  it("contains Retry Policy with max 2", () => {
    expect(PL_SYSTEM_PROMPT).toContain("Maximum retries per feature: 2");
  });

  it("contains Scope Lock Policy", () => {
    expect(PL_SYSTEM_PROMPT).toContain("Scope Lock");
    expect(PL_SYSTEM_PROMPT).toContain("No feature additions");
  });
});

describe("PLANNER_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof PLANNER_SYSTEM_PROMPT).toBe("string");
    expect(PLANNER_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("contains FeatureBreakdown output schema fields", () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain("roundId");
    expect(PLANNER_SYSTEM_PROMPT).toContain("fileStructure");
    expect(PLANNER_SYSTEM_PROMPT).toContain("features");
    expect(PLANNER_SYSTEM_PROMPT).toContain("targetFiles");
    expect(PLANNER_SYSTEM_PROMPT).toContain("edgeCases");
  });

  it("contains forbidden actions", () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain("MUST NOT suggest features outside");
  });

  it("contains file separation principle", () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain("separated files");
    expect(PLANNER_SYSTEM_PROMPT).toContain("NOT a single monolithic HTML");
  });

  it("contains output directory structure", () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain("index.html");
    expect(PLANNER_SYSTEM_PROMPT).toContain("manifest.json");
    expect(PLANNER_SYSTEM_PROMPT).toContain("README.md");
  });
});

describe("DEVELOPER_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof DEVELOPER_SYSTEM_PROMPT).toBe("string");
    expect(DEVELOPER_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("contains DevResult output schema fields", () => {
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("roundId");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("implementedFeatures");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("summary");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("changedFiles");
  });

  it("contains forbidden actions", () => {
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("MUST NOT modify code outside");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("MUST NOT refactor");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("MUST NOT write TODO");
  });

  it("contains manifest rules", () => {
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("manifest.json");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("simultaneously with the first game file");
  });

  it("contains manifest role types", () => {
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("entry");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("core");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("feature");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("render");
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("asset");
  });

  it("contains tool_use instruction", () => {
    expect(DEVELOPER_SYSTEM_PROMPT).toContain("write_file");
  });

  it("contains file action types", () => {
    expect(DEVELOPER_SYSTEM_PROMPT).toContain('"created"');
    expect(DEVELOPER_SYSTEM_PROMPT).toContain('"modified"');
    expect(DEVELOPER_SYSTEM_PROMPT).toContain('"deleted"');
  });
});

describe("QA_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof QA_SYSTEM_PROMPT).toBe("string");
    expect(QA_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("contains QAResult output schema fields", () => {
    expect(QA_SYSTEM_PROMPT).toContain("roundId");
    expect(QA_SYSTEM_PROMPT).toContain("verdict");
    expect(QA_SYSTEM_PROMPT).toContain("fileIntegrity");
    expect(QA_SYSTEM_PROMPT).toContain("results");
    expect(QA_SYSTEM_PROMPT).toContain("criteriaId");
  });

  it("contains forbidden actions", () => {
    expect(QA_SYSTEM_PROMPT).toContain("MUST NOT suggest improvements");
    expect(QA_SYSTEM_PROMPT).toContain("MUST NOT make abstract");
  });

  it("contains manifest integrity check rules", () => {
    expect(QA_SYSTEM_PROMPT).toContain("Manifest Integrity");
    expect(QA_SYSTEM_PROMPT).toContain("fileIntegrity");
    expect(QA_SYSTEM_PROMPT).toContain("REJECT");
  });

  it("contains Definition of Done criteria", () => {
    expect(QA_SYSTEM_PROMPT).toContain("Definition of Done");
    expect(QA_SYSTEM_PROMPT).toContain("console.error");
    expect(QA_SYSTEM_PROMPT).toContain("README.md");
  });

  it("contains REJECT format requirements", () => {
    expect(QA_SYSTEM_PROMPT).toContain("reproduction");
    expect(QA_SYSTEM_PROMPT).toContain("root cause");
  });

  it("contains verdict values", () => {
    expect(QA_SYSTEM_PROMPT).toContain('"PASS"');
    expect(QA_SYSTEM_PROMPT).toContain('"REJECT"');
  });
});
