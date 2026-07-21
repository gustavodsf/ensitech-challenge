import { v4 as uuidv4 } from "uuid";
import { InMemoryStore } from "../store/InMemoryStore";
import { Account } from "../domain/models";
import { NotFoundError } from "../domain/errors";

export class AccountService {
  constructor(private readonly store: InMemoryStore) {}

  createAccount(initialBalance: number): Account {
    const account: Account = {
      id: uuidv4(),
      balance: initialBalance,
      createdAt: new Date().toISOString(),
    };
    this.store.saveAccount(account);
    return account;
  }

  getAccount(accountId: string): Account {
    const account = this.store.getAccount(accountId);
    if (!account) {
      throw new NotFoundError(`Account '${accountId}' was not found`);
    }
    return account;
  }

  listAccounts(): Account[] {
    return this.store.listAccounts();
  }
}
