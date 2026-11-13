import { db } from "../src/db/client";
import { notes, sessions, users } from "../src/db/schema";
import { app } from "../src/app";

/**
 * Membersihkan seluruh data uji. Urutan menghormati foreign key:
 * `sessions` harus dihapus sebelum `users`.
 */
export async function resetData(): Promise<void> {
  await db.delete(sessions);
  await db.delete(notes);
  await db.delete(users);
}

export type TestUser = { name: string; email: string; password: string };

/** User uji dengan nilai default yang bisa ditimpa sebagian. */
export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    name: "user uji",
    email: "user-uji@localhost",
    password: "rahasia",
    ...overrides,
  };
}

/** Panggil endpoint aplikasi tanpa server HTTP. */
export async function request(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

export async function postJson(path: string, body: unknown): Promise<Response> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function json<T = any>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Registrasi user uji. Melempar error kalau gagal, supaya setup test jelas. */
export async function registerTestUser(user: TestUser): Promise<void> {
  const response = await postJson("/api/users", user);
  if (response.status !== 201) {
    throw new Error(
      `Registrasi user uji gagal: ${response.status} ${await response.text()}`
    );
  }
}

/** Registrasi + login, mengembalikan token session. */
export async function createSession(
  user: TestUser = makeUser()
): Promise<{ user: TestUser; token: string }> {
  await registerTestUser(user);
  const response = await postJson("/api/users/login", {
    email: user.email,
    password: user.password,
  });
  if (response.status !== 200) {
    throw new Error(
      `Login user uji gagal: ${response.status} ${await response.text()}`
    );
  }
  const body = await json<{ data: string }>(response);
  return { user, token: body.data };
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
