import { describe, it, expect } from "vitest";
import {
  safeParseJson,
  validateFields,
  parseAndValidate,
  ResponseParseError,
  ValidationError,
} from "../responseParser.js";

interface TestData {
  name: string;
  value: number;
}

describe("safeParseJson", () => {
  it("parses valid JSON directly", () => {
    const result = safeParseJson<TestData>('{"name":"a","value":1}', "test");
    expect(result).toEqual({ name: "a", value: 1 });
  });

  it("parses JSON from markdown code fence", () => {
    const text = '```json\n{"name":"a","value":1}\n```';
    const result = safeParseJson<TestData>(text, "test");
    expect(result).toEqual({ name: "a", value: 1 });
  });

  it("parses JSON from fence without json language tag", () => {
    const text = '```\n{"name":"a","value":1}\n```';
    const result = safeParseJson<TestData>(text, "test");
    expect(result).toEqual({ name: "a", value: 1 });
  });

  it("extracts JSON surrounded by text", () => {
    const text = 'Here is the result:\n{"name":"a","value":1}\nLet me know if you need more.';
    const result = safeParseJson<TestData>(text, "test");
    expect(result).toEqual({ name: "a", value: 1 });
  });

  it("removes trailing commas", () => {
    const text = '{"name":"a","value":1,}';
    const result = safeParseJson<TestData>(text, "test");
    expect(result).toEqual({ name: "a", value: 1 });
  });

  it("removes trailing commas in arrays", () => {
    const text = '{"items":["a","b",]}';
    const result = safeParseJson<{ items: string[] }>(text, "test");
    expect(result).toEqual({ items: ["a", "b"] });
  });

  it("closes truncated JSON (missing closing brace)", () => {
    const text = '{"name":"a","value":1';
    const result = safeParseJson<TestData>(text, "test");
    expect(result).toEqual({ name: "a", value: 1 });
  });

  it("closes truncated JSON with nested structure", () => {
    const text = '{"items":[{"id":1},{"id":2';
    const result = safeParseJson<{ items: { id: number }[] }>(
      text,
      "test",
    );
    expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }] });
  });

  it("handles combined trailing comma + truncation", () => {
    const text = '{"name":"a","value":1,';
    const result = safeParseJson<TestData>(text, "test");
    expect(result).toEqual({ name: "a", value: 1 });
  });

  it("throws ResponseParseError for unparseable text", () => {
    expect(() => safeParseJson("not json at all", "test")).toThrow(
      ResponseParseError,
    );
  });

  it("includes label and raw text in ResponseParseError", () => {
    try {
      safeParseJson("garbage", "MyLabel");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ResponseParseError);
      const err = e as ResponseParseError;
      expect(err.label).toBe("MyLabel");
      expect(err.rawText).toBe("garbage");
      expect(err.message).toContain("MyLabel");
    }
  });

  it("handles empty string", () => {
    expect(() => safeParseJson("", "test")).toThrow(ResponseParseError);
  });

  it("parses JSON with whitespace padding", () => {
    const text = '  \n  {"name":"a","value":1}  \n  ';
    const result = safeParseJson<TestData>(text, "test");
    expect(result).toEqual({ name: "a", value: 1 });
  });
});

describe("validateFields", () => {
  it("passes when all required keys are present", () => {
    const data = { name: "a", value: 1 };
    expect(() =>
      validateFields<TestData>(data, ["name", "value"], "test"),
    ).not.toThrow();
  });

  it("throws ValidationError when keys are missing", () => {
    const data = { name: "a" };
    expect(() =>
      validateFields<TestData>(data, ["name", "value"], "test"),
    ).toThrow(ValidationError);
  });

  it("includes missing keys in error", () => {
    const data = {};
    try {
      validateFields<TestData>(data, ["name", "value"], "test");
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as ValidationError;
      expect(err.missingKeys).toEqual(["name", "value"]);
      expect(err.label).toBe("test");
    }
  });

  it("throws ValidationError for null", () => {
    expect(() =>
      validateFields<TestData>(null, ["name"], "test"),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError for non-object", () => {
    expect(() =>
      validateFields<TestData>("string" as unknown, ["name"], "test"),
    ).toThrow(ValidationError);
  });
});

describe("parseAndValidate", () => {
  it("parses and validates successfully", () => {
    const text = '{"name":"a","value":1}';
    const result = parseAndValidate<TestData>(text, "test", ["name", "value"]);
    expect(result).toEqual({ name: "a", value: 1 });
  });

  it("throws ResponseParseError for invalid JSON", () => {
    expect(() =>
      parseAndValidate<TestData>("not json", "test", ["name"]),
    ).toThrow(ResponseParseError);
  });

  it("throws ValidationError for missing fields", () => {
    const text = '{"name":"a"}';
    expect(() =>
      parseAndValidate<TestData>(text, "test", ["name", "value"]),
    ).toThrow(ValidationError);
  });
});
