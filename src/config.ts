import { ConfigurationError } from "./errors";

/**
 * A fetch implementation compatible with Node.js 18+ and modern browsers.
 * Inject a custom implementation when using specialized runtimes or tests.
 */
export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Supported HTTP methods for request-level SDK options. */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/** A normalized collection of HTTP headers. */
export type HeaderMap = Record<string, string>;

/**
 * Authentication credentials applied by the SDK.
 *
 * Credentials are intentionally supplied at runtime and are never persisted by
 * the generated SDK. For OAuth2, use a token provider callback so token
 * acquisition and refresh remain under application control.
 */
export type AuthConfig =
  | {
      type: "none";
    }
  | {
      type: "bearer";
      token: string;
      headerName?: string;
    }
  | {
      type: "apiKey";
      apiKey: string;
      name: string;
      in: "header" | "query";
    }
  | {
      type: "basic";
      username: string;
      password: string;
    }
  | {
      type: "oauth2";
      tokenProvider: TokenProvider;
      headerName?: string;
    }
  | {
      type: "custom";
      headers: HeadersInit;
    };

/**
 * Context provided to an OAuth token provider before a request is sent.
 */
export interface TokenProviderContext {
  /** HTTP method for the pending request. */
  readonly method: HttpMethod;
  /** Fully resolved request URL. */
  readonly url: string;
  /** Abort signal associated with the request, if one was supplied. */
  readonly signal?: AbortSignal;
}

/**
 * Resolves an OAuth access token immediately before a request is sent.
 *
 * The provider may refresh an expired token. It must return a non-empty token
 * string and must not expose credentials in logs or thrown error messages.
 */
export type TokenProvider = (
  context: TokenProviderContext,
) => Promise<string> | string;

/**
 * Retry settings for transient network and HTTP failures.
 *
 * Retries are enabled for idempotent methods by default. Unsafe methods require
 * explicit opt-in through `retryUnsafeMethods`.
 */
export interface RetryConfig {
  /** Enables retries. Defaults to `true`. */
  enabled?: boolean;
  /**
   * Maximum total attempts, including the initial request. Defaults to `3`.
   * Set to `1` to disable retry attempts while retaining retry configuration.
   */
  maxAttempts?: number;
  /** Initial exponential-backoff delay in milliseconds. Defaults to `250`. */
  baseDelayMs?: number;
  /** Maximum backoff delay in milliseconds. Defaults to `10_000`. */
  maxDelayMs?: number;
  /**
   * Random jitter fraction from `0` through `1`. Defaults to `0.2`.
   * A value of `0` disables jitter.
   */
  jitter?: number;
  /**
   * Honor valid `Retry-After` response headers. Defaults to `true`.
   * Server-provided delays are capped by `maxDelayMs`.
   */
  respectRetryAfter?: boolean;
  /**
   * Allow automatic retries for POST, PATCH, and other unsafe methods.
   * Defaults to `false`.
   */
  retryUnsafeMethods?: boolean;
  /**
   * Additional retryable HTTP status codes. Standard retryable statuses are
   * 408, 429, 500, 502, 503, and 504.
   */
  retryStatusCodes?: readonly number[];
}

/**
 * A request hook invoked after request data has been serialized but before
 * fetch is called. Hooks can modify headers and may be asynchronous.
 */
export type RequestHook = (
  context: RequestHookContext,
) => void | Promise<void>;

/** Information exposed to request hooks. */
export interface RequestHookContext {
  readonly method: HttpMethod;
  readonly url: URL;
  readonly headers: Headers;
  readonly signal?: AbortSignal;
  readonly operationId?: string;
}

/**
 * A response hook invoked for every received HTTP response before response
 * parsing. Hooks are not called for transport failures.
 */
export type ResponseHook = (
  context: ResponseHookContext,
) => void | Promise<void>;

/** Information exposed to response hooks. */
export interface ResponseHookContext {
  readonly method: HttpMethod;
  readonly url: URL;
  readonly response: Response;
  readonly operationId?: string;
}

/** Log levels emitted by optional SDK logging hooks. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured SDK diagnostic event. */
export interface LogEvent {
  readonly level: LogLevel;
  readonly message: string;
  readonly operationId?: string;
  readonly method?: HttpMethod;
  readonly url?: string;
  readonly status?: number;
  readonly attempt?: number;
  readonly error?: Error;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Optional logging callback. Never receives authorization header values. */
export type Logger = (event: LogEvent) => void;

/**
 * Per-request options shared by generated resource methods.
 */
export interface RequestOptions {
  /** Additional headers merged after client-level headers. */
  headers?: HeadersInit;
  /** Cancels this request when aborted. */
  signal?: AbortSignal;
  /** Overrides the configured timeout for this request in milliseconds. */
  timeoutMs?: number;
  /** Overrides the client authentication strategy for this request. */
  auth?: AuthConfig;
  /** Overrides retry behavior for this request. */
  retry?: boolean | RetryConfig;
  /** Optional operation-specific metadata for hooks and logging. */
  operationId?: string;
}

/**
 * Public client configuration.
 */
export interface ClientConfig {
  /**
   * API server base URL. Relative operation paths are resolved against this URL.
   * A trailing slash is normalized away.
   */
  baseUrl: string;
  /** Default authentication credentials. */
  auth?: AuthConfig;
  /**
   * Convenience bearer token configuration. `auth` takes precedence when both
   * are supplied.
   */
  bearerToken?: string;
  /**
   * Convenience API-key configuration. `auth` takes precedence when both are
   * supplied.
   */
  apiKey?: string;
  /**
   * Header name used with the convenience `apiKey` option.
   * Defaults to `Authorization`.
   */
  apiKeyHeader?: string;
  /** Headers included with every request. */
  headers?: HeadersInit;
  /** Custom fetch implementation, useful for tests and nonstandard runtimes. */
  fetch?: FetchImplementation;
  /**
   * Default request timeout in milliseconds. Set to `0` to disable SDK-managed
   * timeouts. Defaults to `30_000`.
   */
  timeoutMs?: number;
  /** Enables runtime validation of generated request schemas. Defaults to false. */
  validateRequests?: boolean;
  /**
   * Enables runtime validation of generated response schemas. Defaults to true.
   * Disable only when performance is more important than contract enforcement.
   */
  validateResponses?: boolean;
  /** Retry configuration. Defaults to idempotent retries with three attempts. */
  retry?: boolean | RetryConfig;
  /** Request lifecycle hooks. */
  requestHooks?: readonly RequestHook[];
  /** Response lifecycle hooks. */
  responseHooks?: readonly ResponseHook[];
  /** Optional structured logger. */
  logger?: Logger;
  /**
   * Application-specific user agent suffix. Browser environments may prohibit
   * setting `User-Agent`; the transport safely ignores it where unsupported.
   */
  userAgent?: string;
  /** SDK metadata headers can be disabled for restrictive APIs. Defaults to true. */
  sendSdkMetadata?: boolean;
}

/**
 * Fully normalized client configuration used internally by the transport.
 */
export interface ResolvedClientConfig {
  readonly baseUrl: string;
  readonly auth: AuthConfig;
  readonly headers: HeaderMap;
  readonly fetch: FetchImplementation;
  readonly timeoutMs: number;
  readonly validateRequests: boolean;
  readonly validateResponses: boolean;
  readonly retry: ResolvedRetryConfig;
  readonly requestHooks: readonly RequestHook[];
  readonly responseHooks: readonly ResponseHook[];
  readonly logger?: Logger;
  readonly userAgent?: string;
  readonly sendSdkMetadata: boolean;
}

/** Fully normalized retry settings used by the retry utility. */
export interface ResolvedRetryConfig {
  readonly enabled: boolean;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitter: number;
  readonly respectRetryAfter: boolean;
  readonly retryUnsafeMethods: boolean;
  readonly retryStatusCodes: readonly number[];
}

const DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504] as const;

const DEFAULT_RETRY_CONFIG: ResolvedRetryConfig = {
  enabled: true,
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 10_000,
  jitter: 0.2,
  respectRetryAfter: true,
  retryUnsafeMethods: false,
  retryStatusCodes: DEFAULT_RETRY_STATUS_CODES,
};

/**
 * Validates and resolves public client configuration into immutable transport
 * settings. This function performs no network I/O.
 *
 * @throws {ConfigurationError} When required or unsafe configuration is used.
 */
export function resolveClientConfig(config: ClientConfig): ResolvedClientConfig {
  if (!config || typeof config !== "object") {
    throw new ConfigurationError("A client configuration object is required.");
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const timeoutMs = config.timeoutMs ?? 30_000;

  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new ConfigurationError(
      "`timeoutMs` must be a finite number greater than or equal to zero.",
    );
  }

  const fetchImplementation = config.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new ConfigurationError(
      "No fetch implementation is available. Provide `fetch` in the client configuration.",
    );
  }

  return {
    baseUrl,
    auth: resolveAuthConfig(config),
    headers: headersToRecord(config.headers),
    fetch: fetchImplementation,
    timeoutMs,
    validateRequests: config.validateRequests ?? false,
    validateResponses: config.validateResponses ?? true,
    retry: resolveRetryConfig(config.retry),
    requestHooks: config.requestHooks ?? [],
    responseHooks: config.responseHooks ?? [],
    logger: config.logger,
    userAgent: normalizeOptionalString(config.userAgent, "userAgent"),
    sendSdkMetadata: config.sendSdkMetadata ?? true,
  };
}

/**
 * Resolves retry settings. `false` disables all retry attempts.
 *
 * @throws {ConfigurationError} When a retry option is invalid.
 */
export function resolveRetryConfig(
  config?: boolean | RetryConfig,
): ResolvedRetryConfig {
  if (config === false) {
    return { ...DEFAULT_RETRY_CONFIG, enabled: false, maxAttempts: 1 };
  }

  if (config === true || config === undefined) {
    return { ...DEFAULT_RETRY_CONFIG };
  }

  const maxAttempts = config.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts;
  const baseDelayMs = config.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs;
  const maxDelayMs = config.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs;
  const jitter = config.jitter ?? DEFAULT_RETRY_CONFIG.jitter;

  assertFiniteInteger("retry.maxAttempts", maxAttempts, 1);
  assertFiniteNumber("retry.baseDelayMs", baseDelayMs, 0);
  assertFiniteNumber("retry.maxDelayMs", maxDelayMs, 0);
  assertFiniteNumber("retry.jitter", jitter, 0, 1);

  if (maxDelayMs < baseDelayMs) {
    throw new ConfigurationError(
      "`retry.maxDelayMs` must be greater than or equal to `retry.baseDelayMs`.",
    );
  }

  const statusCodes = config.retryStatusCodes ?? DEFAULT_RETRY_STATUS_CODES;
  for (const status of statusCodes) {
    assertFiniteInteger("retry.retryStatusCodes[]", status, 100, 599);
  }

  return {
    enabled: config.enabled ?? true,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    jitter,
    respectRetryAfter:
      config.respectRetryAfter ?? DEFAULT_RETRY_CONFIG.respectRetryAfter,
    retryUnsafeMethods:
      config.retryUnsafeMethods ?? DEFAULT_RETRY_CONFIG.retryUnsafeMethods,
    retryStatusCodes: [...statusCodes],
  };
}

/**
 * Converts `HeadersInit` into a plain lowercase-keyed record suitable for safe
 * merging by the HTTP transport.
 */
export function headersToRecord(headers?: HeadersInit): HeaderMap {
  if (!headers) {
    return {};
  }

  const result: HeaderMap = {};
  const normalized = new Headers(headers);

  normalized.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });

  return result;
}

/**
 * Merges header sources case-insensitively. Sources later in the argument list
 * take precedence over earlier sources.
 */
export function mergeHeaders(...sources: ReadonlyArray<HeadersInit | undefined>): Headers {
  const merged = new Headers();

  for (const source of sources) {
    if (!source) {
      continue;
    }

    new Headers(source).forEach((value, key) => {
      merged.set(key, value);
    });
  }

  return merged;
}

function resolveAuthConfig(config: ClientConfig): AuthConfig {
  if (config.auth) {
    validateAuthConfig(config.auth);
    return config.auth;
  }

  if (config.bearerToken !== undefined) {
    if (config.bearerToken.trim().length === 0) {
      throw new ConfigurationError("`bearerToken` cannot be empty.");
    }

    return { type: "bearer", token: config.bearerToken };
  }

  if (config.apiKey !== undefined) {
    if (config.apiKey.trim().length === 0) {
      throw new ConfigurationError("`apiKey` cannot be empty.");
    }

    const headerName = config.apiKeyHeader ?? "Authorization";
    if (headerName.trim().length === 0) {
      throw new ConfigurationError("`apiKeyHeader` cannot be empty.");
    }

    return {
      type: "apiKey",
      apiKey: config.apiKey,
      name: headerName,
      in: "header",
    };
  }

  return { type: "none" };
}

function validateAuthConfig(auth: AuthConfig): void {
  switch (auth.type) {
    case "none":
      return;
    case "bearer":
      if (auth.token.trim().length === 0) {
        throw new ConfigurationError("Bearer token cannot be empty.");
      }
      return;
    case "apiKey":
      if (auth.apiKey.trim().length === 0 || auth.name.trim().length === 0) {
        throw new ConfigurationError(
          "API key authentication requires non-empty `apiKey` and `name` values.",
        );
      }
      return;
    case "basic":
      if (auth.username.length === 0) {
        throw new ConfigurationError(
          "Basic authentication requires a non-empty username.",
        );
      }
      return;
    case "oauth2":
      if (typeof auth.tokenProvider !== "function") {
        throw new ConfigurationError(
          "OAuth2 authentication requires a tokenProvider function.",
        );
      }
      return;
    case "custom":
      return;
  }
}

function normalizeBaseUrl(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConfigurationError("`baseUrl` must be a non-empty absolute URL.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError("`baseUrl` must be a valid absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigurationError("`baseUrl` must use the http or https protocol.");
  }

  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeOptionalString(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConfigurationError(`\`${name}\` must be a non-empty string.`);
  }

  return value.trim();
}

function assertFiniteNumber(
  name: string,
  value: number,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ConfigurationError(
      `\`${name}\` must be a finite number between ${minimum} and ${maximum}.`,
    );
  }
}

function assertFiniteInteger(
  name: string,
  value: number,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ConfigurationError(
      `\`${name}\` must be an integer between ${minimum} and ${maximum}.`,
    );
  }
}