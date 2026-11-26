# Contributing to NontonDrama / LK21 Metadata API

Terima kasih sudah tertarik berkontribusi untuk komunitas!

## Cara Berkontribusi

1. **Fork** repository ini dan buat branch baru dari `main`:
   ```bash
   git checkout -b feat/nama-fitur
   ```
2. Install dependencies & jalankan tes:
   ```bash
   npm install
   npm test
   ```
3. Pastikan seluruh tes lulus (`vitest run`) dan tidak ada file `.env` atau kredensial rahasia yang ikut ter-commit.
4. Perbarui dokumentasi di `docs/API.md` dan `docs/openapi.yaml` jika menambah atau mengubah endpoint.
5. Ajukan **Pull Request** dengan penjelasan singkat mengenai perubahan dan hasil pengujian.

## Aturan Proyek

- **Metadata-only:** Kontribusi harus tetap berfokus pada metadata katalog, performa API, caching, observabilitas, dan keandalan parser — jangan menambahkan kode bypass CAPTCHA, bypass proteksi akses, atau distribusi file/stream video berhak cipta.
- **Jangan merusak data lama:** Perubahan pada modul database wajib mempertahankan prinsip non-destructive upsert.
- **Hormat pada website sumber:** Jangan menghapus rate limiting atau concurrency cap pada scraper client.
