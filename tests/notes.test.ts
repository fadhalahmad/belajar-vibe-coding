import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { notes } from "../src/db/schema";
import { json, postJson, request, resetData } from "./helpers";

async function insertNote(title: string, content: string | null = null) {
  const [inserted] = await db.insert(notes).values({ title, content }).$returningId();
  return inserted.id;
}

describe("GET /notes", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("mengembalikan array kosong saat tabel kosong", async () => {
    const response = await request("/notes");
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test("mengembalikan semua note yang ada", async () => {
    await insertNote("satu");
    await insertNote("dua", "isi dua");

    const response = await request("/notes");
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((n: any) => n.title).sort()).toEqual(["dua", "satu"]);
  });
});

describe("GET /notes/:id", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("mengembalikan note yang ada", async () => {
    const id = await insertNote("judul", "isi");

    const response = await request(`/notes/${id}`);
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(id);
    expect(body.data.title).toBe("judul");
    expect(body.data.content).toBe("isi");
  });

  test("mengembalikan 404 untuk id yang tidak ada", async () => {
    const response = await request("/notes/999999");
    expect(response.status).toBe(404);

    const body = await json(response);
    expect(body.success).toBe(false);
  });

  test("mengembalikan 400 untuk id bukan angka", async () => {
    const response = await request("/notes/abc");
    expect(response.status).toBe(400);

    const body = await json(response);
    expect(body.success).toBe(false);
  });

  test("mengembalikan 400 untuk id nol atau negatif", async () => {
    expect((await request("/notes/0")).status).toBe(400);
    expect((await request("/notes/-1")).status).toBe(400);
  });
});

describe("POST /notes", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("membuat note dengan title saja", async () => {
    const response = await postJson("/notes", { title: "judul" });
    expect(response.status).toBe(201);

    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("judul");
    expect(body.data.content).toBeNull();

    const [row] = await db.select().from(notes).where(eq(notes.id, body.data.id));
    expect(row).toBeDefined();
    expect(row.title).toBe("judul");
  });

  test("membuat note dengan title dan content", async () => {
    const response = await postJson("/notes", { title: "judul", content: "isi" });
    expect(response.status).toBe(201);

    const body = await json(response);
    expect(body.data.title).toBe("judul");
    expect(body.data.content).toBe("isi");
  });

  test("men-trim title sebelum disimpan", async () => {
    const response = await postJson("/notes", { title: "   spasi   " });
    expect(response.status).toBe(201);

    const body = await json(response);
    expect(body.data.title).toBe("spasi");
  });

  test("menolak body tanpa title", async () => {
    const response = await postJson("/notes", { content: "isi" });
    expect(response.status).toBe(400);

    const body = await json(response);
    expect(body.success).toBe(false);
  });

  test("menolak title kosong atau hanya spasi", async () => {
    expect((await postJson("/notes", { title: "" })).status).toBe(400);
    expect((await postJson("/notes", { title: "   " })).status).toBe(400);
  });

  test("menolak content yang bukan string", async () => {
    const response = await postJson("/notes", { title: "judul", content: 123 });
    expect(response.status).toBe(400);

    const body = await json(response);
    expect(body.success).toBe(false);
  });

  test("content yang tidak dikirim tetap diterima", async () => {
    const response = await postJson("/notes", { title: "judul" });
    expect(response.status).toBe(201);

    const body = await json(response);
    expect(body.data.content).toBeNull();
  });
});

describe("DELETE /notes/:id", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("menghapus note yang ada", async () => {
    const id = await insertNote("judul");

    const response = await request(`/notes/${id}`, { method: "DELETE" });
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.success).toBe(true);

    const rows = await db.select().from(notes).where(eq(notes.id, id));
    expect(rows).toHaveLength(0);
  });

  test("mengembalikan 404 untuk id yang tidak ada", async () => {
    const response = await request("/notes/999999", { method: "DELETE" });
    expect(response.status).toBe(404);
  });

  test("mengembalikan 400 untuk id bukan angka", async () => {
    const response = await request("/notes/abc", { method: "DELETE" });
    expect(response.status).toBe(400);
  });

  test("menghapus dua kali: yang kedua 404", async () => {
    const id = await insertNote("judul");

    expect((await request(`/notes/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await request(`/notes/${id}`, { method: "DELETE" })).status).toBe(404);
  });
});
