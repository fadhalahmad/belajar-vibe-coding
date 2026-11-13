import { beforeEach, describe, expect, test } from "bun:test";
import {
  authHeader,
  createSession,
  json,
  request,
  resetData,
} from "./helpers";

describe("GET /api/users/current", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("token valid mengembalikan data user yang login", async () => {
    const { user, token } = await createSession();

    const response = await request("/api/users/current", {
      headers: authHeader(token),
    });
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.success).toBeUndefined();
    expect(body.data.name).toBe(user.name);
    expect(body.data.email).toBe(user.email);
  });

  test("response hanya berisi id, name, email, created_at tanpa password", async () => {
    const { token } = await createSession();

    const response = await request("/api/users/current", {
      headers: authHeader(token),
    });
    const body = await json(response);

    expect(Object.keys(body.data).sort()).toEqual(
      ["created_at", "email", "id", "name"].sort()
    );
    expect(body.data.password).toBeUndefined();
  });

  test("token user lain mengembalikan user yang berbeda", async () => {
    const first = await createSession({
      name: "user satu",
      email: "satu@localhost",
      password: "rahasia",
    });
    const second = await createSession({
      name: "user dua",
      email: "dua@localhost",
      password: "rahasia",
    });

    const response = await request("/api/users/current", {
      headers: authHeader(second.token),
    });
    const body = await json(response);

    expect(body.data.email).toBe("dua@localhost");
    expect(body.data.email).not.toBe(first.user.email);
  });

  test("tanpa header Authorization mengembalikan 401", async () => {
    const response = await request("/api/users/current");
    expect(response.status).toBe(401);

    const body = await json(response);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  test("header tanpa Bearer mengembalikan 401 dengan body identik", async () => {
    const { token } = await createSession();

    const response = await request("/api/users/current", {
      headers: { Authorization: token },
    });
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Unauthorized" });
  });

  test("Bearer tanpa token mengembalikan 401 dengan body identik", async () => {
    const response = await request("/api/users/current", {
      headers: { Authorization: "Bearer" },
    });
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Unauthorized" });
  });

  test("token tidak dikenal mengembalikan 401 dengan body identik", async () => {
    const response = await request("/api/users/current", {
      headers: { Authorization: "Bearer token-tidak-ada" },
    });
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Unauthorized" });
  });

  test("kata bearer huruf kecil tetap diterima", async () => {
    const { token } = await createSession();

    const response = await request("/api/users/current", {
      headers: { Authorization: `bearer ${token}` },
    });
    expect(response.status).toBe(200);
  });

  test("method POST ke path ini mengembalikan 404", async () => {
    const response = await request("/api/users/current", { method: "POST" });
    expect(response.status).toBe(404);
  });
});
