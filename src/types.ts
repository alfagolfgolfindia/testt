/**
 * Shared public types for the generated SDK.
 *
 * These types intentionally avoid runtime dependencies so they can be consumed
 * by Node.js 18+ and modern browser applications.
 */

/** A JSON primitive value. */
export type JsonPrimitive = string | number | boolean | null;

/** A recursively serializable JSON value. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** A JSON object with string keys. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** A JSON array. */
export type JsonArray = readonly JsonValue[];

/** Supported HTTP methods. */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "TRACE";

/**
 * Values accepted for query string parameters before serialization.
 */
export type QueryValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | readonly string[]
  | readonly number[]
  | readonly boolean[]
  | readonly Date[]
  | Readonly<Record<string, string | number | boolean | Date | null | undefined>>;

/**
 * A collection of query string parameters.
 */
export type QueryParams = Readonly<Record<string, QueryValue>>;

/**
 * A collection of request headers. Values set to `undefined` are omitted.
 */
export type HeaderMap = Readonly<Record<string, string | number | boolean | undefined>>;

/**
 * A request body supported by the fetch transport.
 */
export type RequestBody =
  | string
  | URLSearchParams
  | FormData
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream<Uint8Array>
  | JsonValue
  | null
  | undefined;

/**
 * A header collection normalized to lower-case lookup keys.
 */
export type ResponseHeaders = Readonly<Record<string, string>>;

/**
 * Supported response parsing modes.
 */
export type ResponseType =
  | "auto"
  | "json"
  | "text"
  | "blob"
  | "arrayBuffer"
  | "stream"
  | "void";

/**
 * The raw and parsed result of a successful API request.
 *
 * @typeParam TData Parsed response payload type.
 */
export interface ApiResponse<TData> {
  /** Parsed response payload. */
  readonly data: TData;
  /** HTTP status code returned by the server. */
  readonly status: number;
  /** HTTP status text returned by the server. */
  readonly statusText: string;
  /** Normalized response headers. */
  readonly headers: ResponseHeaders;
  /** Original fetch response for advanced use cases. */
  readonly response: Response;
  /** Request correlation identifier when supplied by the API. */
  readonly requestId?: string;
}

/**
 * A callback that resolves an OAuth access token immediately before a request.
 */
export type AccessTokenProvider = (
  context: TokenProviderContext,
) => string | null | undefined | Promise<string | null | undefined>;

/**
 * Context provided to an OAuth token provider.
 */
export interface TokenProviderContext {
  /** HTTP method of the request about to be made. */
  readonly method: HttpMethod;
  /** Fully resolved request URL. */
  readonly url: string;
  /** Operation identifier, when available. */
  readonly operationId?: string;
  /** Abort signal associated with the request. */
  readonly signal?: AbortSignal;
}

/**
 * Static bearer-token authentication.
 */
export interface BearerTokenAuth {
  readonly type: "bearer";
  readonly token: string;
  /** Optional authorization scheme, defaulting to `Bearer`. */
  readonly scheme?: string;
}

/**
 * API-key authentication sent through a request header.
 */
export interface ApiKeyHeaderAuth {
  readonly type: "apiKey";
  readonly in: "header";
  readonly name: string;
  readonly value: string;
}

/**
 * API-key authentication sent through a query parameter.
 */
export interface ApiKeyQueryAuth {
  readonly type: "apiKey";
  readonly in: "query";
  readonly name: string;
  readonly value: string;
}

/**
 * HTTP Basic authentication.
 */
export interface BasicAuth {
  readonly type: "basic";
  readonly username: string;
  readonly password: string;
}

/**
 * OAuth authentication backed by a caller-managed access-token provider.
 */
export interface OAuthTokenProviderAuth {
  readonly type: "oauth2";
  readonly getAccessToken: AccessTokenProvider;
  /** Optional authorization scheme, defaulting to `Bearer`. */
  readonly scheme?: string;
}

/**
 * Custom authentication headers.
 */
export interface CustomHeadersAuth {
  readonly type: "customHeaders";
  readonly headers: HeaderMap;
}

/**
 * Explicitly disables SDK-level authentication for a request or client.
 */
export interface NoAuth {
  readonly type: "none";
}

/**
 * Authentication strategies supported by generated clients.
 */
export type AuthConfig =
  | BearerTokenAuth
  | ApiKeyHeaderAuth
  | ApiKeyQueryAuth
  | BasicAuth
  | OAuthTokenProviderAuth
  | CustomHeadersAuth
  | NoAuth;

/**
 * Logging severity used by the SDK.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured log events emitted by the SDK.
 */
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

/**
 * Callback invoked for SDK log events.
 */
export type Logger = (event: LogEvent) => void;

/**
 * Context available to request hooks.
 */
export interface RequestHookContext {
  readonly operationId?: string;
  readonly method: HttpMethod;
  readonly url: URL;
  readonly headers: Headers;
  readonly attempt: number;
  readonly signal?: AbortSignal;
}

/**
 * A hook invoked immediately before the transport sends a request.
 *
 * Hooks may mutate `headers` and `url`. They must not consume or replace a
 * request body because bodies can be streams.
 */
export type RequestHook = (
  context: RequestHookContext,
) => void | Promise<void>;

/**
 * Context available to response hooks.
 */
export interface ResponseHookContext {
  readonly operationId?: string;
  readonly method: HttpMethod;
  readonly url: URL;
  readonly response: Response;
  readonly attempt: number;
}

/**
 * A hook invoked after a response is received and before response parsing.
 */
export type ResponseHook = (
  context: ResponseHookContext,
) => void | Promise<void>;

/**
 * Controls retries for failed HTTP requests.
 */
export interface RetryConfig {
  /**
   * Maximum number of attempts, including the initial request.
   *
   * Set to `1` to disable retries.
   *
   * @defaultValue 3
   */
  readonly maxAttempts?: number;
  /**
   * Initial retry delay in milliseconds.
   *
   * @defaultValue 250
   */
  readonly initialDelayMs?: number;
  /**
   * Maximum delay between attempts in milliseconds.
   *
   * @defaultValue 10_000
   */
  readonly maxDelayMs?: number;
  /**
   * Exponential backoff multiplier.
   *
   * @defaultValue 2
   */
  readonly backoffMultiplier?: number;
  /**
   * Enables randomized jitter to avoid synchronized retry bursts.
   *
   * @defaultValue true
   */
  readonly jitter?: boolean;
  /**
   * Honors valid `Retry-After` response headers when present.
   *
   * @defaultValue true
   */
  readonly respectRetryAfter?: boolean;
  /**
   * Permits retries for non-idempotent methods such as POST and PATCH.
   *
   * @defaultValue false
   */
  readonly retryUnsafeMethods?: boolean;
  /**
   * Additional status codes that should be considered retryable.
   */
  readonly retryableStatusCodes?: readonly number[];
  /**
   * Optional predicate for application-specific retry decisions.
   */
  readonly shouldRetry?: (context: RetryContext) => boolean | Promise<boolean>;
}

/**
 * Information passed to a custom retry predicate.
 */
export interface RetryContext {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly method: HttpMethod;
  readonly operationId?: string;
  readonly response?: Response;
  readonly error?: Error;
}

/**
 * Base configuration accepted by the root SDK client.
 */
export interface ClientConfig {
  /**
   * API server URL. A generated client may provide a documented default.
   */
  readonly baseUrl?: string;
  /**
   * Authentication configuration applied to all requests by default.
   */
  readonly auth?: AuthConfig;
  /**
   * Convenience bearer token configuration. Ignored when `auth` is supplied.
   */
  readonly bearerToken?: string;
  /**
   * Convenience API key configuration. Generated SDKs document its placement.
   * Ignored when `auth` is supplied.
   */
  readonly apiKey?: string;
  /**
   * Custom fetch implementation for test environments or non-standard runtimes.
   */
  readonly fetch?: typeof fetch;
  /**
   * Default request timeout in milliseconds. Set to `0` to disable timeouts.
   */
  readonly timeoutMs?: number;
  /**
   * Default headers applied to every request.
   */
  readonly headers?: HeaderMap;
  /**
   * Retry configuration. Set to `false` to disable retries globally.
   */
  readonly retry?: RetryConfig | false;
  /**
   * Enables validation of generated request schemas.
   *
   * @defaultValue false
   */
  readonly validateRequests?: boolean;
  /**
   * Enables validation of generated response schemas.
   *
   * @defaultValue false
   */
  readonly validateResponses?: boolean;
  /**
   * Optional request lifecycle hooks.
   */
  readonly onRequest?: RequestHook | readonly RequestHook[];
  /**
   * Optional response lifecycle hooks.
   */
  readonly onResponse?: ResponseHook | readonly ResponseHook[];
  /**
   * Optional structured logging callback.
   */
  readonly logger?: Logger;
  /**
   * Additional user-agent value where the runtime permits setting it.
   */
  readonly userAgent?: string;
}

/**
 * Per-request options accepted by generated resource methods.
 */
export interface RequestOptions {
  /**
   * Override the client base URL for this request.
   */
  readonly baseUrl?: string;
  /**
   * Additional headers for this request.
   */
  readonly headers?: HeaderMap;
  /**
   * Authentication override for this request.
   */
  readonly auth?: AuthConfig;
  /**
   * Abort signal supplied by the caller.
   */
  readonly signal?: AbortSignal;
  /**
   * Timeout override in milliseconds. Set to `0` to disable the client timeout.
   */
  readonly timeoutMs?: number;
  /**
   * Retry override. Set to `false` to disable retries for this request.
   */
  readonly retry?: RetryConfig | false;
  /**
   * Request validation override.
   */
  readonly validateRequest?: boolean;
  /**
   * Response validation override.
   */
  readonly validateResponse?: boolean;
  /**
   * Response parsing mode override.
   */
  readonly responseType?: ResponseType;
  /**
   * Optional operation identifier used for hooks, logs, and errors.
   */
  readonly operationId?: string;
}

/**
 * A low-level request definition consumed by the HTTP transport.
 */
export interface HttpRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: QueryParams;
  readonly headers?: HeaderMap;
  readonly body?: RequestBody;
  readonly contentType?: string;
  readonly responseType?: ResponseType;
  readonly options?: RequestOptions;
}

/**
 * Common offset/limit pagination parameters.
 */
export interface OffsetPaginationParams {
  readonly offset?: number;
  readonly limit?: number;
}

/**
 * Common page/page-size pagination parameters.
 */
export interface PagePaginationParams {
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Common cursor pagination parameters.
 */
export interface CursorPaginationParams {
  readonly cursor?: string;
  readonly limit?: number;
}

/**
 * Metadata returned by cursor-based API responses.
 */
export interface CursorPaginationMetadata {
  readonly nextCursor?: string | null;
  readonly previousCursor?: string | null;
  readonly hasMore?: boolean;
}

/**
 * A standard paginated response shape.
 *
 * Generated endpoint-specific response types may extend or replace this type
 * when the source API documents a more specific payload.
 */
export interface PaginatedResponse<TItem> {
  readonly data: readonly TItem[];
  readonly pagination?: CursorPaginationMetadata;
  readonly nextCursor?: string | null;
  readonly previousCursor?: string | null;
  readonly hasMore?: boolean;
  readonly total?: number;
}

/**
 * A page result used internally by generated async pagination helpers.
 */
export interface PaginationPage<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor?: string | null;
  readonly hasMore: boolean;
}

/**
 * A generic async iterable returned by generated `listAll` helpers.
 */
export type PaginationIterable<TItem> = AsyncIterable<TItem>;

/**
 * A representation of a multipart file field accepted by generated methods.
 */
export type UploadFile = Blob | File | Uint8Array | ArrayBuffer;

/**
 * A multipart form value.
 */
export type MultipartValue =
  | string
  | number
  | boolean
  | Date
  | UploadFile
  | null
  | undefined;

/**
 * A multipart form-data payload.
 */
export type MultipartFormData = Readonly<Record<string, MultipartValue | readonly MultipartValue[]>>;

/**
 * Extracts the payload type from an `ApiResponse`.
 */
export type ApiResponseData<T> = T extends ApiResponse<infer TData> ? TData : never;

/**
 * Makes selected properties required while preserving all other properties.
 */
export type RequireFields<T, TKeys extends keyof T> = Omit<T, TKeys> &
  Required<Pick<T, TKeys>>;

/**
 * Makes selected properties optional while preserving all other properties.
 */
export type OptionalFields<T, TKeys extends keyof T> = Omit<T, TKeys> &
  Partial<Pick<T, TKeys>>;