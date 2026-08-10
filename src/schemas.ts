import { z } from "zod";

/**
 * JSON primitive values supported by API request and response payloads.
 */
export const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

/**
 * A JSON-compatible value.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Runtime schema for arbitrary JSON-compatible data.
 *
 * This intentionally excludes `undefined`, functions, symbols, bigint values,
 * and non-finite numbers because they cannot be represented in JSON.
 */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

/**
 * A JSON object with string keys.
 */
export const JsonObjectSchema = z.record(JsonValueSchema);

/**
 * A string-to-string HTTP header map.
 */
export const HeadersSchema = z.record(z.string(), z.string());

/**
 * A string-to-string-or-string-array query parameter map.
 */
export const QueryParamsSchema = z.record(
  z.union([z.string(), z.array(z.string())]),
);

/**
 * Supported HTTP request methods.
 */
export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Runtime target options for generated SDK clients.
 */
export const RuntimeTargetSchema = z.enum(["node", "browser", "universal"]);

/**
 * Module format options supported by generated SDK projects.
 */
export const ModuleFormatSchema = z.enum(["esm", "commonjs", "dual"]);

/**
 * Authentication mechanisms commonly represented by OpenAPI specifications.
 */
export const AuthenticationTypeSchema = z.enum([
  "none",
  "bearer",
  "apiKeyHeader",
  "apiKeyQuery",
  "basic",
  "oauth2",
  "customHeader",
]);

/**
 * Configuration for bearer-token authentication.
 */
export const BearerAuthenticationSchema = z.object({
  type: z.literal("bearer"),
  token: z.string().min(1).optional(),
  tokenProvider: z
    .function()
    .args()
    .returns(z.union([z.string(), z.promise(z.string())]))
    .optional(),
});

/**
 * Configuration for API-key authentication sent in an HTTP header.
 */
export const ApiKeyHeaderAuthenticationSchema = z.object({
  type: z.literal("apiKeyHeader"),
  apiKey: z.string().min(1).optional(),
  headerName: z.string().min(1).default("X-API-Key"),
});

/**
 * Configuration for API-key authentication sent as a query parameter.
 */
export const ApiKeyQueryAuthenticationSchema = z.object({
  type: z.literal("apiKeyQuery"),
  apiKey: z.string().min(1).optional(),
  parameterName: z.string().min(1).default("api_key"),
});

/**
 * Configuration for HTTP basic authentication.
 */
export const BasicAuthenticationSchema = z.object({
  type: z.literal("basic"),
  username: z.string().min(1),
  password: z.string(),
});

/**
 * Configuration for OAuth token injection.
 *
 * The SDK does not manage OAuth flows. Consumers provide an access token or a
 * callback that resolves a current token for each request.
 */
export const OAuth2AuthenticationSchema = z.object({
  type: z.literal("oauth2"),
  accessToken: z.string().min(1).optional(),
  tokenProvider: z
    .function()
    .args()
    .returns(z.union([z.string(), z.promise(z.string())]))
    .optional(),
});

/**
 * Configuration for custom header authentication.
 */
export const CustomHeaderAuthenticationSchema = z.object({
  type: z.literal("customHeader"),
  headerName: z.string().min(1),
  value: z.string().min(1).optional(),
  valueProvider: z
    .function()
    .args()
    .returns(z.union([z.string(), z.promise(z.string())]))
    .optional(),
});

/**
 * A discriminated union describing supported SDK authentication strategies.
 */
export const AuthenticationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  BearerAuthenticationSchema,
  ApiKeyHeaderAuthenticationSchema,
  ApiKeyQueryAuthenticationSchema,
  BasicAuthenticationSchema,
  OAuth2AuthenticationSchema,
  CustomHeaderAuthenticationSchema,
]);

/**
 * Retry settings accepted by the SDK client.
 */
export const RetryOptionsSchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(20).default(3),
    initialDelayMs: z.number().int().min(0).max(60_000).default(250),
    maxDelayMs: z.number().int().min(0).max(300_000).default(10_000),
    backoffMultiplier: z.number().min(1).max(10).default(2),
    jitter: z.boolean().default(true),
    retryUnsafeMethods: z.boolean().default(false),
    respectRetryAfter: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.maxDelayMs < value.initialDelayMs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxDelayMs must be greater than or equal to initialDelayMs.",
        path: ["maxDelayMs"],
      });
    }
  });

/**
 * Per-request retry configuration.
 */
export const RequestRetryOptionsSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    retryUnsafeMethods: z.boolean().optional(),
  })
  .strict();

/**
 * Common per-request options accepted by generated resource methods.
 */
export const RequestOptionsSchema = z
  .object({
    headers: HeadersSchema.optional(),
    timeoutMs: z.number().int().positive().max(300_000).optional(),
    retry: z.union([z.boolean(), RequestRetryOptionsSchema]).optional(),
    validateRequest: z.boolean().optional(),
    validateResponse: z.boolean().optional(),
    signal: z
      .custom<AbortSignal>(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "aborted" in value &&
          typeof (value as { aborted?: unknown }).aborted === "boolean",
        { message: "signal must be an AbortSignal." },
      )
      .optional(),
  })
  .strict();

/**
 * Pagination settings inferred from an API contract.
 */
export const PaginationOptionsSchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
  })
  .strict();

/**
 * A normalized representation of an API error payload.
 */
export const ApiErrorBodySchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
    error: z.union([z.string(), JsonObjectSchema]).optional(),
    details: JsonValueSchema.optional(),
  })
  .passthrough();

/**
 * A normalized HTTP response metadata shape.
 */
export const ResponseMetadataSchema = z.object({
  status: z.number().int().min(100).max(599),
  statusText: z.string(),
  headers: HeadersSchema,
  requestId: z.string().optional(),
});

/**
 * Safely validates a value against a schema and returns a descriptive error
 * result without throwing.
 */
export function safeParseWithSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
):
  | { success: true; data: z.output<TSchema> }
  | { success: false; issues: z.ZodIssue[] } {
  const result = schema.safeParse(value);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, issues: result.error.issues };
}

/**
 * Formats Zod issues into a stable, human-readable message suitable for
 * validation errors and diagnostics.
 */
export function formatValidationIssues(issues: readonly z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "value";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}