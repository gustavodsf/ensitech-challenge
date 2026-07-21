export interface AccountMeta {
  id: string;
  createdAt: string;
}

export interface Account {
  id: string;
  balance: number;
  createdAt: string;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  createdAt: string;
}

export type LedgerEntryType = "CREDIT" | "DEBIT";

/**
 * An immutable ledger entry recording a single balance movement on one
 * account. Account balances are never mutated directly; they are derived
 * by looking at the `balanceAfter` of an account's most recent entry. This
 * gives every account a full, append-only audit trail of how its balance
 * came to be, instead of just the current number.
 */
export interface LedgerEntry {
  id: string;
  accountId: string;
  type: LedgerEntryType;
  amount: number;
  balanceAfter: number;
  reason: "INITIAL_DEPOSIT" | "TRANSFER";
  transferId?: string;
  createdAt: string;
}
