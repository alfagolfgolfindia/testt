/**
 * Error types exposed by the generated SDK.
 *
 * All errors extend {@link SdkError}, allowing callers to reliably distinguish
 * expected SDK failures from unrelated runtime exceptions.
 */

export type HttpHeaders = Readonly<Record<string, string>>;

/**
 * A normalized validation issue produced while validating request or response
 * data with a runtime schema.
 */
export interface ValidationIssue {
  /** Dot-separated location of the invalid value, when available. */
  readonly path: string;
  /** Human-readable validation failure message. */
  readonly message: string;
  /** Validation rule or issue code, when provided by the validator. */
  readonly code?: string;
}

/**
 * Shared options accepted by SDK error constructors.
 */
export interface SdkErrorOptions {
  /** The underlying runtime error, if one caused this error. */
  readonly cause?: unknown;
}

/**
 * Base class for all SDK-originated errors.
 */
export class SdkError extends Error {
  /** The underlying runtime error, if one caused this error. */
  readonly cause?: unknown;

  constructor(message: string, options: SdkErrorOptions = {}) {
    super(message);

    this.name = new.target.name;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * A normalized error response returned by the API.
 */
export interface ApiErrorOptions extends SdkErrorOptions {
  /** HTTP status code returned by the API. */
  readonly status: number;
  /** HTTP status text returned by the API or transport. */
  readonly statusText?: string;
  /** API-specific machine-readable error code, when available. */
  readonly code?: string;
  /** Request or correlation identifier returned by the API. */
  readonly requestId?: string;
  /** Response headers normalized into a plain object. */
  readonly headers?: HttpHeaders;
  /** Raw or parsed response body returned by the API. */
  readonly body?: unknown;
  /** Parsed API error details, when available. */
  readonly details?: unknown;
  /** Human-readable message. */
  readonly message?: string;
}

/**
 * Thrown when an API request completed with a non-success HTTP response.
 */
export class ApiError extends SdkError {
  /** HTTP status code returned by the API. */
  readonly status: number;
  /** HTTP status text returned by the API or transport. */
  readonly statusText: string;
  /** API-specific machine-readable error code, when available. */
  readonly code?: string;
  /** Request or correlation identifier returned by the API. */
  readonly requestId?: string;
  /** Response headers normalized into a plain object. */
  readonly headers: HttpHeaders;
  /** Raw or parsed response body returned by the API. */
  readonly body?: unknown;
  /** Parsed API error details, when available. */
  readonly details?: unknown;

  constructor(options: ApiErrorOptions) {
    const statusText = options.statusText ?? "";
    const message =
      options.message ??
      options.code ??
      (statusText
        ? `API request failed with status ${options.status}: ${statusText}`
        : `API request failed with status ${options.status}`);

    super(message, options);

    this.status = options.status;
    this.statusText = statusText;
    this.code = options.code;
    this.requestId = options.requestId;
    this.headers = options.headers ?? {};
    this.body = options.body;
    this.details = options.details;
  }
}

/**
 * Thrown when an API rejects credentials or the caller lacks permission.
 */
export class AuthenticationError extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Options for a rate-limit response.
 */
export interface RateLimitErrorOptions extends ApiErrorOptions {
  /**
   * Number of milliseconds callers should wait before retrying, when supplied
   * by a `Retry-After` or equivalent response header.
   */
  readonly retryAfterMs?: number;
}

/**
 * Thrown when the API responds with HTTP 429 or another rate-limit response.
 */
export class RateLimitError extends ApiError {
  /**
   * Number of milliseconds callers should wait before retrying, if known.
   */
  readonly retryAfterMs?: number;

  constructor(options: RateLimitErrorOptions) {
    super(options);
    this.name = "RateLimitError";
    this.retryAfterMs = options.retryAfterMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a request could not reach the API due to a transport failure.
 */
export class NetworkError extends SdkError {
  /** Request URL associated with the failed transport operation, if known. */
  readonly url?: string;
  /** HTTP method associated with the failed transport operation, if known. */
  readonly method?: string;

  constructor(
    message = "Network request failed",
    options: SdkErrorOptions & { readonly url?: string; readonly method?: string } = {},
  ) {
    super(message, options);

    this.url = options.url;
    this.method = options.method;
  }
}

/**
 * Thrown when a request exceeds its configured timeout.
 */
export class TimeoutError extends NetworkError {
  /** Configured timeout duration in milliseconds. */
  readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    options: SdkErrorOptions & { readonly url?: string; readonly method?: string } = {},
  ) {
    super(`Request timed out after ${timeoutMs}ms`, options);

    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when request data or response data fails runtime validation.
 */
export class ValidationError extends SdkError {
  /** Whether validation failed before sending or after receiving a request. */
  readonly direction: "request" | "response";
  /** API operation identifier associated with validation, when available. */
  readonly operationId?: string;
  /** Structured validation failures. */
  readonly issues: readonly ValidationIssue[];
  /** Invalid value, included only when safe and available. */
  readonly value?: unknown;

  constructor(options: {
    readonly message?: string;
    readonly direction: "request" | "response";
    readonly operationId?: string;
    readonly issues: readonly ValidationIssue[];
    readonly value?: unknown;
    readonly cause?: unknown;
  }) {
    super(
      options.message ??
        `${options.direction === "request" ? "Request" : "Response"} validation failed`,
      { cause: options.cause },
    );

    this.direction = options.direction;
    this.operationId = options.operationId;
    this.issues = options.issues;
    this.value = options.value;
  }
}

/**
 * Thrown when the SDK client is initialized or invoked with invalid settings.
 */
export class ConfigurationError extends SdkError {
  /** Name of the invalid configuration field, if applicable. */
  readonly field?: string;

  constructor(
    message: string,
    options: SdkErrorOptions & { readonly field?: string } = {},
  ) {
    super(message, options);
    this.field = options.field;
  }
}

/**
 * Union of all errors intentionally thrown by this SDK.
 */
export type SdkClientError =
  | ApiError
  | AuthenticationError
  | RateLimitError
  | NetworkError
  | TimeoutError
  | ValidationError
  | ConfigurationError;

/**
 * Returns whether a value is an error created by this SDK.
 */
export function isSdkError(error: unknown): error is SdkClientError {
  return error instanceof SdkError;
}

/**
 * Returns whether a value is a normalized API response error.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Converts a Headers instance into an immutable plain object suitable for
 * storing on normalized errors.
 */
export function normalizeHeaders(headers: Headers): HttpHeaders {
  const normalized: Record<string, string> = {};

  headers.forEach((value, key) => {
    normalized[key.toLowerCase()] = value;
  });

  return Object.freeze(normalized);
}