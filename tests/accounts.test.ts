import request from "supertest";
import { createApp } from "../src/app";

describe("Accounts API", () => {
  const app = createApp();

  it("creates an account with a valid initial balance", async () => {
    const res = await request(app).post("/accounts").send({ balance: 100 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ balance: 100 });
    expect(res.body.id).toBeDefined();
  });

  it("creates an account with a zero balance", async () => {
    const res = await request(app).post("/accounts").send({ balance: 0 });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(0);
  });

  it("rejects a negative initial balance", async () => {
    const res = await request(app).post("/accounts").send({ balance: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("rejects a non-numeric balance", async () => {
    const res = await request(app).post("/accounts").send({ balance: "abc" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing balance", async () => {
    const res = await request(app).post("/accounts").send({});
    expect(res.status).toBe(400);
  });

  it("retrieves an existing account by id", async () => {
    const created = await request(app).post("/accounts").send({ balance: 250 });
    const res = await request(app).get(`/accounts/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: created.body.id, balance: 250 });
  });

  it("returns 404 for an unknown account id", async () => {
    const res = await request(app).get("/accounts/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NotFoundError");
  });

  it("lists all created accounts", async () => {
    const listApp = createApp();
    await request(listApp).post("/accounts").send({ balance: 10 });
    await request(listApp).post("/accounts").send({ balance: 20 });

    const res = await request(listApp).get("/accounts");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});
