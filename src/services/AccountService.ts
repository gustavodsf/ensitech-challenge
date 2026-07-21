import { v4 as uuidv4 } from "uuid";
import { InMemoryStore } from "../store/InMemoryStore";
import { Account, LedgerEntry } from "../domain/models";
import { NotFoundError } from "../domain/errors";

export class AccountService {
  constructor(private readonly store: InMemoryStore) {}

  createAccount(initialBalance: number): Account {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    this.store.saveAccountMeta({ id, createdAt });

    const openingEntry: LedgerEntry = {
      id: uuidv4(),
      accountId: id,
      type: "CREDIT",
      amount: initialBalance,
      balanceAfter: initialBalance,
      reason: "INITIAL_DEPOSIT",
      createdAt,
    };
    this.store.appendLedgerEntry(openingEntry);

    return { id, balance: initialBalance, createdAt };
  }

  getAccount(accountId: string): Account {
    const meta = this.store.getAccountMeta(accountId);
    if (!meta) {
      throw new NotFoundError(`Account '${accountId}' was not found`);
    }
    return { id: meta.id, balance: this.store.getBalance(accountId), createdAt: meta.createdAt };
  }

  listAccounts(): Account[] {
    return this.store
      .listAccountMetas()
      .map((meta) => ({ id: meta.id, balance: this.store.getBalance(meta.id), createdAt: meta.createdAt }));
  }

  /** Returns the full, chronological ledger of balance movements for an account. */
  getLedger(accountId: string): LedgerEntry[] {
    if (!this.store.getAccountMeta(accountId)) {
      throw new NotFoundError(`Account '${accountId}' was not found`);
    }
    return this.store.getLedgerEntries(accountId);
  }
}
