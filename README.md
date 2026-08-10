# Generated TypeScript SDK

A typed, fetch-based TypeScript SDK generated from an API contract. It provides resource-oriented API access, Zod runtime validation, configurable authentication, retries, normalized errors, request timeouts, and extensibility hooks.

> Review this SDK before publishing or using it in production. See [AI Generation Notes](#ai-generation-notes) for source-contract assumptions and validation guidance.

## Features

- Strict TypeScript types for API requests, responses, parameters, and errors
- Fetch-based transport compatible with Node.js 18+ and modern browsers
- Configurable authentication for bearer tokens, API keys, basic auth, OAuth token providers, and custom headers
- Optional Zod validation for requests and responses
- Normalized API, network, timeout, authentication, rate-limit, configuration, and validation errors
- Safe retry support with exponential backoff, jitter, and `Retry-After` handling
- Request cancellation through `AbortSignal`
- Custom `fetch`, headers, logging, request hooks, and response hooks
- Typed resource namespaces and operation methods
- API operation documentation available through TypeScript JSDoc

## Installation

Install the package from npm:

```bash
npm install <package-name>
```

Or with another package manager:

```bash
pnpm add <package-name>
# or
yarn add <package-name>
```

This SDK requires:

- Node.js 18 or newer when running in Node.js
- A modern browser with native `fetch` support when running in the browser

The package includes `zod` as a runtime dependency when validation schemas are generated.

## Configuration

Create a client with the API base URL and the authentication method required by the API.

```ts
import { ApiClient } from "<package-name>";

const client = new ApiClient({
  baseUrl: "https://api.example.com",
});
```

The client configuration supports the following common options:

```ts
import { ApiClient } from "<package-name>";

const client = new ApiClient({
  /**
   * Base URL for all API requests. Required unless the generated SDK has
   * a documented default server URL.
   */
  baseUrl: "https://api.example.com",

  /**
   * Optional custom fetch implementation. Useful for tests, older runtimes,
   * proxies, instrumentation, or specialized environments.
   */
  fetch: globalThis.fetch,

  /**
   * Default headers merged into every request.
   */
  headers: {
    "X-Application-Name": "my-application",
  },

  /**
   * Request timeout in milliseconds. Set to 0 to disable SDK timeouts.
   */
  timeout: 30_000,

  /**
   * Enable runtime validation for documented request schemas.
   */
  validateRequests: false,

  /**
   * Enable runtime validation for documented response schemas.
   */
  validateResponses: false,

  /**
   * Retry configuration. Retries are enabled only for safe/idempotent
   * requests by default.
   */
  retry: {
    maxAttempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 10_000,
  },

  /**
   * Optional request and response observability hooks.
   */
  onRequest: (request) => {
    console.debug("Sending request", request.method, request.url);
  },
  onResponse: (response) => {
    console.debug("Received response", response.status);
  },
});
```

## Environment Variables

Do not hardcode credentials in source code. For server-side applications, store them in environment variables.

```bash
# .env
EXAMPLE_API_BASE_URL=https://api.example.com
EXAMPLE_API_KEY=your_api_key_here
EXAMPLE_BEARER_TOKEN=your_bearer_token_here
```

Load environment variables using your runtime's preferred mechanism.

```ts
import { ApiClient } from "<package-name>";

const client = new ApiClient({
  baseUrl: process.env.EXAMPLE_API_BASE_URL ?? "https://api.example.com",
  apiKey: process.env.EXAMPLE_API_KEY,
});
```

Never expose private API keys to browser clients. If an API requires secret credentials, call it from a trusted server environment or use an authentication flow intended for browser use.

## Authentication

Authentication support is generated from the source API contract. The exact available fields depend on the documented API security schemes.

### Bearer Token

```ts
import { ApiClient } from "<package-name>";

const client = new ApiClient({
  baseUrl: "https://api.example.com",
  bearerToken: "your_bearer_token",
});
```

### API Key Header

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  apiKey: "your_api_key",
});
```

### API Key Query Parameter

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  apiKey: "your_api_key",
});
```

When the source specification defines an API key query parameter, the SDK serializes it according to the documented parameter name and location.

### Basic Authentication

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  basicAuth: {
    username: "your_username",
    password: "your_password",
  },
});
```

### OAuth 2 Token Provider

For OAuth 2 APIs, provide a callback that returns a current access token. The SDK does not automatically manage OAuth credentials unless explicitly implemented for the source API.

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  tokenProvider: async () => {
    return await getAccessTokenFromYourAuthSystem();
  },
});
```

### Per-Request Authentication Overrides

Most generated methods accept request options that allow headers, signals, timeout values, and authentication behavior to be overridden for one call.

```ts
const result = await client.users.list({
  requestOptions: {
    headers: {
      "X-Tenant-ID": "tenant_123",
    },
    timeout: 10_000,
  },
});
```

Refer to the generated type definitions for the options available on each operation.

## Usage

### Initialize the Client

```ts
import { ApiClient } from "<package-name>";

const client = new ApiClient({
  baseUrl: "https://api.example.com",
  bearerToken: process.env.EXAMPLE_BEARER_TOKEN,
});
```

### Call a Resource Method

Generated resources are grouped by API tags or path domains. Methods use ergonomic camel-case names while preserving source operation metadata in documentation.

```ts
const users = await client.users.list({
  limit: 20,
});

for (const user of users.data) {
  console.log(user.id, user.name);
}
```

### Get a Resource

```ts
const user = await client.users.get({
  id: "user_123",
});

console.log(user.email);
```

### Create a Resource

```ts
const createdUser = await client.users.create({
  body: {
    name: "Ada Lovelace",
    email: "ada@example.com",
  },
});

console.log(createdUser.id);
```

### Update a Resource

```ts
const updatedUser = await client.users.update({
  id: "user_123",
  body: {
    name: "Ada Byron",
  },
});
```

### Delete a Resource

```ts
await client.users.delete({
  id: "user_123",
});
```

The actual resource names, methods, and request shapes are generated from the API contract. Use your editor's autocomplete and inspect exported types from the package for the authoritative interface.

## API Reference

The SDK exports the root client, configuration types, errors, generated request and response types, runtime schemas, resources, and utility types.

```ts
import {
  ApiClient,
  ApiError,
  AuthenticationError,
  ConfigurationError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "<package-name>";
```

Common exports include:

| Export | Description |
| --- | --- |
| `ApiClient` | Root client used to access generated resource namespaces. |
| `ApiClientConfig` | Client initialization and transport configuration. |
| `ApiError` | Normalized error for unsuccessful HTTP API responses. |
| `NetworkError` | Error raised when a request cannot reach the API. |
| `TimeoutError` | Error raised when the configured request timeout elapses. |
| `ValidationError` | Error raised when request or response validation fails. |
| `AuthenticationError` | Error raised for authentication or authorization failures. |
| `RateLimitError` | Error raised for HTTP `429` responses. |
| `ConfigurationError` | Error raised for invalid client configuration. |
| Generated types | Request, response, enum, and model types derived from the API contract. |
| Generated schemas | Zod schemas for supported documented request and response models. |

### Endpoint Coverage

The generated package should contain a coverage table based on the analyzed source contract.

| Resource | Method | HTTP Method | Path | Source Status |
| --- | --- | --- | --- | --- |
| _Generated resource_ | _Generated operation_ | _Method_ | _Path_ | Documented or inferred |

Operations inferred from prose documentation rather than a complete machine-readable specification should be marked as **Inferred**. Carefully validate those operations against the source API before production use.

### Generated Source Files

| File | Purpose |
| --- | --- |
| `src/index.ts` | Public package exports. |
| `src/client.ts` | Root API client and resource namespace initialization. |
| `src/config.ts` | Client configuration and authentication types. |
| `src/errors.ts` | Typed normalized SDK error classes. |
| `src/http.ts` | Fetch transport, timeout, request handling, parsing, and hooks. |
| `src/types.ts` | Generated API model, request, response, and enum types. |
| `src/schemas.ts` | Generated Zod validation schemas. |
| `src/resources/` | Resource-specific endpoint methods. |
| `src/utils/retry.ts` | Retry policy, backoff, jitter, and `Retry-After` handling. |

## Runtime Validation

When generated schemas are available, request and response validation can be enabled at client construction time.

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  validateRequests: true,
  validateResponses: true,
});
```

### Validation Defaults

Runtime validation is typically disabled by default to minimize overhead. Enable it when:

- Integrating with an API that may return inconsistent payloads
- Developing against a new or changing API
- Testing SDK behavior
- Auditing documentation-to-contract fidelity

Request validation catches invalid SDK input before network activity. Response validation catches API payloads that do not match documented schemas.

Validation may not cover constructs unavailable or ambiguous in the source contract. See [AI Generation Notes](#ai-generation-notes).

## Error Handling

All SDK errors extend `Error` and can be narrowed with `instanceof`.

```ts
import {
  ApiError,
  AuthenticationError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "<package-name>";

try {
  const user = await client.users.get({ id: "user_123" });
  console.log(user);
} catch (error: unknown) {
  if (error instanceof RateLimitError) {
    console.error("Rate limited. Retry after:", error.retryAfter);
  } else if (error instanceof AuthenticationError) {
    console.error("Authentication failed:", error.message);
  } else if (error instanceof ValidationError) {
    console.error("Validation failed:", error.issues);
  } else if (error instanceof TimeoutError) {
    console.error("The request timed out.");
  } else if (error instanceof NetworkError) {
    console.error("Network request failed:", error.message);
  } else if (error instanceof ApiError) {
    console.error("API request failed:", {
      status: error.status,
      statusText: error.statusText,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      details: error.details,
    });
  } else {
    throw error;
  }
}
```

### `ApiError`

`ApiError` represents a non-successful HTTP response. Depending on the source response, it may include:

- `status`: HTTP status code
- `statusText`: HTTP status text
- `code`: API-defined error code, when available
- `message`: API-provided or normalized error message
- `requestId`: API request or correlation ID, when available
- `headers`: response headers
- `body`: raw response body, when safely available
- `details`: parsed API-specific error details

Avoid logging raw error bodies if they may contain personal data, credentials, or other sensitive information.

## Retries

The SDK retries transient failures for idempotent operations by default. Retryable failures generally include:

- Network failures
- HTTP `408`
- HTTP `429`
- HTTP `500`
- HTTP `502`
- HTTP `503`
- HTTP `504`

Unsafe methods such as `POST`, `PATCH`, and some `DELETE` operations are not retried automatically unless explicitly configured or the operation supports an idempotency key.

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  retry: {
    maxAttempts: 4,
    baseDelayMs: 300,
    maxDelayMs: 15_000,
    jitter: true,
  },
});
```

Disable retries globally:

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  retry: false,
});
```

Disable retries for an individual request:

```ts
await client.users.list({
  requestOptions: {
    retry: false,
  },
});
```

When an API returns a valid `Retry-After` header, the SDK uses it when allowed by the configured retry policy.

## Timeouts and Cancellation

Configure a default timeout in milliseconds:

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  timeout: 15_000,
});
```

Provide an `AbortSignal` to cancel an individual request:

```ts
const controller = new AbortController();

const request = client.users.list({
  requestOptions: {
    signal: controller.signal,
  },
});

controller.abort();

await request;
```

The SDK combines caller-provided cancellation with its timeout handling. An aborted operation may raise a `TimeoutError`, a cancellation-related error, or the runtime's native abort error depending on the transport and generated configuration.

## Custom Fetch

Use a custom `fetch` implementation for testing, proxies, observability, or non-standard runtimes.

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  fetch: async (input, init) => {
    console.log("Request:", input);
    return fetch(input, init);
  },
});
```

The supplied implementation must conform to the standard Fetch API signature.

## Custom Headers and Hooks

Set headers globally:

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  headers: {
    "X-Client-Version": "1.0.0",
  },
});
```

Set headers for one request:

```ts
await client.users.list({
  requestOptions: {
    headers: {
      "X-Organization-ID": "org_123",
    },
  },
});
```

Use hooks for logging or tracing. Do not log authorization headers, tokens, passwords, or sensitive request bodies.

```ts
const client = new ApiClient({
  baseUrl: "https://api.example.com",
  onRequest: ({ method, url }) => {
    console.info(`[SDK] ${method} ${url}`);
  },
  onResponse: ({ status, url }) => {
    console.info(`[SDK] ${status} ${url}`);
  },
});
```

## Pagination

Pagination helpers are generated only when pagination behavior can be identified reliably from the API contract.

For cursor- or page-based list operations, use the generated list method with documented pagination parameters:

```ts
const page = await client.items.list({
  limit: 50,
  cursor: "cursor_from_previous_response",
});
```

When available, asynchronous iteration can retrieve all pages:

```ts
for await (const item of client.items.listAll({ limit: 100 })) {
  console.log(item);
}
```

Do not assume that every list operation supports `listAll()`. Consult the generated resource type definitions and operation JSDoc.

## Query Serialization

The SDK serializes documented query parameters according to the source API contract, including supported OpenAPI parameter styles.

Supported values may include:

- Strings
- Numbers
- Booleans
- Dates
- Arrays
- Object-like query values
- Nullable and optional parameters

For best interoperability:

- Omit optional values rather than passing `undefined`
- Follow generated request types for allowed query shapes
- Use ISO 8601 strings or `Date` values where documented
- Check endpoint documentation for API-specific array or object serialization behavior

## File Uploads and Downloads

For multipart endpoints, pass the generated request body type, typically using `FormData`, `Blob`, `File`, or supported binary values depending on the runtime.

```ts
const form = new FormData();
form.set("file", file);
form.set("description", "Example upload");

await client.files.upload({
  body: form,
});
```

For binary download endpoints, the return type may be `Blob`, `ArrayBuffer`, `Uint8Array`, `ReadableStream`, or a generated response wrapper depending on the source contract and configured runtime target.

## Testing

The package uses Vitest for deterministic SDK tests.

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run type checking:

```bash
npm run typecheck
```

Build the package:

```bash
npm run build
```

Generated tests mock `fetch` and should not call real external APIs. They typically verify:

- Path and query serialization
- Authentication injection
- Request body serialization
- Response parsing and runtime validation
- API error normalization
- Retry and `Retry-After` behavior
- Pagination behavior where generated

### Testing with a Custom Fetch Mock

```ts
import { ApiClient } from "<package-name>";

const mockFetch: typeof fetch = async () => {
  return new Response(
    JSON.stringify({
      id: "user_123",
      name: "Ada Lovelace",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};

const client = new ApiClient({
  baseUrl: "https://api.example.com",
  fetch: mockFetch,
});

const user = await client.users.get({ id: "user_123" });
```

## Development

Install dependencies:

```bash
npm install
```

Available scripts:

```bash
npm run build        # Compile TypeScript
npm run typecheck    # Run strict TypeScript checks
npm test             # Run Vitest once
npm run test:watch   # Run Vitest in watch mode
```

Before publishing changes:

```bash
npm run typecheck
npm test
npm run build
```

## Source Contract Caveats

This SDK is generated from an OpenAPI specification, Swagger document, or extracted public API documentation. Generated types and behavior are only as complete as the source contract.

Review the SDK carefully when the source documentation has:

- Missing request or response schemas
- Ambiguous parameter serialization rules
- Incomplete authentication requirements
- Undocumented error response formats
- Inconsistent response examples
- Missing pagination semantics
- Undocumented content types, streaming, uploads, or downloads
- Vendor-specific OpenAPI extensions
- Polymorphic schemas without reliable discriminators

Treat the API provider's official documentation and observed API behavior as the final authority.

## AI Generation Notes

Some portions of this SDK may have been generated with assistance from AI-assisted contract analysis. AI is used to improve descriptions, naming, schema inference, documentation extraction, examples, and generation planning; it should not replace API-provider verification.

Before using this package in production, manually review:

1. **Endpoint coverage**  
   Confirm every generated operation, HTTP method, path, parameter, and status code against the API provider's current documentation.

2. **Inferred operations and schemas**  
   Any endpoint, property, authentication mechanism, pagination rule, or schema marked as inferred should be treated as an assumption until verified.

3. **Authentication behavior**  
   Verify header names, token formats, API key placement, scopes, OAuth flows, and per-operation security requirements.

4. **Request and response validation**  
   Enable `validateRequests` and `validateResponses` in development or staging to identify contract mismatches.

5. **Retry safety**  
   Confirm whether write operations are idempotent before opting into retries for `POST`, `PATCH`, or other unsafe methods.

6. **Error handling**  
   Validate error response parsing, provider-specific error codes, request ID headers, and rate-limit behavior.

7. **Pagination and uploads**  
   Confirm cursor semantics, page limits, continuation behavior, multipart field names, and binary response handling.

8. **Security**  
   Never include real credentials in source control, browser bundles, logs, generated examples, or error reports.

If the source API contract changes, regenerate the SDK and review the resulting diff before upgrading.