import { beforeEach, describe, expect, test } from "bun:test";
import { json, request, resetData } from "./helpers";

describe("GET /", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("mengembalikan 200 dengan bentuk { success: true, data }", async () => {
    const response = await request("/");
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.name).toBe("belajar-vibe-coding");
    expect(body.data.status).toBe("ok");
  });
});

describe("GET /health", () => {
  beforeEach(async () => {
    await resetData();
  });

  test("mengembalikan 200 dengan status ok", async () => {
    const response = await request("/health");
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
  });
});
