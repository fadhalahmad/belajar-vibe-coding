import Elysia from "elysia";
import {
  getCurrentUser,
  loginUser,
  registerUser,
} from "../services/users-service";

function isValidRegisterBody(
  value: unknown
): value is { name: string; email: string; password: string } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.trim().length === 0) return false;
  if (typeof obj.email !== "string" || obj.email.trim().length === 0) return false;
  if (typeof obj.password !== "string" || obj.password.trim().length === 0) return false;
  return true;
}

function isValidLoginBody(
  value: unknown
): value is { email: string; password: string } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.email !== "string" || obj.email.trim().length === 0) return false;
  if (typeof obj.password !== "string" || obj.password.trim().length === 0) return false;
  return true;
}

// Terima "Bearer <token>" dengan "Bearer" case-insensitive. Mengembalikan null
// untuk bentuk apa pun yang tidak valid, supaya route tinggal cek null → 401.
function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export const usersRoutes = new Elysia({ prefix: "/api" })
  // POST /api/users — registrasi user baru
  .post(
    "/users",
    async ({ body, set }) => {
      const result = await registerUser({
        name: body.name,
        email: body.email,
        password: body.password,
      });

      if (!result.ok) {
        set.status = 409;
        return { error: "Email sudah terdaftar" };
      }

      set.status = 201;
      return { data: "OK" };
    },
    {
      body: isValidRegisterBody,
      error: ({ set }) => {
        set.status = 400;
        return {
          error:
            "Body tidak valid: 'name', 'email', dan 'password' wajib string tidak kosong",
        };
      },
    }
  )

  // POST /api/users/login — login user, mengembalikan token session
  .post(
    "/users/login",
    async ({ body, set }) => {
      const result = await loginUser({
        email: body.email,
        password: body.password,
      });

      if (!result.ok) {
        set.status = 401;
        return { error: "Email dan password salah" };
      }

      set.status = 200;
      return { data: result.token };
    },
    {
      body: isValidLoginBody,
      error: ({ set }) => {
        set.status = 400;
        return {
          error:
            "Body tidak valid: 'email' dan 'password' wajib string tidak kosong",
        };
      },
    }
  )

  // GET /api/users/current — data user yang sedang login (butuh token)
  .get("/users/current", async ({ headers, set }) => {
    try {
      const token = parseBearerToken(headers.authorization);

      // Header hilang, format salah, atau token tidak dikenal → 401 yang sama.
      if (!token) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const result = await getCurrentUser(token);

      if (!result.ok) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      set.status = 200;
      return {
        data: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          created_at: result.user.createdAt,
        },
      };
    } catch (error) {
      console.error("[GET /api/users/current]", error);
      set.status = 500;
      return { error: "Terjadi kesalahan pada server" };
    }
  });
