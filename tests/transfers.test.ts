import request from "supertest";
import { Express } from "express";
import { createApp } from "../src/app";

async function createAccount(app: Express, balance: number): Promise<string> {
  const res = await request(app).post("/accounts").send({ balance });
  return res.body.id;
}

describe("Transfers API", () => {
  it("transfers funds between two existing accounts and updates balances", async () => {
    const app = createApp();
    const fromId = await createAccount(app, 100);
    const toId = await createAccount(app, 50);

    const res = await request(app)
      .post("/transfers")
      .send({ fromAccountId: fromId, toAccountId: toId, amount: 30 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ fromAccountId: fromId, toAccountId: toId, amount: 30 });

    const fromAccount = await request(app).get(`/accounts/${fromId}`);
    const toAccount = await request(app).get(`/accounts/${toId}`);
    expect(fromAccount.body.balance).toBe(70);
    expect(toAccount.body.balance).toBe(80);
  });

  it("rejects a transfer when the source account does not exist", async () => {
    const app = createApp();
    const toId = await createAccount(app, 50);

    const res = await request(app)
      .post("/transfers")
      .send({ fromAccountId: "missing-account", toAccountId: toId, amount: 10 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NotFoundError");
  });

  it("rejects a transfer when the destination account does not exist", async () => {
    const app = createApp();
    const fromId = await createAccount(app, 50);

    const res = await request(app)
      .post("/transfers")
      .send({ fromAccountId: fromId, toAccountId: "missing-account", amount: 10 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NotFoundError");
  });

  it("rejects a transfer with insufficient funds", async () => {
    const app = createApp();
    const fromId = await createAccount(app, 10);
    const toId = await createAccount(app, 0);

    const res = await request(app)
      .post("/transfers")
      .send({ fromAccountId: fromId, toAccountId: toId, amount: 20 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("rejects a transfer with a negative amount", async () => {
    const app = createApp();
    const fromId = await createAccount(app, 100);
    const toId = await createAccount(app, 0);

    const res = await request(app)
      .post("/transfers")
      .send({ fromAccountId: fromId, toAccountId: toId, amount: -10 });

    expect(res.status).toBe(400);
  });

  it("rejects a transfer with a zero amount", async () => {
    const app = createApp();
    const fromId = await createAccount(app, 100);
    const toId = await createAccount(app, 0);

    const res = await request(app)
      .post("/transfers")
      .send({ fromAccountId: fromId, toAccountId: toId, amount: 0 });

    expect(res.status).toBe(400);
  });

  it("rejects a transfer to the same account", async () => {
    const app = createApp();
    const accountId = await createAccount(app, 100);

    const res = await request(app)
      .post("/transfers")
      .send({ fromAccountId: accountId, toAccountId: accountId, amount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/same account/i);
  });

  it("lists all transfers made", async () => {
    const app = createApp();
    const fromId = await createAccount(app, 100);
    const toId = await createAccount(app, 0);

    await request(app).post("/transfers").send({ fromAccountId: fromId, toAccountId: toId, amount: 25 });

    const res = await request(app).get("/transfers");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ fromAccountId: fromId, toAccountId: toId, amount: 25 });
  });
});
