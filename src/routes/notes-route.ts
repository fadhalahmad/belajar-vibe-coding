import Elysia from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { notes } from "../db/schema";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidNoteBody(value: unknown): value is { title: string; content?: string } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.trim().length === 0) return false;
  if (obj.content !== undefined && obj.content !== null && typeof obj.content !== "string") {
    return false;
  }
  return true;
}

export const notesRoutes = new Elysia({ prefix: "/notes" })
  // GET /notes — daftar semua note
  .get("/", async () => {
    const rows = await db.select().from(notes);
    return { success: true as const, data: rows };
  })

  // GET /notes/:id — detail satu note
  .get("/:id", async ({ params, set }) => {
    const id = parseId(params.id);
    if (id === null) {
      set.status = 400;
      return { success: false as const, error: "id harus berupa angka positif" };
    }

    const [row] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
    if (!row) {
      set.status = 404;
      return { success: false as const, error: "Note tidak ditemukan" };
    }

    return { success: true as const, data: row };
  })

  // POST /notes — buat note baru
  .post("/", async ({ body, set }) => {
    // Validasi manual di dalam handler: Elysia 1.4 hanya menerima schema
    // typebox/Standard Schema di opsi `body`, bukan type guard function.
    if (!isValidNoteBody(body)) {
      set.status = 400;
      return {
        success: false as const,
        error: "Body tidak valid: 'title' wajib string tidak kosong, 'content' opsional string",
      };
    }

    const { title, content } = body;
    const [inserted] = await db
      .insert(notes)
      .values({ title: title.trim(), content: content ?? null })
      .$returningId();

    const [created] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, inserted.id))
      .limit(1);

    set.status = 201;
    return { success: true as const, data: created };
  })

  // DELETE /notes/:id — hapus note
  .delete("/:id", async ({ params, set }) => {
    const id = parseId(params.id);
    if (id === null) {
      set.status = 400;
      return { success: false as const, error: "id harus berupa angka positif" };
    }

    const [result] = await db.delete(notes).where(eq(notes.id, id));
    if (result.affectedRows === 0) {
      set.status = 404;
      return { success: false as const, error: "Note tidak ditemukan" };
    }

    return { success: true as const, data: null };
  });
