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
