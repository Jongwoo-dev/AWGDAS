/** 로그 심각도 수준. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 로그 메시지에 첨부할 컨텍스트 정보. */
export interface LogContext {
  phase?: string;
  roundId?: number;
  agent?: string;
}

/** 구조화된 로깅 인터페이스. stderr로 출력한다. */
export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
  /** 컨텍스트를 확장한 자식 로거를 생성한다. */
  child(context: Partial<LogContext>): Logger;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** AWGDAS_LOG_LEVEL 환경 변수에서 최소 로그 레벨을 읽는다. */
function getMinLevel(): LogLevel {
  const env = process.env.AWGDAS_LOG_LEVEL;
  if (env && env in LOG_LEVEL_ORDER) {
    return env as LogLevel;
  }
  return "info";
}

/** LogContext를 "[phase:X round:Y agent:Z]" 형식 문자열로 변환한다. */
function formatContext(ctx: LogContext): string {
  const parts: string[] = [];
  if (ctx.phase) parts.push(`phase:${ctx.phase}`);
  if (ctx.roundId !== undefined) parts.push(`round:${ctx.roundId}`);
  if (ctx.agent) parts.push(`agent:${ctx.agent}`);
  return parts.length > 0 ? ` [${parts.join(" ")}]` : "";
}

/** extra 객체를 JSON 문자열로 변환한다. */
function formatExtra(extra?: Record<string, unknown>): string {
  if (!extra || Object.keys(extra).length === 0) return "";
  return ` ${JSON.stringify(extra)}`;
}

/** 주어진 컨텍스트로 Logger 인스턴스를 구성한다. */
function buildLogger(context: LogContext): Logger {
  const write = (level: LogLevel, message: string, extra?: Record<string, unknown>): void => {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[getMinLevel()]) return;

    const timestamp = new Date().toISOString();
    const tag = level.toUpperCase().padEnd(5);
    const line = `[${timestamp}] ${tag}${formatContext(context)} ${message}${formatExtra(extra)}\n`;
    process.stderr.write(line);
  };

  return {
    debug: (msg, extra) => write("debug", msg, extra),
    info: (msg, extra) => write("info", msg, extra),
    warn: (msg, extra) => write("warn", msg, extra),
    error: (msg, extra) => write("error", msg, extra),
    child: (childContext) =>
      buildLogger({ ...context, ...childContext }),
  };
}

/**
 * 구조화된 Logger를 생성한다.
 *
 * @param defaultContext - 모든 로그 메시지에 첨부될 기본 컨텍스트
 * @returns Logger 인스턴스
 */
export function createLogger(defaultContext: LogContext = {}): Logger {
  return buildLogger(defaultContext);
}
