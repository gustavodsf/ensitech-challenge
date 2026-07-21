import { v4 as uuidv4 } from "uuid";
import { InMemoryStore } from "../store/InMemoryStore";
import { Transfer } from "../domain/models";
import { NotFoundError, ValidationError } from "../domain/errors";

export class TransferService {
  constructor(private readonly store: InMemoryStore) {}

  /**
   * Transfers `amount` from `fromAccountId` to `toAccountId`.
   *
   * The validation, balance checks, and balance mutation happen in a single
   * synchronous block (no `await` in between), so no other request can be
   * interleaved mid-transfer on Node's single-threaded event loop. This is
   * what keeps the balance updates consistent without needing explicit locks.
   */
  transfer(fromAccountId: string, toAccountId: string, amount: number): Transfer {
    if (fromAccountId === toAccountId) {
      throw new ValidationError("Cannot transfer to the same account");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError("Transfer amount must be a positive number");
    }

    const fromAccount = this.store.getAccount(fromAccountId);
    if (!fromAccount) {
      throw new NotFoundError(`Account '${fromAccountId}' was not found`);
    }

    const toAccount = this.store.getAccount(toAccountId);
    if (!toAccount) {
      throw new NotFoundError(`Account '${toAccountId}' was not found`);
    }

    if (fromAccount.balance < amount) {
      throw new ValidationError(
        `Account '${fromAccountId}' has insufficient funds for this transfer`
      );
    }

    fromAccount.balance -= amount;
    toAccount.balance += amount;
    this.store.saveAccount(fromAccount);
    this.store.saveAccount(toAccount);

    const transfer: Transfer = {
      id: uuidv4(),
      fromAccountId,
      toAccountId,
      amount,
      createdAt: new Date().toISOString(),
    };
    this.store.saveTransfer(transfer);
    return transfer;
  }

  listTransfers(): Transfer[] {
    return this.store.listTransfers();
  }
}
