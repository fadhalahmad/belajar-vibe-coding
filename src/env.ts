export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
};

if (!env.databaseUrl) {
  throw new Error(
    "DATABASE_URL belum di-set. Copy .env.example menjadi .env lalu isi koneksi MySQL kamu."
  );
}
