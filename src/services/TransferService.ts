import { v4 as uuidv4 } from "uuid";
import { InMemoryStore } from "../store/InMemoryStore";
import { LedgerEntry, Transfer } from "../domain/models";
import { NotFoundError, ValidationError } from "../domain/errors";

export class TransferService {
  constructor(private readonly store: InMemoryStore) {}

  /**
   * Transfers `amount` from `fromAccountId` to `toAccountId`.
   *
   * Rather than mutating a `balance` field, this appends one DEBIT ledger
   * entry to the source account and one CREDIT entry to the destination
   * account, both tagged with the same `transferId` so the movement can be
   * traced from either account's ledger. The validation, balance reads, and
   * ledger writes happen in a single synchronous block (no `await` in
   * between), so no other request can be interleaved mid-transfer on
   * Node's single-threaded event loop. This is what keeps the derived
   * balances consistent without needing explicit locks.
   */
  transfer(fromAccountId: string, toAccountId: string, amount: number): Transfer {

    if(process.env.MAX_TRANSFER_AMOUNT && amount > Number(process.env.MAX_TRANSFER_AMOUNT)) {
      throw new ValidationError(`Transfer amount must be less than U$ ${process.env.MAX_TRANSFER_AMOUNT}`);
    }

    if (fromAccountId === toAccountId) {
      throw new ValidationError("Cannot transfer to the same account");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError("Transfer amount must be a positive number");
    }

    const fromMeta = this.store.getAccountMeta(fromAccountId);
    if (!fromMeta) {
      throw new NotFoundError(`Account '${fromAccountId}' was not found`);
    }

    const toMeta = this.store.getAccountMeta(toAccountId);
    if (!toMeta) {
      throw new NotFoundError(`Account '${toAccountId}' was not found`);
    }

    const fromBalance = this.store.getBalance(fromAccountId);
    if (fromBalance < amount) {
      throw new ValidationError(
        `Account '${fromAccountId}' has insufficient funds for this transfer`
      );
    }
    const toBalance = this.store.getBalance(toAccountId);

    const transferId = uuidv4();
    const createdAt = new Date().toISOString();

    const debitEntry: LedgerEntry = {
      id: uuidv4(),
      accountId: fromAccountId,
      type: "DEBIT",
      amount,
      balanceAfter: fromBalance - amount,
      reason: "TRANSFER",
      transferId,
      createdAt,
    };
    const creditEntry: LedgerEntry = {
      id: uuidv4(),
      accountId: toAccountId,
      type: "CREDIT",
      amount,
      balanceAfter: toBalance + amount,
      reason: "TRANSFER",
      transferId,
      createdAt,
    };
    this.store.appendLedgerEntry(debitEntry);
    this.store.appendLedgerEntry(creditEntry);

    const transfer: Transfer = {
      id: transferId,
      fromAccountId,
      toAccountId,
      amount,
      createdAt,
    };
    this.store.saveTransfer(transfer);
    return transfer;
  }

  listTransfers(): Transfer[] {
    return this.store.listTransfers();
  }
  
  getTransferByFromAccountId(id: string): Transfer[] {
    const transfer = this.store.getTransferByFromAccountId(id);
    if (!transfer || transfer.length === 0) {
      throw new NotFoundError(`Using account id '${id}' was not found a transfer`);
    }
    return transfer;
  }
}
