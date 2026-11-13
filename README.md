# belajar-vibe-coding

Backend API sederhana untuk latihan membangun aplikasi web dengan pendekatan "vibe coding":
proyek kecil, tapi tetap rapi secara struktur, penamaan, dan pemisahan tanggung jawab.

Aplikasi ini menyediakan dua hal:

- **Notes** — CRUD sederhana untuk contoh resource.
- **Users** — registrasi, login berbasis token session, ambil data user yang sedang login, dan logout.

---

## Daftar Isi

- [Teknologi dan Stack](#teknologi-dan-stack)
- [Library yang Digunakan](#library-yang-digunakan)
- [Arsitektur](#arsitektur)
  - [Struktur Folder dan Penamaan File](#struktur-folder-dan-penamaan-file)
  - [Alur Request](#alur-request)
  - [Konvensi Penamaan](#konvensi-penamaan)
- [Schema Database](#schema-database)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Cara Setup Project](#cara-setup-project)
- [Cara Menjalankan Aplikasi](#cara-menjalankan-aplikasi)
- [API yang Tersedia](#api-yang-tersedia)
  - [Konvensi Response](#konvensi-response)
  - [Contoh Pemakaian](#contoh-pemakaian)
- [Cara Test Aplikasi](#cara-test-aplikasi)
- [Perintah Penting](#perintah-penting)
- [Batasan yang Disengaja](#batasan-yang-disengaja)

---

## Teknologi dan Stack

| Bagian        | Teknologi             | Versi     | Keterangan                                              |
| ------------- | --------------------- | --------- | ------------------------------------------------------- |
| Runtime       | **Bun**               | 1.4+      | Menjalankan TypeScript langsung tanpa build step, sekaligus test runner |
| Bahasa        | **TypeScript**        | ES2022    | Mode `strict`, `noEmit` (Bun yang menjalankan)          |
| Web framework | **ElysiaJS**          | ^1.3      | Routing, validasi, error handling global                |
| ORM           | **Drizzle ORM**       | ^0.44     | Query builder bertipe untuk MySQL                       |
| Migration     | **drizzle-kit**       | ^0.31     | Generate dan jalankan migration dari schema             |
| Database      | **MySQL**             | 8.x       | Melalui driver `mysql2`                                 |
| Hashing       | **bcryptjs**          | ^3.0      | Hash password (cost 10), versi pure JS                  |
| Test runner   | **`bun test`**        | bawaan    | Tidak ada framework test tambahan                       |

Tidak ada Docker, tidak ada ORM library lain, dan tidak ada framework test pihak ketiga.

---

## Library yang Digunakan

### Dependensi runtime

| Library                          | Dipakai untuk                                                         |
| -------------------------------- | --------------------------------------------------------------------- |
| `elysia`                         | HTTP routing, plugin chain, `.onError` global, prefix route           |
| `drizzle-orm`                    | Definisi tabel, `select`/`insert`/`delete`, `eq`, `innerJoin`, `$returningId()` |
| `mysql2`                         | Connection pool MySQL yang dipakai Drizzle                            |
| `bcryptjs`                       | `bcrypt.hash` saat registrasi, `bcrypt.compare` saat login            |
| `@types/bcryptjs`                | Tipe TypeScript untuk `bcryptjs`                                      |

### Dependensi development

| Library       | Dipakai untuk                                    |
| ------------- | ------------------------------------------------ |
| `drizzle-kit` | `db:generate` (buat file SQL) dan `db:migrate` (terapkan ke database) |
| `@types/bun`  | Tipe `Bun`, `bun:test`, dan API runtime Bun       |

---

## Arsitektur

Aplikasi ini memakai pemisahan berlapis sederhana:

```
HTTP request
    │
    ▼
 ┌───────────────────────────────────────────────┐
 │ routes/     lapisan HTTP                      │
 │ - baca params/body/headers                    │
 │ - validasi bentuk input                       │
 │ - memilih status code dan bentuk response     │
 └───────────────────┬───────────────────────────┘
                     │ memanggil fungsi service
                     ▼
 ┌───────────────────────────────────────────────┐
 │ services/   logic bisnis                      │
 │ - normalisasi data (trim, lowercase)          │
 │ - hashing password, verifikasi login          │
 │ - akses database lewat Drizzle                │
 │ - mengembalikan hasil bertipe { ok: ... }     │
 └───────────────────┬───────────────────────────┘
                     │ query
                     ▼
 ┌───────────────────────────────────────────────┐
 │ db/         akses data                        │
 │ - koneksi pool MySQL + instance Drizzle       │
 │ - definisi tabel (schema)                     │
 └───────────────────────────────────────────────┘
```

Prinsip yang dipegang:

- **Route tidak menyentuh query SQL.** Route hanya memvalidasi input, memanggil service, lalu
  menerjemahkan hasil service menjadi status code dan body.
- **Service tidak menyentuh `Request`/`Response`.** Service menerima data biasa dan mengembalikan
  hasil bertipe union (`{ ok: true, ... } | { ok: false, reason: ... }`), sehingga mudah di-test.
- **Schema database adalah satu-satunya sumber kebenaran.** Migration selalu di-generate dari
  `src/db/schema.ts`, tidak diedit manual.

### Struktur Folder dan Penamaan File

```
.
├── src/
│   ├── index.ts            # entry point: cek koneksi DB, lalu start server
│   ├── app.ts              # instance Elysia: .onError global + mount semua route
│   ├── env.ts              # baca & validasi environment variable, gagal cepat kalau kosong
│   ├── routes/
│   │   ├── notes-route.ts  # route CRUD /notes (lapisan HTTP)
│   │   └── users-route.ts  # route /api/users* (lapisan HTTP)
│   ├── services/
│   │   └── users-service.ts# logic user: registrasi, login, current user, logout
│   └── db/
│       ├── client.ts       # connection pool MySQL + instance Drizzle
│       └── schema.ts       # definisi tabel: notes, users, sessions
├── tests/
│   ├── helpers.ts          # helper bersama: reset data, buat user, login, request
│   ├── global.test.ts      # GET / dan GET /health
│   ├── notes.test.ts       # seluruh endpoint /notes
│   ├── users.test.ts       # POST /api/users dan POST /api/users/login
│   ├── current-user.test.ts# GET /api/users/current
│   └── logout.test.ts      # DELETE /api/users/logout
├── drizzle/                # hasil generate migration (jangan diedit manual)
│   ├── 0000_*.sql
│   ├── 0001_*.sql
│   ├── 0002_*.sql
│   └── meta/
├── drizzle.config.ts       # konfigurasi drizzle-kit (dialect mysql, path schema & output)
├── tsconfig.json           # konfigurasi TypeScript (src, tests, drizzle.config.ts)
├── package.json
└── .env.example            # contoh konfigurasi environment
```

Pembagian ini sengaja mengikuti pembagian peran, bukan per fitur:

- **File route** hanya ada kalau ada endpoint yang perlu di-expose.
- **File service** hanya ada kalau ada logic bisnis yang lebih dari sekadar memanggil query.
  Karena `notes` belum punya logic khusus, ia belum punya service.
- **Test** disusun satu file per area endpoint, dengan helper bersama supaya tidak ada duplikasi.

### Alur Request

Contoh `POST /api/users/login`:

1. Elysia menerima request dan mencocokkan route di `users-route.ts`.
2. Handler memvalidasi bentuk body dengan type guard (`isValidLoginBody`). Kalau gagal → `400`.
3. Handler memanggil `loginUser()` di `users-service.ts`.
4. Service menormalkan email, mencari user, dan membandingkan password dengan hash bcrypt.
5. Kalau cocok, service membuat token (`crypto.randomUUID()`) dan menyimpan row di `sessions`.
6. Service mengembalikan `{ ok: true, token }` atau `{ ok: false, reason: "INVALID_CREDENTIALS" }`.
7. Route menerjemahkannya menjadi `200 { data: token }` atau `401 { error: ... }`.
8. Kalau ada exception tak terduga, handler mengembalikan `500`, dan `.onError` global menjadi
   jaring terakhir untuk error yang lolos dari handler.

### Konvensi Penamaan

| Hal              | Konvensi                                   | Contoh                          |
| ---------------- | ------------------------------------------ | ------------------------------- |
| File             | `kebab-case`, berakhiran peran             | `notes-route.ts`, `users-service.ts` |
| Export route     | `camelCase` + akhiran `Routes`             | `notesRoutes`, `usersRoutes`    |
| Fungsi service   | `camelCase` kata kerja + entitas           | `registerUser`, `loginUser`, `logoutUser` |
| Type hasil       | PascalCase + akhiran `Result`              | `LoginResult`, `LogoutResult`   |
| File test        | `<area>.test.ts`                           | `users.test.ts`                 |
| Tabel database   | jamak, `snake_case`                        | `notes`, `users`, `sessions`    |
| Kolom database   | `snake_case` (dipetakan dari `camelCase` di Drizzle) | `created_at`, `user_id` |
| Field API        | mengikuti bentuk baris dari Drizzle: `camelCase` untuk `notes`, `snake_case` untuk `users/current` | `createdAt`, `created_at` |

---

## Schema Database

Database: **MySQL**, nama default `belajar_vibe_coding`. Ada **tiga tabel**, didefinisikan di
[src/db/schema.ts](src/db/schema.ts).

### `notes`

| Kolom        | Tipe           | Nullable | Keterangan                  |
| ------------ | -------------- | -------- | --------------------------- |
| `id`         | `INT`          | tidak    | Primary key, auto increment |
| `title`      | `VARCHAR(255)` | tidak    | Judul note                  |
| `content`    | `TEXT`         | ya       | Isi note, boleh `null`      |
| `created_at` | `TIMESTAMP`    | tidak    | Default waktu sekarang      |

### `users`

| Kolom        | Tipe           | Nullable | Keterangan                      |
| ------------ | -------------- | -------- | ------------------------------- |
| `id`         | `INT`          | tidak    | Primary key, auto increment     |
| `name`       | `VARCHAR(255)` | tidak    | Nama user (disimpan sudah di-trim) |
| `email`      | `VARCHAR(255)` | tidak    | **UNIQUE**, disimpan huruf kecil |
| `password`   | `VARCHAR(255)` | tidak    | Hash bcrypt, **bukan** plaintext |
| `created_at` | `TIMESTAMP`    | tidak    | Default waktu sekarang          |

### `sessions`

| Kolom        | Tipe           | Nullable | Keterangan                                     |
| ------------ | -------------- | -------- | ---------------------------------------------- |
| `id`         | `INT`          | tidak    | Primary key, auto increment                    |
| `token`      | `VARCHAR(255)` | tidak    | **UNIQUE**, token session (`crypto.randomUUID()`) |
| `user_id`    | `INT`          | tidak    | **FK** ke `users.id`                           |
| `created_at` | `TIMESTAMP`    | tidak    | Default waktu sekarang                         |

### Relasi

```
users 1 ──────< sessions
  id               user_id (FK)
```

Satu user bisa punya banyak session (login di beberapa tempat sekaligus). Logout hanya
menghapus **satu** row session, yaitu yang tokennya dikirim — session lain tetap berlaku.
`notes` tidak berelasi dengan tabel mana pun.

### Cara mengubah schema

1. Edit [src/db/schema.ts](src/db/schema.ts).
2. `bun run db:generate` — drizzle-kit membuat file SQL baru di `drizzle/`.
3. Periksa isi file SQL yang di-generate.
4. `bun run db:migrate` — terapkan ke database.

Jangan menulis SQL migration secara manual, karena `drizzle/meta/` harus tetap sinkron dengan schema.

---

## Konfigurasi Environment

Salin `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

| Variabel       | Wajib | Default                              | Keterangan                          |
| -------------- | ----- | ------------------------------------ | ----------------------------------- |
| `DATABASE_URL` | ya    | —                                    | Connection string MySQL             |
| `PORT`         | tidak | `3000`                               | Port HTTP server                    |

Contoh:

```env
DATABASE_URL=mysql://root:@localhost:3306/belajar_vibe_coding
PORT=3000
```

Kalau `DATABASE_URL` kosong, aplikasi langsung gagal saat start dengan pesan yang jelas.
Kalau koneksi database gagal, aplikasi juga berhenti saat start, bukan diam-diam gagal di
request pertama.

---

## Cara Setup Project

Syarat: [Bun](https://bun.sh) terpasang, dan MySQL berjalan di komputer.

1. **Install dependency**

   ```bash
   bun install
   ```

2. **Siapkan environment**

   ```bash
   cp .env.example .env
   ```

   Sesuaikan `DATABASE_URL` dengan MySQL kamu.

3. **Buat database** (sekali saja, lewat MySQL CLI atau GUI apa pun)

   ```sql
   CREATE DATABASE belajar_vibe_coding;
   ```

4. **Terapkan migration**

   ```bash
   bun run db:generate   # opsional; file migration sudah ada di drizzle/
   bun run db:migrate
   ```

5. **Cek setup**

   ```bash
   bun run dev
   curl http://localhost:3000/health
   # → {"success":true,"data":{"status":"ok"}}
   ```

---

## Cara Menjalankan Aplikasi

| Perintah        | Kegunaan                                          |
| --------------- | ------------------------------------------------- |
| `bun run dev`   | Mode development dengan auto-reload (`--watch`)   |
| `bun run start` | Jalankan sekali tanpa watch                       |
| `bun run build` | Bundle ke `dist/` dengan target Bun               |

Server berjalan di `http://localhost:3000` (bisa diubah lewat `PORT`).

---

## API yang Tersedia

Base URL lokal: `http://localhost:3000`

| Method | Path                  | Butuh token | Keterangan                                    |
| ------ | --------------------- | ----------- | --------------------------------------------- |
| GET    | `/`                   | tidak       | Info project dan status                       |
| GET    | `/health`             | tidak       | Health check                                  |
| GET    | `/notes`              | tidak       | Daftar semua note                             |
| GET    | `/notes/:id`          | tidak       | Detail satu note                              |
| POST   | `/notes`              | tidak       | Buat note baru                                |
| DELETE | `/notes/:id`          | tidak       | Hapus note                                    |
| POST   | `/api/users`          | tidak       | Registrasi user baru                          |
| POST   | `/api/users/login`    | tidak       | Login, mengembalikan token session            |
| GET    | `/api/users/current`  | **ya**      | Data user pemilik token                       |
| DELETE | `/api/users/logout`   | **ya**      | Logout, hapus satu session                    |

Token dikirim lewat header `Authorization: Bearer <token>`. Keyword `Bearer` bersifat
case-insensitive.

### Konvensi Response

Sebagian besar endpoint memakai bentuk konsisten:

- sukses: `{ "success": true, "data": ... }`
- gagal: `{ "success": false, "error": "pesan" }`

> **Pengecualian yang disengaja:** seluruh endpoint `/api/users*` **tidak** memakai field
> `success`. Bentuknya `{ "data": ... }` atau `{ "error": "..." }`. Ini keputusan sadar
> pemilik issue, bukan bug — jangan "diperbaiki" tanpa diskusi.

### Ringkasan per Endpoint

**`GET /`** — info project.

```
200 { "success": true, "data": { "name": "belajar-vibe-coding", "status": "ok" } }
```

**`GET /health`** — health check.

```
200 { "success": true, "data": { "status": "ok" } }
```

**`GET /notes`** — daftar semua note.

```
200 { "success": true, "data": [ { "id": 1, "title": "...", "content": "...", "createdAt": "..." } ] }
```

> Catatan: response `notes` mengembalikan baris apa adanya dari Drizzle, sehingga kolom
> `created_at` muncul sebagai `createdAt`. Response `GET /api/users/current` memetakan
> ulang kolomnya, sehingga memakai `created_at`. Keduanya memang berbeda.

**`GET /notes/:id`** — detail satu note.

- `200` kalau ada
- `400 { "success": false, "error": "id harus berupa angka positif" }` kalau `id` bukan angka positif
- `404 { "success": false, "error": "Note tidak ditemukan" }` kalau tidak ada

**`POST /notes`** — buat note baru.

- Body: `{ "title": string (wajib, tidak kosong), "content"?: string }`
- `201` dengan note yang dibuat; `title` di-trim; `content` tidak dikirim → `null`
- `400 { "success": false, "error": "Body tidak valid: ..." }` kalau body tidak valid

**`DELETE /notes/:id`** — hapus note.

- `200 { "success": true, "data": null }` kalau berhasil
- `400` kalau `id` tidak valid
- `404` kalau note tidak ada

**`POST /api/users`** — registrasi.

- Body: `{ "name": string, "email": string, "password": string }` (semua wajib, tidak kosong)
- `201 { "data": "OK" }`
- `409 { "error": "Email sudah terdaftar" }`
- `400 { "error": "Body tidak valid: 'name', 'email', dan 'password' wajib string tidak kosong" }`

**`POST /api/users/login`** — login.

- Body: `{ "email": string, "password": string }`
- `200 { "data": "<uuid-token>" }`
- `401 { "error": "Email dan password salah" }` — pesan ini **sengaja** sama untuk email
  tidak terdaftar dan password salah, supaya tidak membocorkan email mana yang terdaftar
- `400 { "error": "Body tidak valid: ..." }`

**`GET /api/users/current`** — data user pemilik token.

- `200 { "data": { "id": number, "name": string, "email": string, "created_at": string } }`
  — tepat empat field, tidak pernah menyertakan `password`
- `401 { "error": "Unauthorized" }` untuk header hilang, format salah, atau token tidak dikenal

**`DELETE /api/users/logout`** — logout.

- `200 { "data": "ok" }`; row session dengan token tersebut dihapus
- `401 { "error": "Unauthorized" }` untuk header hilang, format salah, atau token tidak dikenal
- `401` juga kalau token sudah pernah logout

### Contoh Pemakaian

Alur lengkap registrasi → login → current → logout:

```bash
# 1. Registrasi
curl -i -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"fadhal","email":"fadhal@localhost","password":"rahasia"}'
# → 201 {"data":"OK"}

# 2. Login, simpan token
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fadhal@localhost","password":"rahasia"}' | sed -E 's/.*"data":"([^"]+)".*/\1/')

# 3. Data user yang sedang login
curl -i http://localhost:3000/api/users/current \
  -H "Authorization: Bearer $TOKEN"
# → 200 {"data":{"id":1,"name":"fadhal","email":"fadhal@localhost","created_at":"..."}}

# 4. Logout
curl -i -X DELETE http://localhost:3000/api/users/logout \
  -H "Authorization: Bearer $TOKEN"
# → 200 {"data":"ok"}
```

Endpoint `notes`:

```bash
# Buat
curl -X POST http://localhost:3000/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"Belajar Bun","content":"Halo dari Elysia"}'
# → 201 {"success":true,"data":{"id":1,...}}

# Daftar
curl http://localhost:3000/notes

# Detail
curl http://localhost:3000/notes/1

# Hapus
curl -i -X DELETE http://localhost:3000/notes/1
```

---

## Cara Test Aplikasi

```bash
bun test
```

Test ada di folder [tests/](tests/) dan disusun satu file per area endpoint.

**Cara kerja:**

- Test memanggil aplikasi langsung lewat `app.handle(new Request(...))` — **tidak perlu
  menyalakan server HTTP**. Ini menguji route, validasi, dan service sekaligus tanpa overhead jaringan.
- Setiap skenario memanggil helper `resetData()` di `beforeEach`, yang menghapus `sessions`
  lalu `notes` dan `users`. Urutan ini penting karena `sessions.user_id` punya foreign key ke `users`.
- Karena itu, setiap test independen: hasilnya tidak bergantung pada urutan eksekusi atau sisa data sebelumnya.
- Assertion memeriksa status code, bentuk response, dan **efek samping ke database** (misalnya
  password tersimpan sebagai hash, session benar-benar terhapus).

> **Penting:** test memakai database yang sama dengan `.env` dan **menghapus seluruh isi**
> tabel `sessions`, `notes`, dan `users`. Jangan arahkan `DATABASE_URL` ke database yang
> datanya ingin dipertahankan.

Untuk memastikan perubahan tipe tetap aman:

```bash
bunx tsc --noEmit
```

`tsconfig.json` mencakup `src`, `tests`, dan `drizzle.config.ts`, jadi file test ikut di-typecheck.

---

## Perintah Penting

| Perintah                | Fungsi                                              |
| ----------------------- | --------------------------------------------------- |
| `bun install`           | Install dependency                                  |
| `bun run dev`           | Jalankan server development (auto-reload)           |
| `bun run start`         | Jalankan server sekali                              |
| `bun run build`         | Bundle ke `dist/`                                   |
| `bun run db:generate`   | Generate file migration dari `src/db/schema.ts`     |
| `bun run db:migrate`    | Terapkan migration ke database                      |
| `bun test`              | Jalankan seluruh unit test                          |
| `bunx tsc --noEmit`     | Typecheck seluruh project                           |

---

## Batasan yang Disengaja

Hal-hal berikut **sengaja belum ada** pada tahap ini, bukan kelupaan:

- **Tidak ada middleware auth global.** Hanya `/api/users/current` dan `/api/users/logout`
  yang memeriksa token. Endpoint `notes` dan registrasi/login bersifat publik.
- **Tidak ada refresh token atau kedaluwarsa session.** Token berlaku sampai dihapus lewat logout.
- **Tidak ada role atau hak akses.** Semua user setara.
- **Tidak ada rate limiting.**
- **Tidak ada Docker atau deployment config.**
- **Test memakai database development**, bukan database terpisah khusus test.

Kalau salah satu dari hal di atas dibutuhkan, itu perubahan ruang lingkup yang perlu
dibahas lewat issue tersendiri.
