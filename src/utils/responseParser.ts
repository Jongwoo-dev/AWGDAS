import { createLogger } from "./logger.js";

const logger = createLogger({ agent: "responseParser" });

// ── 커스텀 에러 ───────────────────────────────────────────

export class ResponseParseError extends Error {
  constructor(
    public readonly label: string,
    public readonly rawText: string,
    cause?: Error,
  ) {
    super(
      `Failed to parse ${label} response as JSON. Raw: ${rawText.slice(0, 300)}`,
    );
    this.name = "ResponseParseError";
    if (cause) this.cause = cause;
  }
}

export class ValidationError extends Error {
  constructor(
    public readonly label: string,
    public readonly missingKeys: string[],
  ) {
    super(`${label} missing required fields: ${missingKeys.join(", ")}`);
    this.name = "ValidationError";
  }
}

// ── 내부 헬퍼 ─────────────────────────────────────────────

function tryParse(text: string): unknown {
  return JSON.parse(text);
}

function extractFromFence(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function extractBraceContent(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    return null;
  }
  return text.slice(firstBrace, lastBrace + 1);
}

function removeTrailingCommas(text: string): string {
  return text
    .replace(/,\s*([\]}])/g, "$1");
}

function closeTruncatedJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (const ch of text) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let result = text;
  if (inString) result += '"';

  while (stack.length > 0) {
    result += stack.pop();
  }

  return result;
}

function attemptRepair(text: string): unknown {
  // trailing comma 제거만으로 해결되는 경우
  const cleaned = removeTrailingCommas(text);
  try {
    return tryParse(cleaned);
  } catch {
    // fall through
  }

  // 잘린 JSON 닫기 (trailing comma 제거 전)
  const closed = closeTruncatedJson(text);
  const closedCleaned = removeTrailingCommas(closed);
  try {
    return tryParse(closedCleaned);
  } catch {
    // fall through
  }

  // trailing comma 제거 후 잘린 JSON 닫기
  const cleanedClosed = closeTruncatedJson(cleaned);
  return tryParse(cleanedClosed);
}

// ── 공개 API ──────────────────────────────────────────────

export function safeParseJson<T>(text: string, label: string): T {
  const trimmed = text.trim();

  // 1) 직접 파싱
  try {
    return tryParse(trimmed) as T;
  } catch {
    // fall through
  }

  // 2) markdown code fence 추출
  const fenced = extractFromFence(trimmed);
  if (fenced) {
    try {
      return tryParse(fenced) as T;
    } catch {
      // fall through
    }
  }

  // 3) 부분 JSON 복구 (원본 또는 fence 내용)
  const repairTarget = fenced ?? trimmed;
  try {
    const repaired = attemptRepair(repairTarget);
    logger.warn(`${label}: JSON repaired (partial recovery applied)`);
    return repaired as T;
  } catch {
    // fall through
  }

  // 4) 첫 { ~ 마지막 } 범위 추출 (앞뒤 텍스트 제거)
  const braced = extractBraceContent(trimmed);
  if (braced) {
    try {
      return tryParse(braced) as T;
    } catch {
      // fall through
    }

    // brace 추출 후 복구 시도
    try {
      const repaired = attemptRepair(braced);
      logger.warn(`${label}: JSON repaired (partial recovery applied)`);
      return repaired as T;
    } catch {
      // fall through
    }
  }

  // 5) 모든 시도 실패
  throw new ResponseParseError(label, trimmed);
}

export function validateFields<T>(
  data: unknown,
  requiredKeys: (keyof T)[],
  label: string,
): asserts data is T {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError(label, requiredKeys as string[]);
  }

  const missing = requiredKeys.filter(
    (key) => !(key as string in (data as Record<string, unknown>)),
  );

  if (missing.length > 0) {
    throw new ValidationError(label, missing as string[]);
  }
}

export function parseAndValidate<T>(
  text: string,
  label: string,
  requiredKeys: (keyof T)[],
): T {
  const data = safeParseJson<T>(text, label);
  validateFields<T>(data, requiredKeys, label);
  return data;
}
