import { Account, Transfer } from "../domain/models";

/**
 * A simple in-memory datastore for accounts and transfers.
 *
 * This is intentionally the only place in the codebase that knows about the
 * storage mechanism. Swapping this class for a DynamoDB-backed implementation
 * (see README's AWS deployment proposal) is the only change needed to
 * persist data, as long as the same method signatures are preserved.
 *
 * Note on concurrency: Node.js executes JavaScript on a single thread, so as
 * long as a "read-check-write" sequence (e.g. in TransferService) does not
 * await anything in between the read and the write, the operations here are
 * effectively atomic with respect to other requests. All methods below are
 * synchronous by design to preserve that guarantee.
 */
export class InMemoryStore {
  private readonly accounts = new Map<string, Account>();
  private readonly transfers: Transfer[] = [];

  saveAccount(account: Account): void {
    this.accounts.set(account.id, account);
  }

  getAccount(id: string): Account | undefined {
    return this.accounts.get(id);
  }

  listAccounts(): Account[] {
    return Array.from(this.accounts.values());
  }

  saveTransfer(transfer: Transfer): void {
    this.transfers.push(transfer);
  }

  listTransfers(): Transfer[] {
    return [...this.transfers];
  }
}
