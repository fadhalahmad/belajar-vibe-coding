# Issue: Login User (`POST /api/users/login`)

**Status:** Siap diimplementasikan
**Target pembaca:** Junior programmer atau AI model murah
**Stack:** Bun + ElysiaJS + Drizzle ORM + MySQL
**Prasyarat:** Issue registrasi user (`POST /api/users`) sudah selesai dan ter-commit.

---

## 1. Ringkasan

Tambahkan fitur login. User mengirim `email` dan `password`; server memverifikasi keduanya terhadap tabel `users`, lalu membuat token session berupa UUID, menyimpannya ke tabel `sessions`, dan mengembalikan token itu ke user.

Fitur ini **hanya login sampai menghasilkan token**. Tidak ada middleware auth, tidak ada proteksi endpoint, tidak ada logout. Jangan implementasikan hal-hal itu.

---

## 2. Ruang Lingkup

### Yang dikerjakan

1. Tabel `sessions` di database (via schema Drizzle + migration).
2. Endpoint `POST /api/users/login`.
3. Penambahan logic login di `src/services/users-service.ts` yang sudah ada.
4. Penambahan handler login di `src/routes/users-route.ts` yang sudah ada.
5. Update README.

### Yang TIDAK dikerjakan

- Middleware auth / pengecekan header `Authorization`.
- Proteksi endpoint mana pun dengan token (termasuk `notes` dan `/api/users`).
- Endpoint logout, `GET /api/users/me`, refresh token, atau hapus session.
- Expired/kedaluwarsa token. Kolom waktu hanya `created_at`, tidak ada `expires_at`.
- JWT, cookie, session di sisi server framework.
- Rate limiting, captcha, proteksi brute force.
- Endpoint `GET`, `PUT`, `DELETE` untuk users.
- Testing otomatis (lihat §9).
- Menambah `success: true` / `success: false` ke response login (lihat §4).

---

## 3. Skema Tabel `sessions`

| Kolom        | Tipe DB         | Aturan                                                |
| ------------ | --------------- | ----------------------------------------------------- |
| `id`         | `int`           | Auto increment, primary key                            |
| `token`      | `varchar(255)`  | NOT NULL, **UNIQUE** (lihat catatan di bawah)          |
| `user_id`    | `int`           | NOT NULL, FK ke `users.id` (lihat catatan di bawah)    |
| `created_at` | `timestamp`     | DEFAULT `CURRENT_TIMESTAMP`, NOT NULL                  |

### Catatan penting soal `token` UNIQUE

Spec asli tidak menulis `UNIQUE`, tapi kolom ini **harus** `UNIQUE`:

1. Token adalah kunci lookup — kalau ada dua row dengan token sama, `SELECT ... WHERE token = ?` jadi ambigu, dan itu bug autentikasi yang serius.
2. UUID v4 praktis tidak pernah tabrakan, tapi constraint `UNIQUE` adalah jaring pengaman yang murah dan benar. Jangan andalkan probabilitas.

### Catatan penting soal `user_id` sebagai foreign key

Spec asli hanya menulis "FK ke tabel users". Implementasikan sebagai foreign key **sungguhan** ke `users.id`, bukan sekadar kolom integer biasa:

```ts
userId: int("user_id")
  .notNull()
  .references(() => users.id),
```

Alasannya: tanpa constraint FK, row session bisa menunjuk ke user yang tidak ada, dan itu merusak integritas data. FK membuat database menolak insert yang tidak valid.

**Jangan** tambahkan `.onDelete("cascade")` di issue ini. Kalau user dihapus, `ON DELETE` default (RESTRICT) akan menolak penghapusan selama session-nya masih ada — dan itu perilaku yang aman serta di luar lingkup. Menentukan strategi cascade adalah keputusan tersendiri; jangan diputuskan diam-diam di sini.

### Definisi Drizzle

Tambahkan ke `src/db/schema.ts` **setelah** definisi `users` yang sudah ada (jangan hapus atau ubah `notes` dan `users`):

```ts
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
```

Ikuti gaya tabel `notes` dan `users`: nama kolom di DB `snake_case` (`user_id`), nama field di TypeScript `camelCase` (`userId`).

**Perhatikan urutan definisi:** `sessions` memakai `users` di dalam `.references(() => users.id)`, jadi definisi `sessions` harus berada **setelah** definisi `users` di file. Kalau dibalik, akan error karena `users` belum terdefinisi.

---

## 4. Kontrak API

### Endpoint

```
POST /api/users/login
```

Perhatikan prefix **`/api`**. Ini satu level di bawah `POST /api/users`.

### Request

`Content-Type: application/json`

```json
{
  "email": "fadhal@localhost",
  "password": "rahasia"
}
```

| Field      | Tipe   | Aturan                                    |
| ---------- | ------ | ----------------------------------------- |
| `email`    | string | Wajib, tidak boleh kosong                 |
| `password` | string | Wajib, tidak boleh kosong                 |

**Tidak ada `name` di request body.** Field `name` muncul di spec asli, tapi itu sisa copy-paste dari spec registrasi dan sudah diputuskan untuk **tidak dipakai**: login hanya butuh `email` + `password`. Kalau user tetap mengirim `name`, field itu diabaikan — jangan divalidasi, jangan dipakai untuk lookup.

**Jangan** minta `confirmPassword`.

### Response sukses — `200 OK`

```json
{
  "data": "3f8b1c2e-9a4d-4f7b-8c1e-2d5a6b7c8d9e"
}
```

`data` berisi **string token UUID**, bukan object user, bukan `{ token: "..." }`. Nilai sebenarnya adalah UUID v4 yang baru dibuat.

**Status `200`, bukan `201`.** Login bukan pembuatan resource yang diminta user, dan ini keputusan yang sudah disetujui. Walaupun secara teknis ada row session baru, response yang benar untuk login adalah `200`.

**Jangan** kembalikan `password`, hash password, `user_id`, atau data user apa pun. Hanya token.

### Response error — email atau password salah

Status: **`401 Unauthorized`**

```json
{
  "error": "Email dan password salah"
}
```

**Pesan error harus sama persis** untuk kedua kasus: email tidak terdaftar, dan password salah. Jangan bedakan pesannya.

Alasannya keamanan: kalau pesan dibedakan ("email tidak ditemukan" vs "password salah"), penyerang bisa memakai endpoint ini untuk memetakan email mana yang terdaftar di sistem (user enumeration). Satu pesan generik untuk keduanya menutup celah itu. Ini keputusan sadar, bukan kelalaian.

### Response error — body tidak valid

Status: **`400 Bad Request`**

```json
{
  "error": "Body tidak valid: 'email' dan 'password' wajib string tidak kosong"
}
```

### ⚠️ Bentuk response ini SENGAJA berbeda dari project

Sama seperti `POST /api/users` dan berbeda dari `notes`, endpoint login **tidak** memakai field `success`.

- **Jangan** menambahkan `success: true` / `success: false` ke response login.
- **Jangan** mengubah `notes` agar ikut tidak pakai `success` — biarkan apa adanya.
- **Jangan** menganggap ini bug lalu "memperbaikinya".

Kalau menurutmu ini inkonsistensi yang perlu dibahas, tulis di komentar/PR — jangan diputuskan sendiri.

---

## 5. Struktur Folder & File

Tidak ada file baru di `routes/` atau `services/`. Yang ada ditambahi.

```
src/
  index.ts                  # tidak diubah
  app.ts                    # tidak diubah (usersRoutes sudah terdaftar)
  env.ts                    # tidak diubah
  routes/
    users-route.ts          # TAMBAH handler login
    notes-route.ts          # tidak diubah
  services/
    users-service.ts        # TAMBAH fungsi login
  db/
    client.ts               # tidak diubah
    schema.ts               # tambah tabel sessions
```

### Aturan penamaan

- File tetap memakai akhiran yang sudah ada: `users-route.ts`, `users-service.ts`. Tidak ada file baru.
- Nama fungsi: ikuti gaya `registerUser` yang sudah ada → gunakan `loginUser`.
- Semua `kebab-case` untuk nama file, `camelCase` untuk nama fungsi.

### ⚠️ Jangan buat file baru

Ini kesalahan yang mudah terjadi: membuat `src/routes/auth-route.ts` atau `src/services/auth-service.ts`. **Jangan.** Spec meminta fitur ini masuk ke `users-route.ts` dan `users-service.ts` karena keduanya soal user. Menambah file baru di luar spec akan ditolak saat review.

Perhatikan juga: `app.ts` **tidak perlu diubah**. `usersRoutes` sudah di-`.use()` di sana, dan handler baru otomatis ikut karena berada di instance Elysia yang sama.

---

## 6. Pembagian Tanggung Jawab

Pemisahan route dan service harus jelas dan konsisten dengan yang sudah ada di `registerUser`. Ini yang paling sering salah dilakukan junior dev — logic bisnis bocor ke route.

### `src/services/users-service.ts` — logic bisnis

Tambahkan fungsi `loginUser`. Berisi:

- Normalisasi input (trim + lowercase email).
- Cari user berdasarkan email.
- Verifikasi password dengan `bcrypt.compare`.
- Generate token UUID.
- Insert token ke tabel `sessions`.
- Mengembalikan hasil dalam bentuk yang jelas sukses atau gagal.

**Tidak boleh** berisi: `set.status`, object `set`, parsing HTTP, atau apa pun yang tahu soal HTTP. Service tidak boleh import dari `elysia`.

### `src/routes/users-route.ts` — lapisan HTTP

Tambahkan handler `.post("/users/login", ...)`. Berisi:

- Validasi bentuk body.
- Memanggil service.
- Menerjemahkan hasil service menjadi status code + response body.
- Menangkap error tak terduga dan mengubahnya jadi 500.

**Tidak boleh** berisi: query database langsung, `bcrypt.compare`, `crypto.randomUUID`, atau import dari `../db/schema`.

### Cara memastikan pemisahan ini benar

Buka `users-route.ts` dan cari kata `db`, `bcrypt`, `randomUUID`, dan `insert`. Keempatnya **tidak boleh ada**. Kalau ada, logic-nya bocor dan harus dipindah ke service.

Cara termudah mengecek seluruh file sekaligus:

```bash
grep -nE "db\.|bcrypt|randomUUID|insert" src/routes/users-route.ts
# harus tidak menghasilkan output apa pun
```

---

## 7. Tahapan Implementasi

Kerjakan **berurutan**. Jangan lompat ke langkah 5 sebelum langkah 1–4 selesai dan terverifikasi.

### Tahap 0 — Pastikan titik awal bersih

Sebelum mulai, pastikan:

```bash
git status            # harus bersih, tidak ada perubahan belum di-commit
bunx tsc --noEmit     # harus bersih
```

Dan pastikan `POST /api/users` sudah berfungsi. Login bergantung pada user yang sudah terdaftar.

**Tidak perlu install dependency baru.**

- `bcryptjs` sudah ada (dipakai registrasi).
- UUID diambil dari **`crypto.randomUUID()`** yang merupakan API bawaan Bun/Node — **tidak perlu** paket `uuid` dari npm, dan **jangan** `bun add uuid`.

### Tahap 1 — Tambah tabel `sessions` ke schema

Edit `src/db/schema.ts` sesuai §3.

**Jangan** hapus atau ubah tabel `notes` dan `users`. Hanya tambah.

**Verifikasi:** `bunx tsc --noEmit` tidak error. Pastikan import `mysqlTable, int, varchar, timestamp` sudah ada di baris atas file — sudah ada dari tabel sebelumnya, jadi tidak perlu baris import baru. Lalu pastikan tidak perlu import `users` karena `users` didefinisikan di file yang sama.

### Tahap 2 — Generate dan jalankan migration

```bash
bun run db:generate
bun run db:migrate
```

**Verifikasi di database**, jangan cuma percaya output perintah:

```sql
SHOW TABLES;                  -- harus ada `notes`, `users`, DAN `sessions`
DESCRIBE sessions;            -- cek tipe kolom & constraint
SHOW INDEX FROM sessions;     -- harus ada UNIQUE di kolom token
```

Cek juga foreign key-nya benar-benar terbentuk:

```sql
SELECT
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_NAME = 'sessions'
  AND TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IS NOT NULL;
```

Harus muncul satu baris: `user_id` → `users` → `id`. Kalau hasilnya kosong, FK tidak terbentuk dan kamu harus perbaiki schema.

Kalau `db:migrate` gagal karena koneksi, itu masalah `.env` / MySQL, bukan kode kamu. Perbaiki dulu sebelum lanjut.

**Jangan edit file di `drizzle/` secara manual.** Folder itu hasil generate.

### Tahap 3 — Tambah `loginUser` di `src/services/users-service.ts`

Tambahkan fungsi baru. Kerangka yang disarankan:

```ts
export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "INVALID_CREDENTIALS" };

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<LoginResult> {
  // 1. cari user berdasarkan email
  // 2. kalau tidak ada → INVALID_CREDENTIALS
  // 3. verifikasi password dengan bcrypt.compare
  // 4. kalau salah → INVALID_CREDENTIALS
  // 5. generate token, insert ke sessions, kembalikan token
}
```

Detail yang wajib diperhatikan:

- **Normalisasi email sama persis seperti `registerUser`**: `input.email.trim().toLowerCase()`. Kalau tidak, user yang registrasi dengan `Fadhal@localhost` (tersimpan lowercase) tidak akan bisa login. Cek dan konsisten.
- **Jangan trim password** — spasi adalah karakter sah dalam password. Ini juga sama seperti `registerUser`.
- **Cari user dengan `eq(users.email, email)`**, bukan string interpolation ke SQL. Ini mencegah SQL injection dan memakai index UNIQUE.
- **Pakai `bcrypt.compare(password, user.password)` versi async**, bukan `compareSync`. Ingat: hash yang tersimpan adalah hasil registrasi, jangan pernah bandingkan plaintext dengan plaintext.
- **Ambil hash dari kolom `user.password`**, tapi **jangan** kembalikan password atau hash itu ke mana pun. Ia hanya dipakai untuk `compare` di dalam service.
- **Satu hasil untuk kedua kegagalan.** Email tidak ditemukan dan password salah sama-sama mengembalikan `{ ok: false, reason: "INVALID_CREDENTIALS" }`. Jangan tambahkan `reason` terpisah untuk keduanya — itu akan memaksa route membedakan pesan error, dan kita tidak mau itu (lihat §4).
- **Generate token dengan `crypto.randomUUID()`.** Tidak perlu import apa pun — ini global di runtime Bun. Hasilnya string UUID v4.
- **Insert ke `sessions`** dengan `{ token, userId: user.id }`. Perhatikan nama field: `userId` (camelCase, sesuai definisi Drizzle), bukan `user_id`.

**Verifikasi:** `bunx tsc --noEmit` bersih. File ini **tidak** mengimport `elysia`.

### Tahap 4 — Tambah handler login di `src/routes/users-route.ts`

Tambahkan `.post("/users/login", ...)` pada instance Elysia yang sudah ada.

Detail yang wajib diperhatikan:

- **Jangan buat instance Elysia baru** dan **jangan tambahkan prefix lagi**. Instance `usersRoutes` sudah punya `prefix: "/api"`, jadi cukup `.post("/users/login", ...)` — hasil akhirnya `POST /api/users/login`.
- **Validasi body** pakai pola yang sama seperti handler registrasi: fungsi type guard yang mengembalikan `value is {...}`, dipasang di opsi kedua `.post()`. Ikuti pola yang sudah ada, jangan pakai library validasi baru seperti zod — tidak ada di dependency dan penambahannya di luar ruang lingkup. Buat fungsi guard terpisah, misal `isValidLoginBody`, jangan gabungkan dengan `isValidRegisterBody` karena aturannya berbeda (login tidak punya `name`).
- Validasi minimal: `email`, `password` keduanya string, dan setelah `trim()` panjangnya `> 0`.
- **Terjemahkan hasil service:** gagal → `401` + `{ error: "Email dan password salah" }`; sukses → `200` + `{ data: token }`.
- **Jangan** `set.status = 201`. Login sukses memakai `200`.
- **Jangan** kembalikan data user atau hash password di response — hanya token.
- Validasi body gagal → `400` + `{ error: "Body tidak valid: 'email' dan 'password' wajib string tidak kosong" }`.

**Urutan pendaftaran route:** mendaftarkan `/users/login` sebelum atau sesudah `/users` tidak masalah di Elysia karena kedua path-nya statis dan berbeda, tidak ada konflik pattern. Jadi jangan pusing soal urutan.

**Verifikasi:**

```bash
grep -nE "db\.|bcrypt|randomUUID|insert" src/routes/users-route.ts
# harus tidak menghasilkan output apa pun
```

Lihat §6.

### Tahap 5 — Pastikan tidak ada yang perlu diubah di `src/app.ts`

`usersRoutes` sudah di-`.use()` di `app.ts`, dan handler login berada di instance yang sama. **Tidak ada perubahan yang diperlukan di `app.ts`.**

Kalau kamu merasa perlu mengubah `app.ts`, kemungkinan besar kamu membuat file route terpisah di Tahap 4 — kembali dan perbaiki.

**Verifikasi:** `bunx tsc --noEmit` bersih, lalu `bun run dev` dan pastikan server start tanpa error.

### Tahap 6 — Uji manual semua jalur

Jalankan servernya, lalu uji satu per satu. Semua perintah di bawah harus menghasilkan hasil yang tertulis.

**Persiapan:** pastikan sudah ada user terdaftar. Kalau belum, jalankan:

```bash
curl -i -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"fadhal","email":"fadhal@localhost","password":"rahasia"}'
```

**6a. Login berhasil** → `200`, body `{"data":"<uuid>"}`

```bash
curl -i -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fadhal@localhost","password":"rahasia"}'
```

Periksa bahwa `data` benar-benar berbentuk UUID (pola `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`). Lihat 6h untuk cara memverifikasi tokennya benar-benar tersimpan.

**6b. Password salah** → `401`, body `{"error":"Email dan password salah"}`

```bash
curl -i -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fadhal@localhost","password":"salah"}'
```

**6c. Email tidak terdaftar** → `401`, body **sama persis** dengan 6b

```bash
curl -i -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tidakada@localhost","password":"rahasia"}'
```

Bandingkan output 6b dan 6c — status dan body **harus identik**. Kalau berbeda, kamu membocorkan informasi email mana yang terdaftar. Perbaiki (§4).

**6d. Body tidak lengkap** → `400`

```bash
curl -i -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fadhal@localhost"}'
```

**6e. Field kosong** → `400`

```bash
curl -i -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fadhal@localhost","password":"   "}'
```

**6f. Email case-insensitive** → `200`

Kalau kamu registrasi dengan email huruf kecil, login dengan huruf besar harus tetap berhasil:

```bash
curl -i -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"Fadhal@LocalHost","password":"rahasia"}'
```

Ini membuktikan normalisasi lowercase di service berjalan konsisten dengan registrasi. Kalau hasilnya `401`, ada bug normalisasi.

**6g. Token benar-benar tersimpan di database**

```sql
SELECT id, token, user_id, created_at FROM sessions;
```

Setelah 6a dan 6f, harus ada **2 row** (tiap login sukses membuat session baru). Periksa:

- Kolom `token` berisi UUID, **bukan** string kosong atau `NULL`.
- Kolom `token` berbeda antara satu row dan lainnya.
- Kolom `user_id` berisi `id` user yang login — cocokkan dengan `SELECT id FROM users WHERE email = 'fadhal@localhost'`.
- Token di kolom ini **sama persis** dengan token yang dikembalikan response 6a.

Kalau `sessions` kosong padahal response `200`, berarti token tidak pernah di-insert — perbaiki service.

**6h. Verifikasi token dari sisi API, bukan cuma dari SQL** — ini pemeriksaan terpenting

Cara ini membuktikan token di database dan token di response benar-benar sama:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fadhal@localhost","password":"rahasia"}' | sed 's/.*"data":"\([^"]*\)".*/\1/')

echo "Token: $TOKEN"

mysql -u root belajar_vibe_coding -e "SELECT id, user_id FROM sessions WHERE token = '$TOKEN';"
```

Harus muncul tepat **satu** row. Kalau kosong, token yang dikembalikan bukan yang disimpan.

**6i. Kolom `password` di `users` masih hash, tidak berubah**

```sql
SELECT id, name, email, password FROM users;
```

Kolom `password` harus tetap string hash bcrypt yang diawali `$2a$` atau `$2b$`, panjang sekitar 60 karakter. Login **tidak boleh** mengubah kolom ini. **Kalau kamu melihat `"rahasia"` di kolom itu, hentikan dan perbaiki — password bocor dalam bentuk plaintext.**

**6j. Response login tidak membocorkan data user**

```bash
curl -s -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fadhal@localhost","password":"rahasia"}'
# harus persis: {"data":"<uuid>"}
```

Body-nya **hanya** berisi key `data`. Tidak boleh ada `id`, `name`, `email`, `password`, `user`, atau `success`.

**6k. Registrasi masih jalan** — pastikan perubahan tidak merusak apa pun

```bash
curl -i -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"budi","email":"budi@localhost","password":"rahasia"}'
```

Harus tetap `201` + `{"data":"OK"}`.

**6l. Endpoint notes masih jalan**

```bash
curl -i http://localhost:3000/notes
```

**6m. Login tidak menerima GET** → `404`

```bash
curl -i http://localhost:3000/api/users/login
```

Belum ada handler GET, dan itu benar.

### Tahap 7 — Update README

Tambahkan baris endpoint login ke tabel "Endpoint" di README, tepat di bawah baris `POST /api/users`:

| Method | Path                | Keterangan                     |
| ------ | ------------------- | ------------------------------ |
| POST   | `/api/users/login`  | Login user, mengembalikan token |

Tambahkan juga contoh curl login di bagian contoh, dan **sebutkan bahwa endpoint ini mengembalikan token session tapi token itu belum dipakai untuk autentikasi request lain** — supaya orang berikutnya tidak menyangka ada middleware auth yang rusak.

Update bagian "Pengecualian" soal field `success` agar ikut menyebut `/api/users/login`, karena endpoint ini juga tidak memakai `success`.

Update bagian "Struktur": `users-route.ts` sekarang menangani registrasi **dan** login; `users-service.ts` menangani hash password, cek duplikat, insert user, **dan** verifikasi login + pembuatan token.

---

## 8. Definition of Done

Semua poin ini harus benar sebelum issue dianggap selesai:

- [ ] Tabel `sessions` ada di database dengan 4 kolom sesuai §3.
- [ ] Kolom `token` punya constraint UNIQUE (dibuktikan via `SHOW INDEX FROM sessions`).
- [ ] Kolom `user_id` punya foreign key ke `users.id` (dibuktikan via query `information_schema` di Tahap 2).
- [ ] Fungsi `loginUser` ada di `src/services/users-service.ts` (file baru **tidak** dibuat).
- [ ] Handler login ada di `src/routes/users-route.ts` (file baru **tidak** dibuat).
- [ ] `src/app.ts` **tidak** diubah, dan server tetap start tanpa error.
- [ ] `POST /api/users/login` dengan kredensial benar → `200` + `{"data":"<uuid>"}`.
- [ ] Token yang dikembalikan benar-benar ada di tabel `sessions` (dibuktikan via 6h).
- [ ] `POST /api/users/login` dengan password salah → `401` + `{"error":"Email dan password salah"}`.
- [ ] `POST /api/users/login` dengan email tidak terdaftar → `401` dengan body **identik** (dibuktikan dengan membandingkan 6b dan 6c).
- [ ] `POST /api/users/login` dengan body tidak lengkap → `400`.
- [ ] Login dengan email huruf besar tetap berhasil (normalisasi lowercase konsisten).
- [ ] Kolom `password` di tabel `users` tetap berisi hash bcrypt, tidak berubah oleh login.
- [ ] Response login **hanya** berisi key `data`, tanpa data user atau password.
- [ ] `users-route.ts` tidak mengimport `db`, `schema`, `bcrypt`, atau `randomUUID` (dibuktikan via grep di Tahap 4).
- [ ] `users-service.ts` tidak mengimport `elysia`.
- [ ] Response login **tidak** memakai field `success` (sesuai §4).
- [ ] `POST /api/users` masih berfungsi seperti sebelumnya.
- [ ] Endpoint `notes` masih berfungsi seperti sebelumnya.
- [ ] `bunx tsc --noEmit` bersih tanpa error.
- [ ] README sudah diupdate.

---

## 9. Yang Tidak Perlu Dikhawatirkan

Supaya tidak ada usaha terbuang:

- **Tidak perlu install dependency baru.** `crypto.randomUUID()` sudah bawaan; `bcryptjs` sudah ada.
- **Tidak perlu menulis test otomatis.** Verifikasi cukup dengan curl manual di Tahap 6.
- **Tidak perlu menambah library validasi** (zod, valibot, dll). Pakai type guard manual seperti handler registrasi.
- **Tidak perlu Docker atau file konfigurasi deployment.**
- **Tidak perlu mengubah `.env` / `.env.example`.** Tidak ada environment variable baru. Cost bcrypt dan format token semuanya di-hardcode — tidak ada yang dibaca dari env.
- **Tidak perlu menyentuh folder `drizzle/` secara manual.**
- **Tidak perlu refactor `notes` ke `services/`.** Itu pekerjaan terpisah di luar ruang lingkup.
- **Tidak perlu membuat middleware auth.** Sudah ditegaskan di §2.

---

## 10. Kalau Menemukan Kendala

Kalau ada yang tidak jelas atau tampak bertentangan, **jangan berimprovisasi diam-diam**. Tulis pertanyaannya di komentar issue atau deskripsi PR, dan sebutkan:

1. Bagian mana dari issue yang kamu anggap ambigu.
2. Apa yang kamu pilih sementara.
3. Kenapa kamu memilih itu.

Contoh hal yang **wajar** ditanyakan dan sebaiknya diangkat, bukan diputuskan sendiri:

- Apakah satu user boleh punya banyak session aktif sekaligus. Issue ini mengizinkan (setiap login membuat row baru, tidak ada penghapusan session lama). Kalau menurutmu harus dibatasi, angkat sebagai diskusi.
- Apakah token perlu masa kedaluwarsa. Issue ini tidak mengimplementasikannya.
- Perilaku `ON DELETE` pada foreign key `user_id` (§3) — sengaja dibiarkan default.

Keputusan yang sudah diambil di issue ini dan **tidak perlu** ditanyakan lagi, tapi sebaiknya disebutkan di PR:

- Body login tanpa `name` (§4).
- Status `200` untuk login sukses (§4).
- Token hanya dibuat dan disimpan, belum dipakai untuk autentikasi (§2).
- Normalisasi email lowercase (§7 Tahap 3).

Yang **tidak boleh** dilakukan: mengubah kontrak API, menambah field ke response, mengubah status code yang sudah ditetapkan, atau mengubah endpoint `notes` dan `POST /api/users` tanpa persetujuan.
