import { Router } from "express";
import { TransferService } from "../services/TransferService";
import { asyncHandler } from "./asyncHandler";
import { transferSchema } from "./validation";

export function createTransfersRouter(transferService: TransferService): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { fromAccountId, toAccountId, amount } = transferSchema.parse(req.body);
      const transfer = transferService.transfer(fromAccountId, toAccountId, amount);
      res.status(201).json(transfer);
    })
  );

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.status(200).json(transferService.listTransfers());
    })
  );

  return router;
}
