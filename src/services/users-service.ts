import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";

const BCRYPT_COST = 10;

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: "EMAIL_TAKEN" };

function isDuplicateEntryError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code } = error as { code?: unknown };
  return code === "ER_DUP_ENTRY" || code === 1062;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  // 1. Cek email sudah terdaftar — sebelum hash, karena hashing mahal.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return { ok: false, reason: "EMAIL_TAKEN" };
  }

  // 2. Hash password (async, cost 10). Plaintext tidak pernah disimpan.
  const hash = await bcrypt.hash(password, BCRYPT_COST);

  // 3. Insert. ER_DUP_ENTRY menangani race condition yang lolos cek di langkah 1.
  try {
    await db.insert(users).values({ name, email, password: hash });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { ok: false, reason: "EMAIL_TAKEN" };
    }
    throw error;
  }

  return { ok: true };
}
