import { z } from "zod";

export const createAccountSchema = z.object({
  balance: z
    .number({ invalid_type_error: "balance must be a number" })
    .nonnegative("balance must not be negative")
    .finite("balance must be a finite number"),
});

export const transferSchema = z.object({
  fromAccountId: z.string({ invalid_type_error: "fromAccountId must be a string" }).min(1, "fromAccountId is required"),
  toAccountId: z.string({ invalid_type_error: "toAccountId must be a string" }).min(1, "toAccountId is required"),
  amount: z
    .number({ invalid_type_error: "amount must be a number" })
    //.lt(Number(process.env.MAX_TRANSFER_AMOUNT), `amount must be less than ${process.env.MAX_TRANSFER_AMOUNT}`)
    .positive("amount must be greater than zero")
    .finite("amount must be a finite number"),
});
