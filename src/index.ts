/**
 * Public entry point for the generated SDK.
 *
 * Import the generated client and supporting types from this module:
 *
 * @example
 * ```ts
 * import { ApiClient, ApiError, type ApiClientConfig } from "@example/api-sdk";
 *
 * const client = new ApiClient({
 *   baseUrl: "https://api.example.com",
 *   apiKey: process.env.EXAMPLE_API_KEY,
 * });
 * ```
 *
 * The concrete client class name may be customized during SDK generation.
 */

export * from "./client";
export * from "./config";
export * from "./errors";
export * from "./http";
export * from "./types";
export * from "./schemas";
export * from "./resources";
export * from "./utils/retry";