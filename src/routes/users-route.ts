import Elysia from "elysia";
import { registerUser } from "../services/users-service";

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
  );
