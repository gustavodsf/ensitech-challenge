import serverlessHttp from "serverless-http";
import { createApp } from "./app";

/**
 * AWS Lambda entry point.
 *
 * Wraps the same Express app used locally so the business logic and
 * routing are identical in both environments. This handler can be attached
 * to an API Gateway (HTTP API or REST API) proxy integration.
 *
 * NOTE: the in-memory store is re-created on cold start and is NOT shared
 * across concurrent Lambda invocations/instances. See README for how to
 * swap InMemoryStore for a DynamoDB-backed implementation before using this
 * in production.
 */
const app = createApp();

export const handler = serverlessHttp(app);
