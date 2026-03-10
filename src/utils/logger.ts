export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  phase?: string;
  roundId?: number;
  agent?: string;
}

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
  child(context: Partial<LogContext>): Logger;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const env = process.env.AWGDAS_LOG_LEVEL;
  if (env && env in LOG_LEVEL_ORDER) {
    return env as LogLevel;
  }
  return "info";
}

function formatContext(ctx: LogContext): string {
  const parts: string[] = [];
  if (ctx.phase) parts.push(`phase:${ctx.phase}`);
  if (ctx.roundId !== undefined) parts.push(`round:${ctx.roundId}`);
  if (ctx.agent) parts.push(`agent:${ctx.agent}`);
  return parts.length > 0 ? ` [${parts.join(" ")}]` : "";
}

function formatExtra(extra?: Record<string, unknown>): string {
  if (!extra || Object.keys(extra).length === 0) return "";
  return ` ${JSON.stringify(extra)}`;
}

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

export function createLogger(defaultContext: LogContext = {}): Logger {
  return buildLogger(defaultContext);
}
