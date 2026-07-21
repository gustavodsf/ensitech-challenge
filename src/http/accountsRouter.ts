import { Router } from "express";
import { AccountService } from "../services/AccountService";
import { asyncHandler } from "./asyncHandler";
import { createAccountSchema } from "./validation";

export function createAccountsRouter(accountService: AccountService): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { balance } = createAccountSchema.parse(req.body);
      const account = accountService.createAccount(balance);
      res.status(201).json(account);
    })
  );

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.status(200).json(accountService.listAccounts());
    })
  );

  router.get(
    "/:accountId",
    asyncHandler(async (req, res) => {
      const account = accountService.getAccount(req.params.accountId);
      res.status(200).json(account);
    })
  );

  router.get(
    "/:accountId/ledger",
    asyncHandler(async (req, res) => {
      const ledger = accountService.getLedger(req.params.accountId);
      res.status(200).json(ledger);
    })
  );

  return router;
}
