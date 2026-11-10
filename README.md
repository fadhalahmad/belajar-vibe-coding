# belajar-vibe-coding

Backend API sederhana: **Bun + ElysiaJS + Drizzle + MySQL**.

## Setup

Syarat: [Bun](https://bun.sh) dan MySQL yang berjalan di komputer kamu.

1. Install dependency:
   ```bash
   bun install
   ```

2. Copy environment file dan sesuaikan koneksi MySQL kamu:
   ```bash
   cp .env.example .env
   ```

3. Buat database (sekali saja, via MySQL CLI atau GUI apa pun):
   ```sql
   CREATE DATABASE belajar_vibe_coding;
   ```

4. Generate dan jalankan migration:
   ```bash
   bun run db:generate
   bun run db:migrate
   ```

## Menjalankan

```bash
bun run dev      # mode development (auto-reload)
bun run start    # mode biasa
bun run build    # build ke dist/
```

Server berjalan di `http://localhost:3000` (ubah lewat `PORT` di `.env`).

Kalau koneksi database gagal saat start, server sengaja langsung berhenti dengan pesan error dan petunjuk — bukan diam-diam error di request pertama.

## Endpoint

| Method | Path              | Keterangan                        |
| ------ | ----------------- | --------------------------------- |
| GET    | `/`               | Info project                      |
| GET    | `/health`         | Health check                      |
| GET    | `/notes`          | Daftar semua note                 |
| GET    | `/notes/:id`      | Detail satu note                  |
| POST   | `/notes`          | Buat note baru                    |
| DELETE | `/notes/:id`      | Hapus note                        |
| POST   | `/api/users`      | Registrasi user baru              |

Contoh membuat note:

```bash
curl -X POST http://localhost:3000/notes \
  -H "Content-Type: application/json" \
  -d '{"title": "Belajar Bun", "content": "Halo dari Elysia"}'
```

Contoh registrasi user:

```bash
curl -i -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"fadhal","email":"fadhal@localhost","password":"rahasia"}'
# → 201 {"data":"OK"}
```

Semua response memakai bentuk konsisten:
- sukses: `{ "success": true, "data": ... }`
- gagal: `{ "success": false, "error": "pesan" }`

> **Pengecualian:** response `/api/users` **sengaja** tidak memakai field `success`.
> Bentuknya `{ "data": "OK" }` (201), `{ "error": "Email sudah terdaftar" }` (409),
> dan `{ "error": "Body tidak valid: ..." }` (400). Ini keputusan sadar pemilik issue,
> bukan bug — jangan "perbaiki" tanpa diskusi.

## Struktur

```
src/
  index.ts            # entry point: cek koneksi DB, start server
  app.ts              # instance Elysia, error handling, route global
  env.ts              # pembacaan & validasi environment variable
  routes/
    notes-route.ts    # endpoint CRUD resource "notes"
    users-route.ts    # endpoint registrasi user (lapisan HTTP)
  services/
    users-service.ts  # logic bisnis user (hash password, cek duplikat, insert)
  db/
    client.ts         # koneksi MySQL (pool) + instance Drizzle
    schema.ts         # definisi tabel Drizzle
drizzle.config.ts  # konfigurasi drizzle-kit (dialect mysql)
drizzle/           # hasil generate migration (jangan edit manual)
```

## Perintah penting

| Perintah             | Fungsi                                      |
| -------------------- | ------------------------------------------- |
| `bun install`       | Install dependency                          |
| `bun run dev`       | Jalankan server development                 |
| `bun run db:generate` | Generate file migration dari schema       |
| `bun run db:migrate`  | Terapkan migration ke database           |

## Asumsi implementasi

Keputusan detail yang diambil dari issue (tidak diwajibkan issue):

- Resource contoh: `notes` (judul + konten opsional).
- Migration disimpan di folder `drizzle/`.
- `$returningId()` dipakai untuk ambil ID hasil insert (khusus MySQL Drizzle).
- Tidak ada auth, Docker, testing, atau deployment di tahap ini — sesuai batas ruang lingkup issue.
