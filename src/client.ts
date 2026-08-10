/**
 * Fetch-based client foundation for generated SDK resources.
 *
 * Generated resource classes should extend `BaseResource` and call
 * `this.request<T>()` with their operation metadata.
 */

/** A fetch implementation compatible with Node.js 18+ and modern browsers. */
export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string | (() => string | Promise<string>) }
  | {
      type: "apiKey";
      name: string;
      value: string | (() => string | Promise<string>);
      in: "header" | "query";
    }
  | {
      type: "basic";
      username: string | (() => string | Promise<string>);
      password: string | (() => string | Promise<string>);
    }
  | {
      type: "oauth2";
      getAccessToken: () => string | Promise<string | undefined> | undefined;
    }
  | { type: "custom"; apply: (request: MutableRequest) => void | Promise<void> };

export interface RetryConfig {
  /** Maximum number of attempts, including the first request. Default: 3. */
  maxAttempts?: number;
  /** Initial retry delay in milliseconds. Default: 250. */
  initialDelayMs?: number;
  /** Maximum retry delay in milliseconds. Default: 10,000. */
  maxDelayMs?: number;
  /** Exponential backoff multiplier. Default: 2. */
  multiplier?: number;
  /** Whether random jitter is added to retry delays. Default: true. */
  jitter?: boolean;
  /**
   * Allows retries for unsafe HTTP methods. Disabled by default to avoid
   * accidentally replaying non-idempotent mutations.
   */
  retryUnsafeMethods?: boolean;
}

export interface Logger {
  debug?(message: string, metadata?: Record<string, unknown>): void;
  warn?(message: string, metadata?: Record<string, unknown>): void;
  error?(message: string, metadata?: Record<string, unknown>): void;
}

export interface RequestContext {
  method: string;
  url: string;
  headers: Headers;
  attempt: number;
  operationId?: string;
}

export interface ResponseContext extends RequestContext {
  response: Response;
  durationMs: number;
}

export interface MutableRequest {
  url: URL;
  method: string;
  headers: Headers;
  body?: BodyInit | null;
}

export interface ClientConfig {
  /**
   * API server URL. A generated SDK may set an API-specific default, but users
   * can always override it at initialization time.
   */
  baseUrl: string;
  auth?: AuthConfig;
  fetch?: FetchImplementation;
  headers?: HeadersInit;
  timeoutMs?: number;
  retry?: RetryConfig | false;
  validateRequests?: boolean;
  validateResponses?: boolean;
  logger?: Logger;
  onRequest?: (context: RequestContext) => void | Promise<void>;
  onResponse?: (context: ResponseContext) => void | Promise<void>;
  userAgent?: string;
}

export interface RequestOptions<TBody = unknown> {
  method?: string;
  path?: Record<string, string | number | boolean>;
  query?: QueryParameters;
  headers?: HeadersInit;
  body?: TBody;
  contentType?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  auth?: AuthConfig;
  retry?: RetryConfig | false;
  operationId?: string;
  /**
   * Parses a successful response. If omitted, JSON is parsed for JSON content
   * types and `undefined` is returned for empty responses.
   */
  parseAs?: ResponseParser;
  /**
   * Request validation hook generated from the operation's Zod schema.
   * It is executed only when `validateRequests` is enabled.
   */
  validateRequest?: (value: TBody) => TBody;
  /**
   * Response validation hook generated from the operation's Zod schema.
   * It is executed only when `validateResponses` is enabled.
   */
  validateResponse?: (value: unknown) => unknown;
}

export type ResponseParser =
  | "auto"
  | "json"
  | "text"
  | "blob"
  | "arrayBuffer"
  | "stream"
  | "void";

export type QueryValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | readonly (string | number | boolean | Date | null | undefined)[]
  | Record<string, unknown>;

export type QueryParameters = Record<string, QueryValue>;

export interface ApiResponse<T> {
  data: T;
  response: Response;
  headers: Headers;
  status: number;
}

export class ConfigurationError extends Error {
  public readonly name = "ConfigurationError";

  public constructor(message: string) {
    super(message);
  }
}

export class NetworkError extends Error {
  public readonly name = "NetworkError";
  public readonly cause?: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export class TimeoutError extends Error {
  public readonly name = "TimeoutError";

  public constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
  }
}

export class ValidationError extends Error {
  public readonly name = "ValidationError";

  public constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class ApiError extends Error {
  public readonly name = "ApiError";

  public constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly headers: Headers,
    public readonly body?: unknown,
    public readonly code?: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class AuthenticationError extends ApiError {
  public readonly name = "AuthenticationError";
}

export class RateLimitError extends ApiError {
  public readonly name = "RateLimitError";

  public constructor(
    message: string,
    status: number,
    statusText: string,
    headers: Headers,
    body?: unknown,
    code?: string,
    requestId?: string,
    details?: unknown,
    public readonly retryAfterMs?: number,
  ) {
    super(
      message,
      status,
      statusText,
      headers,
      body,
      code,
      requestId,
      details,
    );
  }
}

/**
 * Root client for generated SDKs. Generated resource classes may be assigned
 * as properties by a concrete API-specific client:
 *
 * ```ts
 * export class ExampleApiClient extends ApiClient {
 *   public readonly users = new UsersResource(this);
 * }
 * ```
 */
export class ApiClient {
  public readonly baseUrl: string;
  public readonly validateRequests: boolean;
  public readonly validateResponses: boolean;

  private readonly fetchImplementation: FetchImplementation;
  private readonly defaultHeaders: Headers;
  private readonly defaultAuth: AuthConfig;
  private readonly defaultTimeoutMs?: number;
  private readonly defaultRetry: RetryConfig | false;
  private readonly logger?: Logger;
  private readonly onRequest?: ClientConfig["onRequest"];
  private readonly onResponse?: ClientConfig["onResponse"];

  public constructor(config: ClientConfig) {
    if (!config.baseUrl || typeof config.baseUrl !== "string") {
      throw new ConfigurationError("`baseUrl` must be a non-empty URL.");
    }

    try {
      this.baseUrl = normalizeBaseUrl(config.baseUrl);
    } catch {
      throw new ConfigurationError("`baseUrl` must be a valid absolute URL.");
    }

    const runtimeFetch = globalThis.fetch;
    if (!config.fetch && typeof runtimeFetch !== "function") {
      throw new ConfigurationError(
        "No fetch implementation is available. Provide `config.fetch` for this runtime.",
      );
    }

    this.fetchImplementation = config.fetch ?? runtimeFetch.bind(globalThis);
    this.defaultHeaders = new Headers(config.headers);
    this.defaultAuth = config.auth ?? { type: "none" };
    this.defaultTimeoutMs = validateTimeout(config.timeoutMs);
    this.defaultRetry = normalizeRetryConfig(config.retry);
    this.validateRequests = config.validateRequests ?? false;
    this.validateResponses = config.validateResponses ?? false;
    this.logger = config.logger;
    this.onRequest = config.onRequest;
    this.onResponse = config.onResponse;

    if (config.userAgent) {
      this.defaultHeaders.set("User-Agent", config.userAgent);
    }
  }

  /**
   * Execute an API operation and return its parsed response body.
   */
  public async request<TResponse, TBody = unknown>(
    path: string,
    options: RequestOptions<TBody> = {},
  ): Promise<TResponse> {
    const result = await this.requestWithResponse<TResponse, TBody>(
      path,
      options,
    );
    return result.data;
  }

  /**
   * Execute an API operation and return both parsed data and raw response
   * metadata. This is useful for custom headers, pagination links, and status
   * inspection.
   */
  public async requestWithResponse<TResponse, TBody = unknown>(
    path: string,
    options: RequestOptions<TBody> = {},
  ): Promise<ApiResponse<TResponse>> {
    const method = (options.method ?? "GET").toUpperCase();
    const requestBody = this.validateRequestBody(options);
    const retry = options.retry === undefined
      ? this.defaultRetry
      : normalizeRetryConfig(options.retry);
    const maxAttempts = retry === false ? 1 : retry.maxAttempts;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      throwIfAborted(options.signal);

      const mutableRequest = await this.createRequest(
        path,
        method,
        requestBody,
        options,
      );
      const requestContext: RequestContext = {
        method,
        url: mutableRequest.url.toString(),
        headers: mutableRequest.headers,
        attempt,
        operationId: options.operationId,
      };

      try {
        await this.onRequest?.(requestContext);
        this.logger?.debug?.("SDK request started.", {
          method,
          url: redactUrl(mutableRequest.url),
          attempt,
          operationId: options.operationId,
        });

        const startedAt = Date.now();
        const response = await this.fetchWithTimeout(
          mutableRequest,
          options.signal,
          options.timeoutMs,
        );
        const responseContext: ResponseContext = {
          ...requestContext,
          response,
          durationMs: Date.now() - startedAt,
        };

        await this.onResponse?.(responseContext);

        if (response.ok) {
          const data = await parseResponse<TResponse>(
            response,
            options.parseAs ?? "auto",
          );

          const validated = this.validateResponseBody(data, options);
          this.logger?.debug?.("SDK request completed.", {
            method,
            url: redactUrl(mutableRequest.url),
            status: response.status,
            durationMs: responseContext.durationMs,
          });

          return {
            data: validated,
            response,
            headers: response.headers,
            status: response.status,
          };
        }

        const apiError = await createApiError(response);
        lastError = apiError;

        if (!shouldRetryResponse(response, method, retry) || attempt === maxAttempts) {
          throw apiError;
        }

        await this.waitForRetry(
          retry,
          attempt,
          response.headers.get("retry-after"),
          options.signal,
          requestContext,
        );
      } catch (error: unknown) {
        if (error instanceof ApiError || error instanceof ValidationError) {
          throw error;
        }

        if (isAbortError(error)) {
          if (options.signal?.aborted) {
            throw error;
          }

          const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
          if (timeoutMs !== undefined) {
            throw new TimeoutError(
              `The request exceeded the configured timeout of ${timeoutMs}ms.`,
              timeoutMs,
            );
          }
        }

        lastError = error;
        if (
          attempt === maxAttempts ||
          !shouldRetryNetworkError(method, retry, options.signal)
        ) {
          throw new NetworkError("The API request could not be completed.", error);
        }

        await this.waitForRetry(retry, attempt, null, options.signal, requestContext);
      }
    }

    throw new NetworkError("The API request could not be completed.", lastError);
  }

  private validateRequestBody<TBody>(
    options: RequestOptions<TBody>,
  ): TBody | undefined {
    if (!this.validateRequests || !options.validateRequest || options.body === undefined) {
      return options.body;
    }

    try {
      return options.validateRequest(options.body);
    } catch (error: unknown) {
      throw new ValidationError("Request validation failed.", error);
    }
  }

  private validateResponseBody<TResponse>(
    data: TResponse,
    options: RequestOptions<unknown>,
  ): TResponse {
    if (!this.validateResponses || !options.validateResponse) {
      return data;
    }

    try {
      return options.validateResponse(data) as TResponse;
    } catch (error: unknown) {
      throw new ValidationError("Response validation failed.", error);
    }
  }

  private async createRequest<TBody>(
    path: string,
    method: string,
    body: TBody | undefined,
    options: RequestOptions<TBody>,
  ): Promise<MutableRequest> {
    const url = buildUrl(this.baseUrl, path, options.path, options.query);
    const headers = new Headers(this.defaultHeaders);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));

    const mutableRequest: MutableRequest = {
      url,
      method,
      headers,
      body: serializeBody(body, headers, options.contentType),
    };

    await applyAuth(mutableRequest, options.auth ?? this.defaultAuth);
    return mutableRequest;
  }

  private async fetchWithTimeout(
    request: MutableRequest,
    callerSignal: AbortSignal | undefined,
    timeoutOverride: number | undefined,
  ): Promise<Response> {
    const timeoutMs = validateTimeout(timeoutOverride) ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const removeAbortListener = forwardAbort(callerSignal, controller);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      return await this.fetchImplementation(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      removeAbortListener();
    }
  }

  private async waitForRetry(
    retry: RetryConfig,
    attempt: number,
    retryAfter: string | null,
    signal: AbortSignal | undefined,
    context: RequestContext,
  ): Promise<void> {
    const delayMs = retryAfterDelay(retryAfter) ?? calculateRetryDelay(retry, attempt);
    this.logger?.warn?.("Retrying SDK request.", {
      method: context.method,
      url: redactUrl(new URL(context.url)),
      attempt,
      delayMs,
    });
    await sleep(delayMs, signal);
  }
}

/**
 * Base class intended for generated resource namespaces.
 */
export abstract class BaseResource {
  protected constructor(protected readonly client: ApiClient) {}

  protected request<TResponse, TBody = unknown>(
    path: string,
    options?: RequestOptions<TBody>,
  ): Promise<TResponse> {
    return this.client.request<TResponse, TBody>(path, options);
  }

  protected requestWithResponse<TResponse, TBody = unknown>(
    path: string,
    options?: RequestOptions<TBody>,
  ): Promise<ApiResponse<TResponse>> {
    return this.client.requestWithResponse<TResponse, TBody>(path, options);
  }
}

/** Alias retained for generated SDKs that use `Client` as their root name. */
export { ApiClient as Client };

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported protocol");
  }
  return url.toString().replace(/\/+$/, "");
}

function validateTimeout(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigurationError("`timeoutMs` must be a positive finite number.");
  }
  return value;
}

function normalizeRetryConfig(value: RetryConfig | false | undefined): RetryConfig | false {
  if (value === false) {
    return false;
  }

  const config: Required<RetryConfig> = {
    maxAttempts: value?.maxAttempts ?? 3,
    initialDelayMs: value?.initialDelayMs ?? 250,
    maxDelayMs: value?.maxDelayMs ?? 10_000,
    multiplier: value?.multiplier ?? 2,
    jitter: value?.jitter ?? true,
    retryUnsafeMethods: value?.retryUnsafeMethods ?? false,
  };

  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) {
    throw new ConfigurationError("`retry.maxAttempts` must be an integer of at least 1.");
  }
  if (config.initialDelayMs < 0 || config.maxDelayMs < 0 || config.multiplier < 1) {
    throw new ConfigurationError("Retry delays must be non-negative and multiplier must be at least 1.");
  }

  return config;
}

function buildUrl(
  baseUrl: string,
  path: string,
  pathParameters: RequestOptions["path"],
  query: QueryParameters | undefined,
): URL {
  const resolvedPath = path.replace(/\{([^}]+)\}/g, (placeholder, name: string) => {
    const value = pathParameters?.[name];
    if (value === undefined || value === null) {
      throw new ConfigurationError(
        `Missing required path parameter "${name}" for ${placeholder}.`,
      );
    }
    return encodeURIComponent(String(value));
  });

  const url = new URL(
    resolvedPath.startsWith("/") ? resolvedPath.slice(1) : resolvedPath,
    `${baseUrl}/`,
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      appendQueryValue(url.searchParams, key, value);
    }
  }

  return url;
}

function appendQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: QueryValue,
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== undefined && item !== null) {
        searchParams.append(key, stringifyQueryValue(item));
      }
    }
    return;
  }

  if (value instanceof Date) {
    searchParams.append(key, value.toISOString());
    return;
  }

  if (typeof value === "object") {
    searchParams.append(key, JSON.stringify(value));
    return;
  }

  searchParams.append(key, String(value));
}

function stringifyQueryValue(value: string | number | boolean | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function serializeBody(
  body: unknown,
  headers: Headers,
  contentType: string | undefined,
): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  ) {
    if (contentType && !headers.has("content-type")) {
      headers.set("content-type", contentType);
    }
    return body as BodyInit;
  }

  const resolvedContentType = contentType ?? "application/json";
  if (!headers.has("content-type")) {
    headers.set("content-type", resolvedContentType);
  }

  if (resolvedContentType.includes("application/json")) {
    return JSON.stringify(body);
  }

  throw new ConfigurationError(
    "An object request body requires an explicit serializer or JSON content type.",
  );
}

async function applyAuth(request: MutableRequest, auth: AuthConfig): Promise<void> {
  switch (auth.type) {
    case "none":
      return;
    case "bearer": {
      const token = await resolveValue(auth.token);
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      return;
    }
    case "apiKey": {
      const value = await resolveValue(auth.value);
      if (auth.in === "header") {
        request.headers.set(auth.name, value);
      } else {
        request.url.searchParams.set(auth.name, value);
      }
      return;
    }
    case "basic": {
      const username = await resolveValue(auth.username);
      const password = await resolveValue(auth.password);
      request.headers.set("Authorization", `Basic ${encodeBase64(`${username}:${password}`)}`);
      return;
    }
    case "oauth2": {
      const token = await auth.getAccessToken();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      return;
    }
    case "custom":
      await auth.apply(request);
      return;
  }
}

async function resolveValue(
  value: string | (() => string | Promise<string>),
): Promise<string> {
  return typeof value === "function" ? value() : value;
}

function encodeBase64(value: string): string {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  const bufferConstructor = globalThis.Buffer;
  if (bufferConstructor) {
    return bufferConstructor.from(value, "utf8").toString("base64");
  }

  throw new ConfigurationError("Basic authentication is not supported in this runtime.");
}

async function parseResponse<T>(response: Response, parser: ResponseParser): Promise<T> {
  if (parser === "void" || response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  if (parser === "stream") {
    return response.body as T;
  }
  if (parser === "blob") {
    return await response.blob() as T;
  }
  if (parser === "arrayBuffer") {
    return await response.arrayBuffer() as T;
  }
  if (parser === "text") {
    return await response.text() as T;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (parser === "json" || contentType.includes("json") || contentType.includes("+json")) {
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch (error: unknown) {
      throw new ValidationError("The API returned invalid JSON.", error);
    }
  }

  return await response.text() as T;
}

async function createApiError(response: Response): Promise<ApiError> {
  const body = await parseErrorBody(response);
  const record = isRecord(body) ? body : undefined;
  const nestedError = record && isRecord(record.error) ? record.error : undefined;
  const errorData = nestedError ?? record;

  const message = getString(errorData, "message") ??
    `API request failed with status ${response.status}.`;
  const code = getString(errorData, "code");
  const requestId = response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    getString(errorData, "requestId");
  const details = errorData?.details;

  if (response.status === 401 || response.status === 403) {
    return new AuthenticationError(
      message,
      response.status,
      response.statusText,
      response.headers,
      body,
      code,
      requestId,
      details,
    );
  }

  if (response.status === 429) {
    return new RateLimitError(
      message,
      response.status,
      response.statusText,
      response.headers,
      body,
      code,
      requestId,
      details,
      retryAfterDelay(response.headers.get("retry-after")) ?? undefined,
    );
  }

  return new ApiError(
    message,
    response.status,
    response.statusText,
    response.headers,
    body,
    code,
    requestId,
    details,
  );
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  try {
    if (contentType.includes("json") || contentType.includes("+json")) {
      return await response.json() as unknown;
    }

    const text = await response.text();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function shouldRetryResponse(
  response: Response,
  method: string,
  retry: RetryConfig | false,
): boolean {
  return retry !== false &&
    isRetryableMethod(method, retry) &&
    [408, 429, 500, 502, 503, 504].includes(response.status);
}

function shouldRetryNetworkError(
  method: string,
  retry: RetryConfig | false,
  signal: AbortSignal | undefined,
): boolean {
  return retry !== false && !signal?.aborted && isRetryableMethod(method, retry);
}

function isRetryableMethod(method: string, retry: RetryConfig): boolean {
  return retry.retryUnsafeMethods ||
    ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(method);
}

function calculateRetryDelay(retry: RetryConfig, attempt: number): number {
  const initialDelay = retry.initialDelayMs ?? 250;
  const maxDelay = retry.maxDelayMs ?? 10_000;
  const multiplier = retry.multiplier ?? 2;
  const rawDelay = Math.min(maxDelay, initialDelay * multiplier ** (attempt - 1));
  return retry.jitter === false ? rawDelay : Math.floor(rawDelay * (0.5 + Math.random() * 0.5));
}

function retryAfterDelay(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const retryDate = Date.parse(value);
  if (!Number.isNaN(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  return null;
}

function sleep(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function forwardAbort(
  source: AbortSignal | undefined,
  destination: AbortController,
): () => void {
  if (!source) {
    return () => undefined;
  }

  const abort = (): void => destination.abort(source.reason);
  if (source.aborted) {
    abort();
    return () => undefined;
  }

  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  }
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function redactUrl(url: URL): string {
  const redacted = new URL(url);
  for (const key of [...redacted.searchParams.keys()]) {
    if (/token|key|secret|password|authorization/i.test(key)) {
      redacted.searchParams.set(key, "[REDACTED]");
    }
  }
  return redacted.toString();
}