import { createLogger } from "./logger.js";

const logger = createLogger({ agent: "responseParser" });

// ── 커스텀 에러 ───────────────────────────────────────────

/**
 * JSON 응답 파싱 실패 시 발생하는 에러.
 * 원본 텍스트의 처음 300자를 메시지에 포함한다.
 */
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

/**
 * 필수 필드가 누락된 경우 발생하는 검증 에러.
 */
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

/** JSON.parse를 직접 시도한다. */
function tryParse(text: string): unknown {
  return JSON.parse(text);
}

/** markdown ```json 코드 펜스 내부의 텍스트를 추출한다. */
function extractFromFence(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/** 첫 번째 '{' ~ 마지막 '}' 범위의 텍스트를 추출한다. */
function extractBraceContent(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    return null;
  }
  return text.slice(firstBrace, lastBrace + 1);
}

/** trailing comma를 제거한다. */
function removeTrailingCommas(text: string): string {
  return text
    .replace(/,\s*([\]}])/g, "$1");
}

/** 잘린(truncated) JSON 문자열의 미닫힌 괄호를 자동으로 닫는다. */
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

/** trailing comma 제거와 잘린 JSON 닫기를 조합하여 복구를 시도한다. */
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

/**
 * AI 응답 텍스트를 JSON으로 파싱한다.
 * 직접 파싱 → 코드 펜스 추출 → 부분 복구 → brace 추출 → 복합 복구 순으로 시도한다.
 *
 * @param text - AI 응답 원본 텍스트
 * @param label - 에러 메시지에 사용할 식별 레이블
 * @returns 파싱된 객체
 * @throws ResponseParseError - 모든 파싱 전략 실패 시
 */
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

/**
 * 객체에 필수 필드가 모두 존재하는지 검증한다.
 *
 * @param data - 검증할 대상 객체
 * @param requiredKeys - 필수 필드 이름 배열
 * @param label - 에러 메시지에 사용할 식별 레이블
 * @throws ValidationError - 필수 필드가 누락된 경우
 */
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

/**
 * JSON 파싱과 필수 필드 검증을 한 번에 수행한다.
 *
 * @param text - AI 응답 원본 텍스트
 * @param label - 에러 메시지에 사용할 식별 레이블
 * @param requiredKeys - 필수 필드 이름 배열
 * @returns 파싱 및 검증된 객체
 * @throws ResponseParseError | ValidationError
 */
export function parseAndValidate<T>(
  text: string,
  label: string,
  requiredKeys: (keyof T)[],
): T {
  const data = safeParseJson<T>(text, label);
  validateFields<T>(data, requiredKeys, label);
  return data;
}
