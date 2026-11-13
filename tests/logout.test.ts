import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { sessions } from "../src/db/schema";
import {
  authHeader,
  createSession,
  json,
  makeUser,
  postJson,
  request,
  resetData,
} from "./helpers";

async function logout(token: string | null): Promise<Response> {
  return request("/api/users/logout", {
    method: "DELETE",
    headers: token === null ? {} : authHeader(token),
  });
}

describe("DELETE /api/users/logout", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("token valid mengembalikan 200 { data: 'ok' }", async () => {
    const { token } = await createSession();

    const response = await logout(token);
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body).toEqual({ data: "ok" });
    expect(body.success).toBeUndefined();
  });

  test("session dengan token tersebut terhapus dari database", async () => {
    const { token } = await createSession();

    await logout(token);

    const rows = await db.select().from(sessions).where(eq(sessions.token, token));
    expect(rows).toHaveLength(0);
  });

  test("setelah logout, token yang sama ke current mengembalikan 401", async () => {
    const { token } = await createSession();

    await logout(token);

    const response = await request("/api/users/current", {
      headers: authHeader(token),
    });
    expect(response.status).toBe(401);
  });

  test("logout dua kali: yang kedua 401", async () => {
    const { token } = await createSession();

    expect((await logout(token)).status).toBe(200);
    expect((await logout(token)).status).toBe(401);
  });

  test("logout hanya menghapus satu session, session lain tetap dipakai", async () => {
    const user = makeUser();
    const { token: tokenA } = await createSession(user);

    const loginAgain = await postJson("/api/users/login", {
      email: user.email,
      password: user.password,
    });
    const tokenB = (await json<{ data: string }>(loginAgain)).data;

    await logout(tokenA);

    const response = await request("/api/users/current", {
      headers: authHeader(tokenB),
    });
    expect(response.status).toBe(200);
  });

  test("logout token satu user tidak memengaruhi session user lain", async () => {
    const first = await createSession({
      email: "logout-satu@localhost",
      name: "satu",
      password: "rahasia",
    });
    const second = await createSession({
      email: "logout-dua@localhost",
      name: "dua",
      password: "rahasia",
    });

    await logout(first.token);

    const response = await request("/api/users/current", {
      headers: authHeader(second.token),
    });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.data.email).toBe("logout-dua@localhost");
  });

  test("tanpa header Authorization mengembalikan 401", async () => {
    const response = await logout(null);
    expect(response.status).toBe(401);

    const body = await json(response);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  test("header tanpa Bearer mengembalikan 401 dengan body identik", async () => {
    const { token } = await createSession();

    const response = await request("/api/users/logout", {
      method: "DELETE",
      headers: { Authorization: token },
    });
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Unauthorized" });
  });

  test("token tidak dikenal mengembalikan 401 dengan body identik", async () => {
    const response = await logout("token-tidak-ada");
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Unauthorized" });
  });

  test("kata bearer huruf kecil tetap diterima", async () => {
    const { token } = await createSession();

    const response = await request("/api/users/logout", {
      method: "DELETE",
      headers: { Authorization: `bearer ${token}` },
    });
    expect(response.status).toBe(200);
  });

  test("method POST atau GET ke path ini mengembalikan 404", async () => {
    expect(
      (await request("/api/users/logout", { method: "POST" })).status
    ).toBe(404);
    expect(
      (await request("/api/users/logout", { method: "GET" })).status
    ).toBe(404);
  });
});
