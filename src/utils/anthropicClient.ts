import Anthropic from "@anthropic-ai/sdk";
import {
  APIConnectionError,
  RateLimitError,
  InternalServerError,
} from "@anthropic-ai/sdk";
import type { AgentConfig } from "../types/index.js";
import { createLogger } from "./logger.js";

// ── 타입 정의 ────────────────────────────────────────────

/** 에이전트 역할 식별자. */
export type AgentRole = "pl" | "planner" | "developer" | "qa";

/** API 에러 분류. */
export type ErrorCategory = "network" | "api" | "timeout" | "unknown";

/** 텍스트 전용 에이전트 호출 파라미터. */
export interface CallAgentParams {
  role: AgentRole;
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
}

/** 도구 사용 에이전트 호출 파라미터. */
export interface CallAgentWithToolsParams extends CallAgentParams {
  tools: Anthropic.Tool[];
  toolChoice?: Anthropic.ToolChoice;
}

/** 텍스트 전용 에이전트 호출 응답. */
export interface TextAgentResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** 도구 사용 에이전트 호출 응답. */
export interface ToolAgentResponse {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.Message["stop_reason"];
  usage: { inputTokens: number; outputTokens: number };
}

// ── 커스텀 에러 ──────────────────────────────────────────

/**
 * 에이전트 API 호출 실패 시 발생하는 에러.
 * 에러 카테고리와 원본 에러를 함께 보존한다.
 */
export class AgentCallError extends Error {
  constructor(
    public readonly role: AgentRole,
    public readonly category: ErrorCategory,
    public readonly originalError: Error,
  ) {
    super(`Agent ${role} call failed [${category}]: ${originalError.message}`);
    this.name = "AgentCallError";
    this.cause = originalError;
  }
}

// ── 상수 ─────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-opus-4-6";

/** 에이전트 역할별 모델 설정 (최대 토큰, 타임아웃). */
const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  pl: { model: DEFAULT_MODEL, maxTokens: 4096, timeout: 30_000 },
  planner: { model: DEFAULT_MODEL, maxTokens: 16_384, timeout: 60_000 },
  developer: { model: DEFAULT_MODEL, maxTokens: 32_768, timeout: 600_000 },
  qa: { model: DEFAULT_MODEL, maxTokens: 16_384, timeout: 60_000 },
};

/** API 호출 최대 재시도 횟수. */
const MAX_RETRIES = 3;

/** 재시도 간 지수 백오프 지연 시간(ms). */
const BACKOFF_DELAYS = [1000, 2000, 4000];

// ── 내부 헬퍼 ────────────────────────────────────────────

const logger = createLogger({ agent: "anthropicClient" });

let clientInstance: Anthropic | null = null;
let globalAbortController: AbortController | null = null;

/** 환경 변수 AWGDAS_MODEL 또는 기본 모델명을 반환한다. */
export function getModel(): string {
  return process.env.AWGDAS_MODEL ?? DEFAULT_MODEL;
}

/** Anthropic SDK의 재시도 가능한 에러인지 판별한다. */
function isRetryableError(error: unknown): boolean {
  return (
    error instanceof APIConnectionError ||
    error instanceof RateLimitError ||
    error instanceof InternalServerError
  );
}

/** AbortError(사용자 중단 또는 타임아웃)인지 판별한다. */
function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return false;
}

/** 에러를 ErrorCategory로 분류한다. */
function classifyError(error: unknown): ErrorCategory {
  if (isAbortError(error)) return "timeout";
  if (error instanceof APIConnectionError) return "network";
  if (
    error instanceof RateLimitError ||
    error instanceof InternalServerError
  ) {
    return "api";
  }
  return "unknown";
}

/** 지정한 밀리초만큼 대기한다. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 지수 백오프로 재시도하며 API 호출을 실행한다.
 * 재시도 불가능한 에러이거나 최대 횟수 초과 시 AgentCallError를 던진다.
 */
async function executeWithRetry(
  fn: () => Promise<Anthropic.Message>,
  role: AgentRole,
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLast = attempt === MAX_RETRIES - 1;

      if (!isRetryableError(error) || isLast) {
        const category = classifyError(error);
        logger.error(`Agent ${role} API call failed`, {
          attempt: attempt + 1,
          category,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new AgentCallError(
          role,
          category,
          error instanceof Error ? error : new Error(String(error)),
        );
      }

      const delay = BACKOFF_DELAYS[attempt];
      logger.warn(`Agent ${role} API call failed, retrying in ${delay}ms`, {
        attempt: attempt + 1,
      });
      await sleep(delay);
    }
  }

  throw new Error("Retry logic error: unreachable");
}

// ── 사용량 추적 ─────────────────────────────────────────

let _totalInputTokens = 0;
let _totalOutputTokens = 0;
let _totalApiCalls = 0;

/** 누적 토큰 사용량 카운터를 초기화한다. */
export function resetUsageTracker(): void {
  _totalInputTokens = 0;
  _totalOutputTokens = 0;
  _totalApiCalls = 0;
}

/** API 호출 토큰 사용량을 누적한다. */
function recordUsage(inputTokens: number, outputTokens: number): void {
  _totalInputTokens += inputTokens;
  _totalOutputTokens += outputTokens;
  _totalApiCalls += 1;
}

/**
 * 누적된 토큰 사용량과 API 호출 횟수를 반환한다.
 *
 * @returns 입력 토큰, 출력 토큰, API 호출 수
 */
export function getAccumulatedUsage(): { totalInputTokens: number; totalOutputTokens: number; totalApiCalls: number } {
  return { totalInputTokens: _totalInputTokens, totalOutputTokens: _totalOutputTokens, totalApiCalls: _totalApiCalls };
}

// ── 공개 API ─────────────────────────────────────────────

/**
 * Anthropic 클라이언트 싱글턴을 반환한다.
 * 최초 호출 시 인스턴스를 생성한다.
 */
export function getClient(): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic();
  }
  return clientInstance;
}

/** 클라이언트, AbortController, 사용량 추적기를 모두 초기화한다. */
export function resetClient(): void {
  clientInstance = null;
  globalAbortController = null;
  resetUsageTracker();
}

/** 글로벌 AbortSignal을 반환한다. 없으면 새로 생성한다. */
export function getGlobalAbortSignal(): AbortSignal {
  if (!globalAbortController) {
    globalAbortController = new AbortController();
  }
  return globalAbortController.signal;
}

/** 진행 중인 모든 API 요청을 중단하고 AbortController를 교체한다. */
export function abortAllRequests(): void {
  globalAbortController?.abort();
  globalAbortController = new AbortController();
}

/**
 * 텍스트 전용 에이전트를 호출한다.
 * 스트리밍으로 응답을 받고, 첫 번째 텍스트 블록을 반환한다.
 *
 * @param params - 에이전트 호출 파라미터
 * @returns 텍스트 응답과 토큰 사용량
 * @throws AgentCallError - API 호출 실패 시
 */
export async function callAgent(
  params: CallAgentParams,
): Promise<TextAgentResponse> {
  const config = AGENT_CONFIGS[params.role];
  const client = getClient();

  const message = await executeWithRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);
      try {
        const globalSignal = getGlobalAbortSignal();
        if (globalSignal.aborted) controller.abort();
        globalSignal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });

        const stream = client.messages.stream(
          {
            model: getModel(),
            max_tokens: config.maxTokens,
            system: params.systemPrompt,
            messages: params.messages,
          },
          { timeout: config.timeout, signal: controller.signal },
        );
        return await stream.finalMessage();
      } finally {
        clearTimeout(timeoutId);
      }
    },
    params.role,
  );

  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    throw new Error(`Agent ${params.role} returned no text content`);
  }

  recordUsage(message.usage.input_tokens, message.usage.output_tokens);

  return {
    text: textBlock.text,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

/**
 * 도구 사용 에이전트를 호출한다.
 * 스트리밍으로 응답을 받고, 전체 content 블록을 반환한다.
 *
 * @param params - 에이전트 호출 파라미터 (도구 정의 포함)
 * @returns content 블록, 중지 사유, 토큰 사용량
 * @throws AgentCallError - API 호출 실패 시
 */
export async function callAgentWithTools(
  params: CallAgentWithToolsParams,
): Promise<ToolAgentResponse> {
  const config = AGENT_CONFIGS[params.role];
  const client = getClient();

  const message = await executeWithRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);
      try {
        const globalSignal = getGlobalAbortSignal();
        if (globalSignal.aborted) controller.abort();
        globalSignal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });

        const stream = client.messages.stream(
          {
            model: getModel(),
            max_tokens: config.maxTokens,
            system: params.systemPrompt,
            messages: params.messages,
            tools: params.tools,
            tool_choice: params.toolChoice,
          },
          { timeout: config.timeout, signal: controller.signal },
        );
        return await stream.finalMessage();
      } finally {
        clearTimeout(timeoutId);
      }
    },
    params.role,
  );

  recordUsage(message.usage.input_tokens, message.usage.output_tokens);

  return {
    content: message.content,
    stopReason: message.stop_reason,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
