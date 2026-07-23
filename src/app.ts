import "dotenv/config";
import express, { Express } from "express";
import { InMemoryStore } from "./store/InMemoryStore";
import { AccountService } from "./services/AccountService";
import { TransferService } from "./services/TransferService";
import { createAccountsRouter } from "./http/accountsRouter";
import { createTransfersRouter } from "./http/transfersRouter";
import { errorHandler } from "./http/errorHandler";

/**
 * Builds the Express application.
 *
 * This factory is deliberately decoupled from how the app is *run*
 * (see server.ts for local execution, lambda.ts for AWS Lambda), so the
 * same routing/validation/business logic can be reused unchanged behind
 * API Gateway + Lambda later.
 */
export function createApp(store: InMemoryStore = new InMemoryStore()): Express {
  const app = express();
  app.use(express.json());

  const accountService = new AccountService(store);
  const transferService = new TransferService(store);

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.use("/accounts", createAccountsRouter(accountService));
  app.use("/transfers", createTransfersRouter(transferService));

  app.use((_req, res) => {
    res.status(404).json({ error: "NotFoundError", message: "Route not found" });
  });

  app.use(errorHandler);

  return app;
}
