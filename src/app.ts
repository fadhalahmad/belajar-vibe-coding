import { Elysia } from "elysia";
import { notesRoutes } from "./routes/notes-route";
import { usersRoutes } from "./routes/users-route";

export const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { success: false, error: "Endpoint tidak ditemukan" };
    }

    console.error(`[${code}]`, error);
    set.status = code === "VALIDATION" ? 400 : 500;
    return { success: false, error: "Terjadi kesalahan pada server" };
  })
  .get("/", () => ({ success: true, data: { name: "belajar-vibe-coding", status: "ok" } }))
  .get("/health", () => ({ success: true, data: { status: "ok" } }))
  .use(notesRoutes)
  .use(usersRoutes);
