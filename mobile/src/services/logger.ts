export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

export interface LogTransport {
  send(event: LogEvent): Promise<void>;
}

/**
 * Posts to the backend's /logs endpoint on a best-effort basis. Never
 * throws — a logging failure must not interrupt the user's scan flow.
 */
class BackendLogTransport implements LogTransport {
  constructor(private readonly baseUrl: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async send(event: LogEvent): Promise<void> {
    try {
      await this.fetchImpl(`${this.baseUrl}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch {
      // Best-effort only; swallow so a dead backend never blocks the UI.
    }
  }
}

export class Logger {
  private transport: LogTransport | null;

  constructor(transport: LogTransport | null = null) {
    this.transport = transport;
  }

  configureBackend(baseUrl: string, fetchImpl?: typeof fetch) {
    this.transport = new BackendLogTransport(baseUrl, fetchImpl);
  }

  private record(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const event: LogEvent = { level, message, context, timestamp: new Date().toISOString() };
    const isDev = (globalThis as { __DEV__?: boolean }).__DEV__ ?? true;
    if (isDev) {
      // eslint-disable-next-line no-console
      console[level === 'info' ? 'log' : level](`[Sprout] ${message}`, context ?? '');
    }
    void this.transport?.send(event);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.record('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.record('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.record('error', message, context);
  }
}

export const logger = new Logger();
