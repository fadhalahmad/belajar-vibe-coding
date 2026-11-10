import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";

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

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "INVALID_CREDENTIALS" };

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<LoginResult> {
  // Normalisasi sama persis seperti registerUser, supaya email yang tersimpan
  // dengan lowercase tetap bisa dipakai login walau user mengetik huruf besar.
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  // 1. Cari user berdasarkan email.
  const [user] = await db
    .select({ id: users.id, password: users.password })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // 2. Email tidak terdaftar → hasil sama dengan password salah, supaya
  //    tidak membocorkan email mana yang terdaftar (user enumeration).
  if (!user) {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  // 3. Verifikasi password terhadap hash hasil registrasi (async, bukan compareSync).
  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  // 4. Generate token session dan simpan. Plaintext password tidak pernah disimpan.
  const token = crypto.randomUUID();
  await db.insert(sessions).values({ token, userId: user.id });

  return { ok: true, token };
}
