import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { env } from "./env";
import { app } from "./app";

async function checkDatabase() {
  try {
    await db.execute(sql`select 1`);
    console.log("Database: terhubung");
  } catch (error) {
    console.error("Database: GAGAL terhubung.");
    console.error(error instanceof Error ? error.message : error);
    console.error(
      "Periksa DATABASE_URL di .env — pastikan MySQL berjalan, database sudah dibuat, dan kredensial benar."
    );
    process.exit(1);
  }
}

await checkDatabase();

app.listen(env.port);

console.log(`Server berjalan di http://localhost:${env.port}`);
