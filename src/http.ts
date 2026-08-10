import {
  ApiError,
  AuthenticationError,
  ConfigurationError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "./errors";

/**
 * A JSON-compatible value accepted by the transport when serializing request
 * bodies. Resource methods may use more specific generated types.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A fetch implementation compatible with Node.js 18+ and modern browsers. */
export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "TRACE";

export type ResponseType = "auto" | "json" | "text" | "arrayBuffer" | "stream" | "void";

export type QueryPrimitive = string | number | boolean | Date | null | undefined;
export type QueryValue =
  | QueryPrimitive
  | readonly QueryPrimitive[]
  | Readonly<Record<string, QueryPrimitive>>;

export type QueryParameters = Readonly<Record<string, QueryValue>>;

/**
 * A minimal compatible schema interface implemented by Zod schemas. Keeping
 * this structural avoids coupling the HTTP layer to Zod at runtime.
 */
export interface ResponseSchema<T> {
  parse(value: unknown): T;
}

export interface RetryOptions {
  /** Maximum total attempts, including the initial request. Defaults to 3. */
  maxAttempts?: number;
  /** Initial exponential backoff delay in milliseconds. Defaults to 250ms. */
  initialDelayMs?: number;
  /** Maximum delay between retry attempts in milliseconds. Defaults to 10 seconds. */
  maxDelayMs?: number;
  /** Random jitter applied to backoff delays. Defaults to true. */
  jitter?: boolean;
  /**
   * Retry unsafe methods such as POST and PATCH. This is disabled by default;
   * callers should only enable it when the API supports idempotency keys.
   */
  retryNonIdempotent?: boolean;
  /** Override the default retryable HTTP status determination. */
  shouldRetryStatus?: (status: number) => boolean;
}

export interface HttpRequestContext {
  readonly url: URL;
  readonly method: HttpMethod;
  readonly headers: Headers;
  readonly attempt: number;
  readonly signal?: AbortSignal;
}

export interface HttpResponseContext extends HttpRequestContext {
  readonly response: Response;
  readonly durationMs: number;
}

export interface HttpLogger {
  debug?(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  warn?(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  error?(message: string, metadata?: Readonly<Record<string, unknown>>): void;
}

export interface HttpClientOptions {
  /** API base URL. Relative request paths are resolved against this value. */
  baseUrl: string;
  /** A custom fetch implementation, useful for tests and specialized runtimes. */
  fetch?: FetchImplementation;
  /** Default headers included with every request. */
  headers?: HeadersInit;
  /** Default request timeout in milliseconds. Set to 0 to disable it. */
  timeoutMs?: number;
  /** Default retry behavior for individual requests. */
  retry?: RetryOptions | false;
  /** Optional hook invoked before each network attempt. */
  beforeRequest?: (
    context: HttpRequestContext,
  ) => void | Promise<void>;
  /** Optional hook invoked for each received HTTP response. */
  afterResponse?: (
    context: HttpResponseContext,
  ) => void | Promise<void>;
  /** Optional structured logger. Request bodies and sensitive headers are never logged. */
  logger?: HttpLogger;
  /** SDK name used for the default X-SDK-Name header when provided. */
  sdkName?: string;
  /** SDK version used for the default X-SDK-Version header when provided. */
  sdkVersion?: string;
}

export interface HttpRequestOptions<T> {
  method: HttpMethod;
  path: string;
  query?: QueryParameters;
  headers?: HeadersInit;
  /**
   * A pre-serialized body, including FormData, URLSearchParams, Blob, stream,
   * or ArrayBuffer. This is mutually exclusive with `json`.
   */
  body?: BodyInit | null;
  /** A JSON value serialized with JSON.stringify. */
  json?: JsonValue;
  responseType?: ResponseType;
  /** Runtime schema used when response validation is enabled for this operation. */
  responseSchema?: ResponseSchema<T>;
  /** Enable or disable runtime response validation for this request. */
  validateResponse?: boolean;
  /** Per-request timeout in milliseconds. Set to 0 to disable it. */
  timeoutMs?: number;
  /** Caller cancellation signal. */
  signal?: AbortSignal;
  /** Per-request retry behavior. */
  retry?: RetryOptions | false;
  /**
   * Allows a resource method to classify this request as safely retryable even
   * if it uses a non-idempotent HTTP method, for example with an idempotency key.
   */
  idempotent?: boolean;
}

export interface HttpResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly requestId?: string;
}

/**
 * Fetch-based HTTP transport used by generated resources. It centralizes
 * timeout handling, retries, response parsing, lifecycle hooks, and normalized
 * API errors while leaving endpoint-specific typing to resource methods.
 */
export class HttpClient {
  private readonly baseUrl: URL;
  private readonly fetchImplementation: FetchImplementation;
  private readonly defaultHeaders: Headers;
  private readonly defaultTimeoutMs: number;
  private readonly defaultRetry: RetryOptions | false;
  private readonly beforeRequest?: HttpClientOptions["beforeRequest"];
  private readonly afterResponse?: HttpClientOptions["afterResponse"];
  private readonly logger?: HttpLogger;

  public constructor(options: HttpClientOptions) {
    try {
      this.baseUrl = new URL(options.baseUrl);
    } catch {
      throw new ConfigurationError({
        message: "baseUrl must be a valid absolute URL.",
      });
    }

    if (this.baseUrl.protocol !== "http:" && this.baseUrl.protocol !== "https:") {
      throw new ConfigurationError({
        message: "baseUrl must use the http or https protocol.",
      });
    }

    const implementation = options.fetch ?? globalThis.fetch;
    if (typeof implementation !== "function") {
      throw new ConfigurationError({
        message:
          "No fetch implementation is available. Provide one through the client configuration.",
      });
    }

    this.fetchImplementation = implementation.bind(globalThis);
    this.defaultHeaders = new Headers(options.headers);
    this.defaultTimeoutMs = normalizeTimeout(options.timeoutMs, 30_000);
    this.defaultRetry = options.retry ?? {};
    this.beforeRequest = options.beforeRequest;
    this.afterResponse = options.afterResponse;
    this.logger = options.logger;

    if (options.sdkName && !this.defaultHeaders.has("X-SDK-Name")) {
      this.defaultHeaders.set("X-SDK-Name", options.sdkName);
    }
    if (options.sdkVersion && !this.defaultHeaders.has("X-SDK-Version")) {
      this.defaultHeaders.set("X-SDK-Version", options.sdkVersion);
    }
  }

  /**
   * Executes a typed HTTP request. Resource classes should use this method
   * rather than calling fetch directly.
   */
  public async request<T>(options: HttpRequestOptions<T>): Promise<HttpResponse<T>> {
    if (options.body !== undefined && options.json !== undefined) {
      throw new ConfigurationError({
        message: "Only one of request body or json may be provided.",
      });
    }

    const url = this.createUrl(options.path, options.query);
    const headers = new Headers(this.defaultHeaders);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));

    let body = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    }

    const retry = options.retry === undefined ? this.defaultRetry : options.retry;
    const maxAttempts = retry === false ? 1 : normalizeAttempts(retry.maxAttempts);
    const retryAllowed =
      options.idempotent === true ||
      isIdempotentMethod(options.method) ||
      retry?.retryNonIdempotent === true;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const timeoutMs = normalizeTimeout(options.timeoutMs, this.defaultTimeoutMs);
      const abort = createAbortContext(options.signal, timeoutMs);
      const startedAt = Date.now();
      const context: HttpRequestContext = {
        url,
        method: options.method,
        headers,
        attempt,
        signal: abort.signal,
      };

      try {
        await this.beforeRequest?.(context);

        this.logger?.debug?.("SDK request started.", {
          method: options.method,
          url: url.toString(),
          attempt,
        });

        const response = await this.fetchImplementation(url, {
          method: options.method,
          headers,
          body,
          signal: abort.signal,
        });

        const durationMs = Date.now() - startedAt;
        await this.afterResponse?.({ ...context, response, durationMs });

        this.logger?.debug?.("SDK request completed.", {
          method: options.method,
          url: url.toString(),
          status: response.status,
          durationMs,
          attempt,
        });

        if (
          !response.ok &&
          retryAllowed &&
          attempt < maxAttempts &&
          shouldRetryResponse(response.status, retry)
        ) {
          const delayMs = getRetryDelay(response, attempt, retry);
          await discardResponseBody(response);
          this.logger?.warn?.("Retrying SDK request after retryable response.", {
            method: options.method,
            url: url.toString(),
            status: response.status,
            attempt,
            delayMs,
          });
          await sleep(delayMs, options.signal);
          continue;
        }

        if (!response.ok) {
          throw await toApiError(response);
        }

        const data = await parseResponse<T>(response, options.responseType ?? "auto");
        if (options.validateResponse && options.responseSchema) {
          try {
            const validated = options.responseSchema.parse(data);
            return createHttpResponse(validated, response);
          } catch (cause: unknown) {
            throw new ValidationError({
              message: "The API response did not match the documented response schema.",
              details: cause,
            });
          }
        }

        return createHttpResponse(data, response);
      } catch (cause: unknown) {
        if (cause instanceof ApiError || cause instanceof ValidationError) {
          throw cause;
        }

        if (abort.timedOut) {
          throw new TimeoutError({
            message: `The request timed out after ${timeoutMs}ms.`,
            cause,
          });
        }

        if (isAbortError(cause) || options.signal?.aborted) {
          throw cause;
        }

        const mayRetry =
          retryAllowed &&
          retry !== false &&
          attempt < maxAttempts &&
          isNetworkFailure(cause);

        if (mayRetry) {
          const delayMs = getBackoffDelay(attempt, retry);
          this.logger?.warn?.("Retrying SDK request after network failure.", {
            method: options.method,
            url: url.toString(),
            attempt,
            delayMs,
          });
          await sleep(delayMs, options.signal);
          continue;
        }

        throw new NetworkError({
          message: "The request could not be completed due to a network failure.",
          cause,
        });
      } finally {
        abort.dispose();
      }
    }

    throw new NetworkError({
      message: "The request could not be completed after all retry attempts.",
    });
  }

  private createUrl(path: string, query?: QueryParameters): URL {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const basePath = this.baseUrl.pathname.endsWith("/")
      ? this.baseUrl.pathname
      : `${this.baseUrl.pathname}/`;
    const url = new URL(normalizedPath, `${this.baseUrl.origin}${basePath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        appendQueryValue(url.searchParams, key, value);
      }
    }

    return url;
  }
}

function createHttpResponse<T>(data: T, response: Response): HttpResponse<T> {
  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    requestId: getRequestId(response.headers),
  };
}

async function parseResponse<T>(response: Response, responseType: ResponseType): Promise<T> {
  const type = responseType === "auto" ? inferResponseType(response) : responseType;

  if (type === "void") {
    return undefined as T;
  }

  if (type === "stream") {
    return response.body as T;
  }

  if (type === "arrayBuffer") {
    return (await response.arrayBuffer()) as T;
  }

  if (type === "text") {
    return (await response.text()) as T;
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (cause: unknown) {
    throw new ValidationError({
      message: "The API returned an invalid JSON response.",
      details: cause,
    });
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const rawBody = await response.text();
  const parsedBody = parseErrorBody(rawBody);
  const message = getErrorMessage(parsedBody, response.statusText);
  const details = getErrorDetails(parsedBody);
  const code = getErrorCode(parsedBody);

  const errorDetails = {
    status: response.status,
    statusText: response.statusText,
    code,
    message,
    requestId: getRequestId(response.headers),
    headers: headersToRecord(response.headers),
    responseBody: rawBody,
    details,
  };

  if (response.status === 401 || response.status === 403) {
    return new AuthenticationError(errorDetails);
  }

  if (response.status === 429) {
    return new RateLimitError(errorDetails);
  }

  return new ApiError(errorDetails);
}

function inferResponseType(response: Response): ResponseType {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (
    contentType.includes("application/json") ||
    contentType.includes("+json") ||
    contentType.includes("application/problem+json")
  ) {
    return "json";
  }

  if (
    contentType.startsWith("text/") ||
    contentType.includes("application/xml") ||
    contentType.includes("application/javascript")
  ) {
    return "text";
  }

  return "arrayBuffer";
}

function appendQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: QueryValue,
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (value instanceof Date) {
    searchParams.append(key, value.toISOString());
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== undefined && item !== null) {
        searchParams.append(key, serializeQueryPrimitive(item));
      }
    }
    return;
  }

  if (typeof value === "object") {
    for (const [property, propertyValue] of Object.entries(value)) {
      if (propertyValue !== undefined && propertyValue !== null) {
        searchParams.append(`${key}[${property}]`, serializeQueryPrimitive(propertyValue));
      }
    }
    return;
  }

  searchParams.append(key, serializeQueryPrimitive(value));
}

function serializeQueryPrimitive(value: Exclude<QueryPrimitive, null | undefined>): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function shouldRetryResponse(status: number, options: RetryOptions | false): boolean {
  if (options !== false && options.shouldRetryStatus) {
    return options.shouldRetryStatus(status);
  }

  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getRetryDelay(response: Response, attempt: number, options: RetryOptions | false): number {
  const retryAfter = response.headers.get("retry-after");
  const parsedRetryAfter = retryAfter ? parseRetryAfter(retryAfter) : undefined;
  return parsedRetryAfter ?? getBackoffDelay(attempt, options);
}

function parseRetryAfter(value: string): number | undefined {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

function getBackoffDelay(attempt: number, options: RetryOptions | false): number {
  const config = options === false ? {} : options;
  const initialDelay = config.initialDelayMs ?? 250;
  const maximumDelay = config.maxDelayMs ?? 10_000;
  const unjittered = Math.min(maximumDelay, initialDelay * 2 ** Math.max(0, attempt - 1));

  return config.jitter === false ? unjittered : Math.floor(unjittered * (0.5 + Math.random() * 0.5));
}

function normalizeAttempts(value: number | undefined): number {
  if (value === undefined) {
    return 3;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function isIdempotentMethod(method: HttpMethod): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS" || method === "PUT" || method === "DELETE";
}

function isNetworkFailure(cause: unknown): boolean {
  return cause instanceof TypeError || cause instanceof DOMException;
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError";
}

function createAbortContext(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal | undefined; timedOut: boolean; dispose: () => void } {
  if (!externalSignal && timeoutMs <= 0) {
    return { signal: undefined, timedOut: false, dispose: () => undefined };
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const abortFromCaller = (): void => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });

  if (externalSignal?.aborted) {
    abortFromCaller();
  }

  if (timeoutMs > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("Request timed out.", "TimeoutError"));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    get timedOut(): boolean {
      return timedOut;
    },
    dispose: (): void => {
      if (timeout) {
        clearTimeout(timeout);
      }
      externalSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

async function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(cleanupAndResolve, delayMs);

    const onAbort = (): void => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Request aborted.", "AbortError"));
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    const cleanupAndResolve = (): void => {
      cleanup();
      resolve();
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A response body may already be locked or consumed; there is nothing else to do.
  }
}

function headersToRecord(headers: Headers): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function getRequestId(headers: Headers): string | undefined {
  return (
    headers.get("x-request-id") ??
    headers.get("x-correlation-id") ??
    headers.get("request-id") ??
    undefined
  );
}

function parseErrorBody(body: string): unknown {
  if (body.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body)) {
    const nestedError = isRecord(body.error) ? body.error : undefined;
    const candidate =
      nestedError?.message ??
      body.message ??
      nestedError?.detail ??
      body.detail ??
      body.title;

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return fallback || "The API request failed.";
}

function getErrorCode(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const nestedError = isRecord(body.error) ? body.error : undefined;
  const candidate = nestedError?.code ?? body.code ?? body.errorCode;

  return typeof candidate === "string" ? candidate : undefined;
}

function getErrorDetails(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }

  const nestedError = isRecord(body.error) ? body.error : undefined;
  return nestedError?.details ?? body.details ?? body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}