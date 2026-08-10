/**
 * Utilities for retrying transient HTTP and network failures with exponential
 * backoff, jitter, `Retry-After` support, and cancellation support.
 */

export const DEFAULT_RETRYABLE_STATUS_CODES = [
  408,
  429,
  500,
  502,
  503,
  504,
] as const;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 10_000;
const DEFAULT_BACKOFF_FACTOR = 2;

export interface RetryableResponse {
  readonly status: number;
  readonly headers?: Headers | Record<string, string | undefined>;
}

export interface RetryContext<T = unknown> {
  /** The failed attempt number, starting at 1. */
  readonly attempt: number;
  /** The attempt that will run after the retry delay. */
  readonly nextAttempt: number;
  /** The maximum number of attempts that may be made. */
  readonly maxAttempts: number;
  /** The error thrown by the operation, when applicable. */
  readonly error?: unknown;
  /** The retryable HTTP response, when applicable. */
  readonly response?: T;
  /** The computed delay before the next attempt. */
  readonly delayMs: number;
}

export interface RetryOperationContext {
  /** The current attempt number, starting at 1. */
  readonly attempt: number;
  /** The configured maximum number of attempts. */
  readonly maxAttempts: number;
  /** A caller-provided cancellation signal, if supplied. */
  readonly signal?: AbortSignal;
}

export interface RetryOptions<T = unknown> {
  /**
   * Maximum total attempts, including the initial request.
   *
   * Defaults to `3`.
   */
  maxAttempts?: number;
  /**
   * Legacy-style retry count. Used only when `maxAttempts` is not provided.
   * For example, `maxRetries: 2` permits three total attempts.
   */
  maxRetries?: number;
  /**
   * Initial exponential-backoff delay in milliseconds.
   *
   * Defaults to `250`.
   */
  baseDelayMs?: number;
  /** Alias for `baseDelayMs`. */
  initialDelayMs?: number;
  /**
   * Maximum delay between attempts in milliseconds.
   *
   * Defaults to `10000`.
   */
  maxDelayMs?: number;
  /**
   * Exponential backoff multiplier.
   *
   * Defaults to `2`.
   */
  backoffFactor?: number;
  /**
   * Enables full jitter by default. A numeric value between `0` and `1`
   * applies proportional jitter around the calculated backoff delay.
   */
  jitter?: boolean | number;
  /**
   * Honors `Retry-After` response headers when available.
   *
   * Defaults to `true`.
   */
  respectRetryAfter?: boolean;
  /** Status codes that should be retried for response-like results. */
  retryableStatusCodes?: readonly number[];
  /** Cancels pending delays and prevents subsequent attempts. */
  signal?: AbortSignal;
  /**
   * Receives retry events immediately before the retry delay begins.
   * Exceptions thrown by this callback are ignored.
   */
  onRetry?: (context: RetryContext<T>) => void;
  /**
   * Determines whether a failed operation should be retried. Returning `false`
   * prevents a retry even when the default policy considers it retryable.
   */
  shouldRetry?: (context: RetryContext<T>) => boolean | Promise<boolean>;
  /**
   * Determines whether a successful operation result represents a retryable
   * response. By default, values with a numeric `status` property are checked
   * against `retryableStatusCodes`.
   */
  shouldRetryResult?: (result: T) => boolean | Promise<boolean>;
  /**
   * Optional random number source, primarily useful for deterministic tests.
   * It must return a number in the range `[0, 1)`.
   */
  random?: () => number;
  /**
   * Optional delay implementation, primarily useful for deterministic tests.
   */
  sleep?: (durationMs: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Runs an asynchronous operation under the configured retry policy.
 *
 * The operation is retried for network-like failures and retryable HTTP
 * statuses when it returns a response-like value with a `status` property.
 * Abort errors and known configuration or validation failures are never
 * retried by the default policy.
 */
export async function retry<T>(
  operation: (context: RetryOperationContext) => Promise<T>,
  options: RetryOptions<T> = {},
): Promise<T> {
  const maxAttempts = resolveMaxAttempts(options);
  const signal = options.signal;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);

    try {
      const result = await operation({ attempt, maxAttempts, signal });
      const shouldRetryResult = options.shouldRetryResult ?? createDefaultResultRetryPredicate(options);
      const resultIsRetryable = await shouldRetryResult(result);

      if (!resultIsRetryable || attempt === maxAttempts) {
        return result;
      }

      const delayMs = calculateRetryDelay(
        attempt,
        getRetryAfterMs(result, options),
        options,
      );
      const context: RetryContext<T> = {
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        response: result,
        delayMs,
      };

      if (!(await shouldRetryContext(context, options))) {
        return result;
      }

      notifyRetry(options.onRetry, context);
      await (options.sleep ?? sleep)(delayMs, signal);
    } catch (error: unknown) {
      if (isAbortError(error) || signal?.aborted || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = calculateRetryDelay(attempt, getRetryAfterMs(error, options), options);
      const context: RetryContext<T> = {
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        error,
        delayMs,
      };

      if (!(await shouldRetryContext(context, options))) {
        throw error;
      }

      notifyRetry(options.onRetry, context);
      await (options.sleep ?? sleep)(delayMs, signal);
    }
  }

  throw new Error("Retry operation completed without returning a result.");
}

/**
 * Returns whether an HTTP status code is generally safe to retry.
 */
export function isRetryableStatus(
  status: number,
  retryableStatusCodes: readonly number[] = DEFAULT_RETRYABLE_STATUS_CODES,
): boolean {
  return retryableStatusCodes.includes(status);
}

/**
 * Extracts a `Retry-After` delay in milliseconds from a response-like value.
 * Both delta-seconds and HTTP-date forms are supported.
 */
export function getRetryAfterMs(
  value: unknown,
  options: Pick<RetryOptions, "respectRetryAfter" | "maxDelayMs"> = {},
): number | undefined {
  if (options.respectRetryAfter === false || !isResponseLike(value)) {
    return undefined;
  }

  const retryAfter = getHeader(value.headers, "retry-after");
  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);
  const rawDelayMs = Number.isFinite(seconds)
    ? Math.max(0, seconds * 1_000)
    : Math.max(0, Date.parse(retryAfter) - Date.now());

  if (!Number.isFinite(rawDelayMs)) {
    return undefined;
  }

  return Math.min(rawDelayMs, resolveMaxDelay(options));
}

function createDefaultResultRetryPredicate<T>(
  options: RetryOptions<T>,
): (result: T) => boolean {
  const retryableStatusCodes =
    options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;

  return (result: T): boolean =>
    isResponseLike(result) && isRetryableStatus(result.status, retryableStatusCodes);
}

async function shouldRetryContext<T>(
  context: RetryContext<T>,
  options: RetryOptions<T>,
): Promise<boolean> {
  if (options.shouldRetry) {
    return options.shouldRetry(context);
  }

  if (context.response !== undefined) {
    return true;
  }

  return isRetryableError(
    context.error,
    options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES,
  );
}

function isRetryableError(
  error: unknown,
  retryableStatusCodes: readonly number[],
): boolean {
  if (isAbortError(error) || !error || typeof error !== "object") {
    return false;
  }

  const status = getNumericProperty(error, "status");
  if (status !== undefined) {
    return isRetryableStatus(status, retryableStatusCodes);
  }

  const name = getStringProperty(error, "name");
  if (
    name === "ConfigurationError" ||
    name === "ValidationError" ||
    name === "AuthenticationError" ||
    name === "TimeoutError"
  ) {
    return false;
  }

  // Native fetch implementations conventionally reject network failures with
  // TypeError. Unknown errors are not retried to avoid masking programming bugs.
  return name === "TypeError" || name === "NetworkError";
}

function calculateRetryDelay(
  failedAttempt: number,
  retryAfterMs: number | undefined,
  options: Pick<
    RetryOptions,
    "baseDelayMs" | "initialDelayMs" | "maxDelayMs" | "backoffFactor" | "jitter" | "random"
  >,
): number {
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }

  const baseDelayMs = Math.max(0, options.baseDelayMs ?? options.initialDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = resolveMaxDelay(options);
  const backoffFactor = Math.max(1, options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR);
  const exponentialDelay = Math.min(
    maxDelayMs,
    baseDelayMs * Math.pow(backoffFactor, failedAttempt - 1),
  );

  if (options.jitter === false) {
    return Math.round(exponentialDelay);
  }

  const random = options.random ?? Math.random;
  const jitter = options.jitter;

  if (typeof jitter === "number") {
    const ratio = Math.min(1, Math.max(0, jitter));
    const offset = (random() * 2 - 1) * ratio * exponentialDelay;
    return Math.max(0, Math.round(exponentialDelay + offset));
  }

  return Math.round(random() * exponentialDelay);
}

function resolveMaxAttempts(options: Pick<RetryOptions, "maxAttempts" | "maxRetries">): number {
  const value =
    options.maxAttempts ??
    (options.maxRetries === undefined ? DEFAULT_MAX_ATTEMPTS : options.maxRetries + 1);

  return Math.max(1, Math.floor(value));
}

function resolveMaxDelay(options: Pick<RetryOptions, "maxDelayMs">): number {
  return Math.max(0, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
}

function isResponseLike(value: unknown): value is RetryableResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof getNumericProperty(value, "status") === "number"
  );
}

function getHeader(
  headers: Headers | Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const expectedName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === expectedName && value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function getNumericProperty(value: object, property: string): number | undefined {
  const candidate = Reflect.get(value, property);
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : undefined;
}

function getStringProperty(value: object, property: string): string | undefined {
  const candidate = Reflect.get(value, property);
  return typeof candidate === "string" ? candidate : undefined;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    getStringProperty(error, "name") === "AbortError"
  );
}

function notifyRetry<T>(
  callback: RetryOptions<T>["onRetry"],
  context: RetryContext<T>,
): void {
  try {
    callback?.(context);
  } catch {
    // Observability callbacks must not alter request behavior.
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  }
}

/**
 * Waits for a duration while respecting a caller-provided abort signal.
 */
export function sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
  if (durationMs <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);

    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);

    const onAbort = (): void => {
      clearTimeout(timeout);
      cleanup();
      const error = new Error("The retry delay was aborted.");
      error.name = "AbortError";
      reject(error);
    };

    const cleanup = (): void => {
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}