import { AccountMeta, LedgerEntry, Transfer } from "../domain/models";

/**
 * A simple in-memory datastore for accounts, their ledger entries, and
 * transfers.
 *
 * Balances are never stored or mutated directly. Instead, every balance
 * change (an initial deposit, or one leg of a transfer) is appended as an
 * immutable `LedgerEntry`, and an account's current balance is simply the
 * `balanceAfter` of its most recent entry. This keeps a full history of how
 * each balance was reached, which is what `GET /accounts/:id/ledger`
 * exposes.
 *
 * This is intentionally the only place in the codebase that knows about the
 * storage mechanism. Swapping this class for a DynamoDB-backed
 * implementation (see README's AWS deployment proposal) is the only change
 * needed to persist data, as long as the same method signatures are
 * preserved.
 *
 * Note on concurrency: Node.js executes JavaScript on a single thread, so as
 * long as a "read-check-write" sequence (e.g. in TransferService) does not
 * await anything in between the read and the write, the operations here are
 * effectively atomic with respect to other requests. All methods below are
 * synchronous by design to preserve that guarantee.
 */
export class InMemoryStore {
  private readonly accounts = new Map<string, AccountMeta>();
  private readonly ledgerByAccount = new Map<string, LedgerEntry[]>();
  private readonly transfers: Transfer[] = [];

  saveAccountMeta(meta: AccountMeta): void {
    this.accounts.set(meta.id, meta);
  }

  getAccountMeta(id: string): AccountMeta | undefined {
    return this.accounts.get(id);
  }

  listAccountMetas(): AccountMeta[] {
    return Array.from(this.accounts.values());
  }

  appendLedgerEntry(entry: LedgerEntry): void {
    const entries = this.ledgerByAccount.get(entry.accountId) ?? [];
    entries.push(entry);
    this.ledgerByAccount.set(entry.accountId, entries);
  }

  /** Returns the account's current balance, or 0 if it has no entries yet. */
  getBalance(accountId: string): number {
    const entries = this.ledgerByAccount.get(accountId);
    if (!entries || entries.length === 0) {
      return 0;
    }
    return entries[entries.length - 1].balanceAfter;
  }

  getLedgerEntries(accountId: string): LedgerEntry[] {
    return [...(this.ledgerByAccount.get(accountId) ?? [])];
  }

  saveTransfer(transfer: Transfer): void {
    this.transfers.push(transfer);
  }

  listTransfers(): Transfer[] {
    return [...this.transfers];
  }
}
