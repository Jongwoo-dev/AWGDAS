import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted로 mock 의존성을 hoisting하여 vi.mock factory에서 참조 가능하게 함
const { mockStream, errors } = vi.hoisted(() => {
  const mockStream = vi.fn();

  class APIConnectionError extends Error {
    name = "APIConnectionError";
  }
  class RateLimitError extends Error {
    name = "RateLimitError";
  }
  class InternalServerError extends Error {
    name = "InternalServerError";
  }
  class BadRequestError extends Error {
    name = "BadRequestError";
  }
  class AuthenticationError extends Error {
    name = "AuthenticationError";
  }

  return {
    mockStream,
    errors: {
      APIConnectionError,
      RateLimitError,
      InternalServerError,
      BadRequestError,
      AuthenticationError,
    },
  };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStream };
  },
  APIConnectionError: errors.APIConnectionError,
  RateLimitError: errors.RateLimitError,
  InternalServerError: errors.InternalServerError,
  BadRequestError: errors.BadRequestError,
  AuthenticationError: errors.AuthenticationError,
}));

import {
  getClient,
  resetClient,
  callAgent,
  callAgentWithTools,
} from "../anthropicClient.js";

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text: '{"result":"ok"}', citations: null }],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
    ...overrides,
  };
}

function makeToolMessage() {
  return makeMessage({
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "I will write the file", citations: null },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "write_file",
        input: { path: "index.html", content: "<html/>" },
      },
    ],
  });
}

function mockStreamResolve(msg: ReturnType<typeof makeMessage>) {
  mockStream.mockReturnValueOnce({
    finalMessage: () => Promise.resolve(msg),
  });
}

function mockStreamReject(error: Error) {
  mockStream.mockReturnValueOnce({
    finalMessage: () => Promise.reject(error),
  });
}

describe("getClient", () => {
  beforeEach(() => {
    resetClient();
  });

  it("returns an Anthropic instance", () => {
    const client = getClient();
    expect(client).toBeDefined();
    expect(client.messages).toBeDefined();
  });

  it("returns the same instance on subsequent calls (singleton)", () => {
    const a = getClient();
    const b = getClient();
    expect(a).toBe(b);
  });
});

describe("callAgent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetClient();
    mockStream.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AWGDAS_MODEL;
  });

  it("returns text from a successful API call", async () => {
    mockStreamResolve(makeMessage());

    const result = await callAgent({
      role: "pl",
      systemPrompt: "You are PL",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.text).toBe('{"result":"ok"}');
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
  });

  it("uses correct max_tokens for each role", async () => {
    const roles = [
      { role: "pl" as const, maxTokens: 4096 },
      { role: "planner" as const, maxTokens: 16_384 },
      { role: "developer" as const, maxTokens: 32_768 },
      { role: "qa" as const, maxTokens: 16_384 },
    ];

    for (const { role, maxTokens } of roles) {
      mockStreamResolve(makeMessage());
      await callAgent({
        role,
        systemPrompt: "test",
        messages: [{ role: "user", content: "test" }],
      });

      const callArgs = mockStream.mock.calls.at(-1)![0];
      expect(callArgs.max_tokens).toBe(maxTokens);
    }
  });

  it("uses correct timeout for each role", async () => {
    const roles = [
      { role: "pl" as const, timeout: 30_000 },
      { role: "planner" as const, timeout: 60_000 },
      { role: "developer" as const, timeout: 600_000 },
      { role: "qa" as const, timeout: 60_000 },
    ];

    for (const { role, timeout } of roles) {
      mockStreamResolve(makeMessage());
      await callAgent({
        role,
        systemPrompt: "test",
        messages: [{ role: "user", content: "test" }],
      });

      const options = mockStream.mock.calls.at(-1)![1];
      expect(options.timeout).toBe(timeout);
    }
  });

  it("throws if response contains no text block", async () => {
    mockStreamResolve(makeMessage({
      content: [{ type: "tool_use", id: "t1", name: "x", input: {} }],
    }));

    await expect(
      callAgent({
        role: "pl",
        systemPrompt: "test",
        messages: [{ role: "user", content: "test" }],
      }),
    ).rejects.toThrow("returned no text content");
  });

  it("retries on RateLimitError and succeeds", async () => {
    mockStreamReject(new errors.RateLimitError());
    mockStreamResolve(makeMessage());

    const promise = callAgent({
      role: "pl",
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.text).toBe('{"result":"ok"}');
    expect(mockStream).toHaveBeenCalledTimes(2);
  });

  it("retries on APIConnectionError and succeeds", async () => {
    mockStreamReject(new errors.APIConnectionError());
    mockStreamResolve(makeMessage());

    const promise = callAgent({
      role: "pl",
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.text).toBe('{"result":"ok"}');
  });

  it("retries on InternalServerError and succeeds", async () => {
    mockStreamReject(new errors.InternalServerError());
    mockStreamResolve(makeMessage());

    const promise = callAgent({
      role: "pl",
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.text).toBe('{"result":"ok"}');
  });

  it("throws after 3 failed retries", async () => {
    mockStreamReject(new errors.RateLimitError());
    mockStreamReject(new errors.RateLimitError());
    mockStreamReject(new errors.RateLimitError());

    const promise = callAgent({
      role: "pl",
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    });

    // rejection handler를 먼저 연결하여 unhandled rejection 방지
    const assertion = expect(promise).rejects.toThrow();

    // 1s + 2s backoff (3번째 시도 후 즉시 throw, 추가 sleep 없음)
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await assertion;
    expect(mockStream).toHaveBeenCalledTimes(3);
  });

  it("does not retry on BadRequestError", async () => {
    mockStreamReject(new errors.BadRequestError());

    await expect(
      callAgent({
        role: "pl",
        systemPrompt: "test",
        messages: [{ role: "user", content: "test" }],
      }),
    ).rejects.toThrow();

    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it("does not retry on AuthenticationError", async () => {
    mockStreamReject(new errors.AuthenticationError());

    await expect(
      callAgent({
        role: "pl",
        systemPrompt: "test",
        messages: [{ role: "user", content: "test" }],
      }),
    ).rejects.toThrow();

    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it("uses AWGDAS_MODEL env var when set", async () => {
    process.env.AWGDAS_MODEL = "claude-opus-4-6";
    mockStreamResolve(makeMessage());

    await callAgent({
      role: "pl",
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    });

    const callArgs = mockStream.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-opus-4-6");
  });
});

describe("callAgentWithTools", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetClient();
    mockStream.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns content blocks including tool_use", async () => {
    mockStreamResolve(makeToolMessage());

    const result = await callAgentWithTools({
      role: "developer",
      systemPrompt: "You are Developer",
      messages: [{ role: "user", content: "Implement" }],
      tools: [
        {
          name: "write_file",
          description: "Write a file",
          input_schema: {
            type: "object" as const,
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
          },
        },
      ],
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe("text");
    expect(result.content[1].type).toBe("tool_use");
    expect(result.stopReason).toBe("tool_use");
  });

  it("passes tools and tool_choice to API", async () => {
    mockStreamResolve(makeToolMessage());

    const tools = [
      {
        name: "write_file",
        description: "Write",
        input_schema: { type: "object" as const },
      },
    ];
    const toolChoice = { type: "auto" as const };

    await callAgentWithTools({
      role: "developer",
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
      tools,
      toolChoice,
    });

    const callArgs = mockStream.mock.calls[0][0];
    expect(callArgs.tools).toEqual(tools);
    expect(callArgs.tool_choice).toEqual(toolChoice);
  });

  it("retries on transient errors", async () => {
    mockStreamReject(new errors.RateLimitError());
    mockStreamResolve(makeToolMessage());

    const promise = callAgentWithTools({
      role: "developer",
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
      tools: [],
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.content).toHaveLength(2);
    expect(mockStream).toHaveBeenCalledTimes(2);
  });
});
