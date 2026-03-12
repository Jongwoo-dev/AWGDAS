import Anthropic from "@anthropic-ai/sdk";
import {
  APIConnectionError,
  RateLimitError,
  InternalServerError,
} from "@anthropic-ai/sdk";
import type { AgentConfig } from "../types/index.js";
import { createLogger } from "./logger.js";

// ── 타입 정의 ────────────────────────────────────────────

export type AgentRole = "pl" | "planner" | "developer" | "qa";
export type ErrorCategory = "network" | "api" | "timeout" | "unknown";

export interface CallAgentParams {
  role: AgentRole;
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
}

export interface CallAgentWithToolsParams extends CallAgentParams {
  tools: Anthropic.Tool[];
  toolChoice?: Anthropic.ToolChoice;
}

export interface TextAgentResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ToolAgentResponse {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.Message["stop_reason"];
  usage: { inputTokens: number; outputTokens: number };
}

// ── 커스텀 에러 ──────────────────────────────────────────

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

const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  pl: { model: DEFAULT_MODEL, maxTokens: 4096, timeout: 30_000 },
  planner: { model: DEFAULT_MODEL, maxTokens: 16_384, timeout: 60_000 },
  developer: { model: DEFAULT_MODEL, maxTokens: 32_768, timeout: 600_000 },
  qa: { model: DEFAULT_MODEL, maxTokens: 16_384, timeout: 60_000 },
};

const MAX_RETRIES = 3;
const BACKOFF_DELAYS = [1000, 2000, 4000];

// ── 내부 헬퍼 ────────────────────────────────────────────

const logger = createLogger({ agent: "anthropicClient" });

let clientInstance: Anthropic | null = null;
let globalAbortController: AbortController | null = null;

export function getModel(): string {
  return process.env.AWGDAS_MODEL ?? DEFAULT_MODEL;
}

function isRetryableError(error: unknown): boolean {
  return (
    error instanceof APIConnectionError ||
    error instanceof RateLimitError ||
    error instanceof InternalServerError
  );
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return false;
}

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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export function resetUsageTracker(): void {
  _totalInputTokens = 0;
  _totalOutputTokens = 0;
  _totalApiCalls = 0;
}

function recordUsage(inputTokens: number, outputTokens: number): void {
  _totalInputTokens += inputTokens;
  _totalOutputTokens += outputTokens;
  _totalApiCalls += 1;
}

export function getAccumulatedUsage(): { totalInputTokens: number; totalOutputTokens: number; totalApiCalls: number } {
  return { totalInputTokens: _totalInputTokens, totalOutputTokens: _totalOutputTokens, totalApiCalls: _totalApiCalls };
}

// ── 공개 API ─────────────────────────────────────────────

export function getClient(): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic();
  }
  return clientInstance;
}

export function resetClient(): void {
  clientInstance = null;
  globalAbortController = null;
  resetUsageTracker();
}

export function getGlobalAbortSignal(): AbortSignal {
  if (!globalAbortController) {
    globalAbortController = new AbortController();
  }
  return globalAbortController.signal;
}

export function abortAllRequests(): void {
  globalAbortController?.abort();
  globalAbortController = new AbortController();
}

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
