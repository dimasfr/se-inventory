# NOTES

> The brief requires these answers to be written **in your own words, not AI-generated**.
> This file is only a scaffold: headings plus the questions from the brief and some points to think about. Replace the prompts with your own answers.

---

## 1. Interpretation and choices (Section 2)

### Initiation
- What happens when a manager starts a session? (snapshot of stock? which store(s)?)
- Stock per store or total? Why?
- Is an explicit session needed, or just use the current date? Pros/cons.

### Count submission
- Does submission change stock immediately?
- Duplicate items in one submission?
- Can staff edit? Can they submit multiple times?
- Large number of items (batching, pagination, payload limits)?

### Approval
- What happens on approve?
- What if the post-approval process is slow? What if it fails?
- Multiple submissions from the same store with different values?
- What should a manager do if they disagree (reject with reason, recount)?

**Keputusan (hasil diskusi, tulis ulang alasannya dengan kata sendiri):**
- Sesi eksplisit, satu sesi per toko, dengan snapshot stok saat sesi dibuka.
- Stok dikelola per toko; total hanya untuk dashboard.
- Submit boleh sebagian item; submit ulang boleh selama sesi belum di-approve, versi lama disimpan sebagai history.
- Blind count: staff tidak menerima `system_qty` dari API.
- Submit tidak mengubah stok; stok berubah hanya saat approve.
- Approve dilakukan sinkron dalam satu transaksi database.
- Reject: alasan wajib, sesi kembali `open`, submission lama jadi history, stok tidak berubah.
- Saat approve, stok di-*set langsung* ke hasil hitungan (bukan menerapkan selisih ke stok terkini).

**Your reasoning:**

TODO

---

## 2. Walkthrough: from "Approve" click to updated stock

Step by step, and for each step: what could go wrong, what you considered, what you did.

1. TODO — click / request
2. TODO — authorization and state validation
3. TODO — processing (transaction? background job?)
4. TODO — stock update
5. TODO — response / status shown to the manager

Things to think about: double click / concurrent approvals, stock changed since the snapshot, partial failure, retries and idempotency, timeouts.

**Fakta implementasi sebagai rujukan (bukan jawaban, tulis ulang dengan kata sendiri):**
- UI: klik Approve membuka dialog konfirmasi berisi jumlah item yang akan berubah; kalau ada stok yang berubah sejak snapshot, item-itemnya dicantumkan dan tombolnya menjadi "Approve anyway".
- API: `POST /sessions/:id/approve` hanya untuk manager (403 untuk staff). Sesi dikunci `FOR UPDATE`; status harus `submitted` dan harus ada submission `pending`, kalau tidak 409.
- Baris `store_stock` yang terkait ikut dikunci `FOR UPDATE` dengan urutan `product_id` tetap.
- Kalau stok terkini ≠ snapshot untuk item yang dihitung dan belum ada `confirmStockChanged: true` → 409 `STOCK_CHANGED` beserta daftar item, tidak ada yang ditulis.
- Semua dalam satu transaksi: insert ledger (`qty_before` = stok terkini, bukan snapshot), set `store_stock` ke hasil hitungan, submission → `approved`, sesi → `approved`. Item yang hitungannya sudah sama dengan stok tidak dicatat di ledger.
- Gagal di tengah → rollback, stok tidak berubah, sesi tetap `submitted`, manager bisa mencoba lagi.
- Approve ganda / bersamaan: yang pertama menang, sisanya 409 (dites dengan 3 request paralel: 1×200, 2×409). Ledger punya `UNIQUE (submission_id, product_id)` sebagai lapis kedua.
- Sinkron, tidak ada background job. Trade-off yang perlu kamu jelaskan sendiri: untuk ribuan item masih cukup cepat; untuk skala jauh lebih besar perlu job async dengan status `approving`.

---

## 3. Uncounted items

- Is submission with empty values allowed?
- Treat as zero, ignore (keep previous stock), or something else?
- What about items that don't exist in the store?
- **Keputusan (tulis ulang alasannya dengan kata sendiri):** kosong = tidak dihitung, stok tidak berubah; `0` = dihitung dan habis. Item yang tidak dihitung ditandai di layar review manager.
- **Reasoning:**

TODO

---

## 4. Edge cases

| Edge case | How it is handled |
| --------- | ----------------- |
| TODO      | TODO              |

**Daftar yang sudah ditangani di kode (pilih dan jelaskan sendiri):**
- Dua sesi aktif di satu toko: partial unique index, request kedua dapat 409.
- Stok berubah sejak snapshot (penjualan saat penghitungan): approve diblokir sampai dikonfirmasi manager.
- Double click / approve bersamaan: lihat bagian 2.
- Submit ganda bersamaan dari staff: sesi dikunci, hasil akhirnya tepat satu submission `pending`.
- SKU ganda dalam satu batch: ditolak 422 dengan nomor barisnya.
- SKU yang tidak ada di snapshot sesi / bukan milik toko itu: ditolak 422.
- Qty negatif, desimal, atau string: ditolak 422.
- Submission kosong: ditolak 422.
- Staff mengakses sesi toko lain: 404 (bukan 403, agar keberadaan sesi tidak terbongkar).
- Staff mencoba melihat stok sistem: field `systemQty` tidak pernah dikirim ke staff.
- Sesi sudah approved/cancelled lalu disubmit / di-reject / di-approve lagi: 409.
- Toko tanpa item stok: sesi tidak bisa dibuat (422).
- Reject tanpa alasan atau alasan hanya spasi: 400.
- Token kedaluwarsa: 401, frontend otomatis logout.
- Login gagal: pesan sama untuk email salah dan password salah, dengan bcrypt tetap dijalankan agar waktu respons tidak membedakan.

**Belum ditangani / batasan (bisa dijadikan bahan jujur di NOTES):**
- `GET /sessions/:id` mengirim semua item tanpa paginasi.
- Token disimpan di `localStorage` (rentan XSS), tidak ada refresh token.
- Manager tidak dibatasi per toko (bisa mengelola semua toko).
- Belum ada bulk upload CSV.

---

## 5. One important addition

- What did you add?
- Why is it important?

TODO

**Kandidat dari yang sudah dibuat (pilih satu dan jelaskan sendiri):**
- Konfirmasi eksplisit saat stok berubah sejak snapshot (`STOCK_CHANGED`).
- Ledger `stock_movements` sebagai audit trail (siapa, kapan, sebelum/sesudah).
- Riwayat submission dengan alasan reject.
