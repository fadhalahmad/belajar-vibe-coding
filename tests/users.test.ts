import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { sessions, users } from "../src/db/schema";
import { json, makeUser, postJson, registerTestUser, resetData } from "./helpers";

describe("POST /api/users", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("registrasi valid mengembalikan 201 { data: 'OK' } tanpa success", async () => {
    const user = makeUser();

    const response = await postJson("/api/users", user);
    expect(response.status).toBe(201);

    const body = await json(response);
    expect(body).toEqual({ data: "OK" });
    expect(body.success).toBeUndefined();
  });

  test("user benar-benar tersimpan di database", async () => {
    const user = makeUser();

    await postJson("/api/users", user);

    const rows = await db.select().from(users).where(eq(users.email, user.email));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(user.name);
  });

  test("password disimpan sebagai hash bcrypt, bukan plaintext", async () => {
    const user = makeUser({ password: "rahasia-plain" });

    await postJson("/api/users", user);

    const [row] = await db.select().from(users).where(eq(users.email, user.email));
    expect(row.password).not.toBe("rahasia-plain");
    expect(row.password).toMatch(/^\$2[aby]\$/);
  });

  test("email duplikat mengembalikan 409", async () => {
    const user = makeUser();
    await registerTestUser(user);

    const response = await postJson("/api/users", user);
    expect(response.status).toBe(409);

    const body = await json(response);
    expect(body).toEqual({ error: "Email sudah terdaftar" });
  });

  test("email duplikat dengan huruf besar/kecil berbeda tetap 409", async () => {
    await registerTestUser(makeUser({ email: "duplikat@localhost" }));

    const response = await postJson(
      "/api/users",
      makeUser({ email: "DUPLIKAT@LOCALHOST", name: "lain" })
    );
    expect(response.status).toBe(409);
  });

  test("name di-trim dan email disimpan huruf kecil", async () => {
    const response = await postJson("/api/users", {
      name: "  fadhal  ",
      email: "Fadhal@LocalHost",
      password: "rahasia",
    });
    expect(response.status).toBe(201);

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, "fadhal@localhost"));
    expect(row.name).toBe("fadhal");
    expect(row.email).toBe("fadhal@localhost");
  });

  test("body tidak lengkap mengembalikan 400", async () => {
    expect((await postJson("/api/users", { name: "a" })).status).toBe(400);
    expect((await postJson("/api/users", { email: "a@b.c" })).status).toBe(400);
    expect((await postJson("/api/users", { password: "x" })).status).toBe(400);
  });

  test("name kosong atau hanya spasi mengembalikan 400", async () => {
    expect(
      (await postJson("/api/users", makeUser({ name: "" }))).status
    ).toBe(400);
    expect(
      (await postJson("/api/users", makeUser({ name: "   " }))).status
    ).toBe(400);
  });

  test("password kosong mengembalikan 400", async () => {
    expect(
      (await postJson("/api/users", makeUser({ password: "" }))).status
    ).toBe(400);
  });

  test("field bertipe salah mengembalikan 400", async () => {
    const response = await postJson("/api/users", {
      name: 123,
      email: "a@b.c",
      password: "x",
    });
    expect(response.status).toBe(400);

    const body = await json(response);
    expect(body.error).toContain("Body tidak valid");
  });

  test("response tidak mengandung data user atau password", async () => {
    const response = await postJson("/api/users", makeUser({ password: "rahasia-x" }));
    const text = await response.text();

    expect(text).not.toContain("rahasia-x");
    expect(text).not.toContain("password");
  });
});

describe("POST /api/users/login", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("kredensial benar mengembalikan 200 dengan token", async () => {
    const user = makeUser();
    await registerTestUser(user);

    const response = await postJson("/api/users/login", {
      email: user.email,
      password: user.password,
    });
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(typeof body.data).toBe("string");
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.success).toBeUndefined();
  });

  test("token tersimpan di sessions dan terhubung ke user yang benar", async () => {
    const user = makeUser();
    await registerTestUser(user);

    const response = await postJson("/api/users/login", {
      email: user.email,
      password: user.password,
    });
    const { data: token } = await json(response);

    const [userRow] = await db.select().from(users).where(eq(users.email, user.email));
    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token));

    expect(sessionRow).toBeDefined();
    expect(sessionRow.userId).toBe(userRow.id);
  });

  test("password salah mengembalikan 401", async () => {
    const user = makeUser();
    await registerTestUser(user);

    const response = await postJson("/api/users/login", {
      email: user.email,
      password: "salah",
    });
    expect(response.status).toBe(401);

    const body = await json(response);
    expect(body).toEqual({ error: "Email dan password salah" });
  });

  test("email tidak terdaftar memberi pesan yang sama dengan password salah", async () => {
    const response = await postJson("/api/users/login", {
      email: "tidak-ada@localhost",
      password: "apa-saja",
    });
    expect(response.status).toBe(401);

    const body = await json(response);
    expect(body).toEqual({ error: "Email dan password salah" });
  });

  test("email dengan huruf besar tetap bisa login", async () => {
    const user = makeUser({ email: "huruf@localhost" });
    await registerTestUser(user);

    const response = await postJson("/api/users/login", {
      email: "HURUF@LOCALHOST",
      password: user.password,
    });
    expect(response.status).toBe(200);
  });

  test("body tidak lengkap mengembalikan 400", async () => {
    expect((await postJson("/api/users/login", { email: "a@b.c" })).status).toBe(400);
    expect((await postJson("/api/users/login", { password: "x" })).status).toBe(400);
  });

  test("login dua kali menghasilkan dua token dan dua session", async () => {
    const user = makeUser();
    await registerTestUser(user);

    const first = await postJson("/api/users/login", {
      email: user.email,
      password: user.password,
    });
    const second = await postJson("/api/users/login", {
      email: user.email,
      password: user.password,
    });

    const tokenA = (await json(first)).data;
    const tokenB = (await json(second)).data;
    expect(tokenA).not.toBe(tokenB);

    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(2);
  });

  test("response tidak mengandung password atau hash", async () => {
    const user = makeUser({ password: "password-unik-123" });
    await registerTestUser(user);

    const response = await postJson("/api/users/login", {
      email: user.email,
      password: user.password,
    });
    const text = await response.text();

    expect(text).not.toContain("password-unik-123");
    expect(text).not.toContain("password");
  });
});
