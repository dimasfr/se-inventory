# NOTES

Catatan keputusan desain untuk aplikasi stock opname. Bab 1 sampai 5 mengikuti urutan pertanyaan di brief.

## Daftar isi

1. [Interpretasi dan pilihan desain](#1-interpretation-and-choices-section-22)
2. [Walkthrough: dari klik "Approve" sampai stok berubah](#2-walkthrough-from-approve-click-to-updated-stock)
3. [Item yang tidak dihitung](#3-uncounted-items)
4. [Edge case](#4-edge-cases)
5. [Satu tambahan penting](#5-one-important-addition)

---

## 1. Interpretation and choices (Section 2.2)

### Initiation

> - What happens when a manager starts a session? (snapshot of stock? which store(s)?)
> - Stock per store or total? Why?
> - Is an explicit session needed, or just use the current date? Pros/cons.

Saya memakai **sesi eksplisit**, bukan sekadar tanggal. Manager memulai sesi untuk satu toko, dan saat itu stok toko di-snapshot ke `session_items`.

- **Kenapa sesi:** opname butuh titik acuan yang tetap. Penghitungan bisa makan waktu berjam-jam, sementara stok terus berubah karena penjualan. Dengan snapshot, selisih dihitung terhadap angka yang sama dengan yang dilihat manager.
- **Kenapa bukan tanggal:** kalau hanya pakai tanggal, tidak jelas hitungan mana yang dibandingkan dengan stok mana, dan dua orang bisa menghitung toko yang sama tanpa ada yang tahu.
- **Kekurangan:** sesi bisa menggantung kalau tidak diselesaikan. Karena itu manager bisa membatalkannya.
- **Satu sesi aktif per toko**, dijaga unique index di database, supaya tidak ada dua hitungan yang saling menimpa.
- **Stok per toko**, karena yang dihitung fisik adalah isi satu toko. Total semua toko hanya dipakai untuk dashboard.

### Count submission

> - Does submission change stock immediately?
> - Duplicate items in one submission?
> - Can staff edit? Can they submit multiple times?
> - Large number of items (batching, pagination, payload limits)?

- **Submit tidak mengubah stok.** Staff hanya mengirim hasil hitungan, dan stok baru berubah setelah manager approve. Hitungan staff bisa salah, jadi harus ada orang kedua yang memeriksa sebelum angka resmi berubah.
- **Boleh sebagian.** Toko besar sering dihitung bertahap.
- **Boleh submit ulang** selama belum di-approve. Versi lama tidak dihapus, tetapi disimpan sebagai history supaya kelihatan apa yang berubah. Hanya satu submission yang `pending` pada satu waktu, jadi dua versi dengan angka berbeda tidak pernah dinilai bersamaan.
- **SKU ganda** dalam satu kiriman ditolak, karena tidak jelas angka mana yang benar.
- **Blind count.** Staff tidak pernah menerima `system_qty`, agar hitungan tidak ikut-ikutan angka sistem.
- **Jumlah item besar.** Semua item dikirim dalam satu batch, dengan batas 5000 item per submission dan 1 MB per request. Belum ada paginasi. Ini cukup untuk ribuan item, tapi bukan untuk skala yang jauh lebih besar.

### Approval

> - What happens on approve?
> - What if the post-approval process is slow? What if it fails?
> - Multiple submissions from the same store with different values?
> - What should a manager do if they disagree (reject with reason, recount)?

- **Stok di-*set* ke angka hitungan**, bukan menambahkan selisih ke stok terkini. Yang dibutuhkan adalah stok toko sama dengan kenyataan di rak. Kalau stok berubah sejak snapshot (misalnya ada penjualan), manager harus mengonfirmasi dulu, dan perubahan itu tercatat di ledger.
- **Sinkron dalam satu transaksi database**, jadi hasilnya semua berhasil atau tidak sama sekali. Kalau gagal di tengah, stok tidak berubah dan manager bisa mencoba lagi. Pendekatan ini cukup untuk skala sekarang. Untuk jumlah item jauh lebih besar, perlu job asynchronous dengan status seperti `approving` (lihat bab 2, langkah 3).
- **Beberapa submission dari toko yang sama:** satu toko hanya punya satu sesi aktif, dan submit ulang menggantikan submission `pending` sebelumnya. Manager selalu menilai satu versi saja.
- **Kalau manager tidak setuju**, dia me-reject dengan alasan wajib. Sesi kembali ke `open`, staff menghitung ulang, dan submission yang ditolak tetap tersimpan sebagai history beserta alasannya.

---

## 2. Walkthrough: from "Approve" click to updated stock

Untuk setiap langkah: apa yang bisa salah, dan apa yang saya lakukan.

### 1. Klik dan request

Klik Approve tidak langsung mengirim apa-apa, melainkan membuka dialog konfirmasi berisi jumlah item yang akan berubah dan jumlah yang tidak dihitung. Kalau ada stok yang berubah sejak snapshot, item-itemnya ditampilkan dan tombol berubah menjadi "Approve anyway". Ini mencegah klik tidak sengaja pada aksi yang mengubah stok. Setelah konfirmasi, tombol dinonaktifkan selama request berjalan, jadi klik ganda dari UI tidak mengirim dua request. Request membawa `submissionId`, yaitu submission yang sedang dilihat manager.

- **Yang bisa salah:** klik ganda, atau manager menyetujui angka yang sudah usang.
- **Penanganan:** tombol nonaktif hanya perlindungan UI. Perlindungan sebenarnya ada di server (langkah 2 dan 3).

### 2. Otorisasi dan validasi status

Endpoint `POST /sessions/:id/approve` hanya untuk role manager (staff mendapat 403). Server mengunci baris sesi dengan `FOR UPDATE`, memastikan statusnya `submitted` dan ada submission `pending`, lalu memastikan `submissionId` dari request sama dengan submission pending itu. Kalau tidak, hasilnya 409 tanpa menulis apa pun.

- **Yang bisa salah:** dua approve bersamaan, sesi yang sudah di-approve atau dibatalkan, atau staff yang submit versi baru saat manager sedang melihat versi lama.
- **Penanganan:** kunci pada sesi membuat request kedua menunggu, lalu mendapati status sudah berubah dan ditolak dengan 409. Untuk versi usang, server membalas `SUBMISSION_CHANGED`, dan UI menampilkan modal yang meminta manager menekan Refresh.

### 3. Pemrosesan

Saya memilih sinkron dalam satu transaksi database, bukan background job. Hasilnya harus pasti saat manager melihat respons, dan transaksi memberi semua-atau-tidak-sama-sekali. Baris stok toko yang terkait ikut dikunci dengan urutan `product_id` yang tetap, supaya tidak deadlock dengan proses lain yang menulis stok.

- **Yang bisa salah:** proses lambat atau gagal di tengah.
- **Penanganan:** kalau gagal, transaksi di-rollback, stok tidak berubah, sesi tetap `submitted`, dan manager bisa mencoba lagi. Untuk jumlah item yang sangat besar, pendekatan sinkron bisa melewati batas waktu, dan di skala itu perlu job asynchronous dengan status `approving`. Untuk skala sekarang saya anggap cukup.

### 4. Update stok

Sebelum menulis, server membandingkan stok terkini dengan snapshot. Kalau berbeda dan manager belum mengonfirmasi, server membalas 409 `STOCK_CHANGED` beserta daftar item, tanpa menulis apa pun. Kalau sudah dikonfirmasi, urutannya:

1. catat ke ledger `stock_movements` (`qty_before` adalah stok terkini saat approve, bukan snapshot),
2. set `store_stock` ke angka hitungan,
3. tandai submission `approved`,
4. tandai sesi `approved`.

Item yang hitungannya sama dengan stok tidak dicatat di ledger.

- **Yang bisa salah:** penjualan yang terjadi selama penghitungan tertimpa karena stok di-set langsung ke hasil hitungan.
- **Penanganan:** konfirmasi eksplisit diwajibkan (lihat bab 5). Ledger punya `UNIQUE (submission_id, product_id)` sebagai lapis kedua kalau ada approve ganda yang lolos.

### 5. Respons dan status

Server membalas ringkasan: berapa item diperbarui, berapa sudah sama, dan berapa tidak dihitung. UI menutup dialog, menampilkan ringkasan itu sebagai notifikasi hijau, dan memuat ulang halaman sehingga status menjadi `approved`.

- **Yang bisa salah:** respons hilang karena koneksi putus, padahal transaksi sudah selesai.
- **Penanganan:** manager yang mencoba lagi mendapat 409 (sesi sudah `approved`), jadi tidak ada stok yang diterapkan dua kali, dan setelah refresh dia melihat status akhirnya.
- **Keterbatasan:** approve belum idempoten dalam arti mengembalikan hasil yang sama untuk request yang sama. Saya menerima ini.

### Bukti konkurensi

Perilaku di atas diuji dengan skrip `backend/scripts/concurrency-check.js`, dijalankan dengan `npm run check:concurrency` di folder `backend` (server dan data seed harus berjalan). Hasil terakhir, semua cek lulus:

| Skenario | Hasil |
| -------- | ----- |
| 5 approve paralel pada versi aktif | 1×200 dan 4×409, stok berubah sekali, tepat satu baris ledger |
| 5 submit staff paralel dari tampilan yang sama | 1×201 dan 4×409 `SESSION_CHANGED`, tepat satu submission `pending` |
| Approve versi yang sudah digantikan | 409 `SUBMISSION_CHANGED`, stok tidak berubah |
| Submit staff dari tampilan usang setelah manager reject | 409 `SESSION_CHANGED` |

---

## 3. Uncounted items

> - Is submission with empty values allowed?
> - Treat as zero, ignore (keep previous stock), or something else?
> - What about items that don't exist in the store?

### Kosong dan nol dibedakan

Kolom yang dikosongkan berarti "tidak dihitung", sedangkan `0` berarti "sudah dihitung dan memang habis". Keduanya harus dibedakan karena akibatnya berlawanan:

- Kalau kosong dianggap nol, staff yang belum sempat menghitung separuh rak akan membuat stok separuh barang menjadi nol saat di-approve, padahal barangnya ada.
- Kalau semua kosong diabaikan tanpa cara menyatakan "habis", barang yang benar-benar kosong tidak pernah bisa dikoreksi.

Karena itu form memberi petunjuk: kosongkan kalau belum dihitung, isi `0` hanya kalau barangnya benar-benar habis.

### Cara kerjanya

Item yang kosong tidak ikut dikirim sama sekali. Frontend hanya mengirim item yang punya angka, dan server menolak nilai selain bilangan bulat ≥ 0 (negatif, desimal, atau teks mendapat 422). Pengiriman tanpa satu pun item juga ditolak 422, karena tidak ada yang bisa di-approve.

Saat approve, hanya item yang ada di submission yang disentuh. Item yang tidak dihitung dibiarkan dengan stok yang sekarang. Di layar review manager item itu ditandai "not counted", dan jumlahnya ditampilkan di statistik dan di dialog approve ("N not counted items stay unchanged"), jadi manager tahu persis apa yang tidak ikut berubah.

### Item yang tidak ada di toko

SKU yang tidak termasuk snapshot sesi (bukan milik toko itu, atau tidak dikenal) ditolak 422 dengan menyebut SKU-nya. Snapshot hanya memuat produk yang aktif. Staff hanya bisa membuka sesi tokonya sendiri, dan sesi toko lain dijawab 404, bukan 403, agar keberadaannya tidak terbongkar.

### Batasan yang saya terima

Sesi bisa di-approve walau banyak item belum dihitung. Saya tidak memaksa semua item harus terisi, karena hitungan sebagian memang disengaja (lihat bab 1). Konsekuensinya, kelengkapan hitungan menjadi tanggung jawab manager, dibantu penanda "not counted" dan statistiknya.

---

## 4. Edge cases

| Edge case | How it is handled |
| --------- | ----------------- |
| Double click atau dua approve bersamaan | Tombol dinonaktifkan selama request. Di server, baris sesi dikunci `FOR UPDATE`, jadi request pertama menang dan sisanya mendapat 409 karena status sudah `approved`. Ledger punya `UNIQUE (submission_id, product_id)` sebagai lapis kedua. |
| Stok berubah sejak snapshot (penjualan saat penghitungan) | Approve diblokir dengan 409 `STOCK_CHANGED` dan daftar item yang berbeda. Manager harus konfirmasi eksplisit ("Approve anyway"). Ledger mencatat stok terkini sebagai `qty_before`, bukan snapshot. |
| Staff submit versi baru saat manager sedang melihat versi lama | Approve dan reject membawa `submissionId`. Kalau tidak sama dengan submission pending, server membalas 409 `SUBMISSION_CHANGED`, tidak menulis apa pun, dan UI meminta manager menekan Refresh. |
| Manager reject saat staff belum tahu, lalu staff submit lagi | Submit membawa `basedOnPendingVersion`. Kalau tidak sama dengan pending di server, server membalas 409 `SESSION_CHANGED` dan staff diminta Refresh. Angka yang sudah diketik tidak hilang: input hanya diganti nilai server kalau belum diubah staff. Yang dibandingkan adalah versi pending, karena reject tidak membuat versi baru. |
| Dua sesi aktif di satu toko | Partial unique index di database. Request kedua mendapat 409. |
| Submit ganda bersamaan dari staff | Sesi dikunci, jadi hasil akhirnya tepat satu submission `pending`. Versi sebelumnya ditandai `superseded`. |
| SKU ganda, SKU di luar sesi, qty negatif/desimal/teks, submission kosong | Ditolak 422 dengan pesan per baris. Staff tidak bisa menyisipkan item di luar snapshot sesi. |
| Approve gagal di tengah proses | Satu transaksi: rollback, stok tidak berubah, sesi tetap `submitted`, manager bisa mencoba lagi. |
| Staff membuka sesi toko lain atau mencoba melihat stok sistem | Sesi toko lain dijawab 404 (bukan 403, agar keberadaannya tidak terbongkar). `systemQty` tidak pernah dikirim ke staff. |
| Sesi sudah approved atau cancelled, lalu disubmit, di-reject, atau di-approve lagi | Ditolak 409. |
| Toko tanpa item stok | Sesi tidak bisa dibuat (422). |
| Reject tanpa alasan atau alasan hanya spasi | Ditolak 400. |
| Token kedaluwarsa | 401, frontend otomatis logout. |
| Login gagal | Pesan sama untuk email salah dan password salah. bcrypt tetap dijalankan agar waktu respons tidak membedakan. |

### Belum ditangani / batasan

- `GET /sessions/:id` mengirim semua item tanpa paginasi.
- Token disimpan di `localStorage` (rentan XSS) dan tidak ada refresh token.
- Manager tidak dibatasi per toko (bisa mengelola semua toko).
- Belum ada bulk upload CSV.
- Tidak ada push atau realtime. Perubahan dari sisi lain baru terlihat setelah tombol Refresh atau saat sebuah aksi ditolak dengan 409. Penjagaannya ada di server, jadi aman, tetapi pengguna tidak diberi tahu otomatis.
- `submissionId` (approve/reject) dan `basedOnPendingVersion` (submit) wajib. Klien lain yang tidak mengirimnya mendapat 400.

---

## 5. One important addition

> - What did you add?
> - Why is it important?

**Yang saya tambahkan:** konfirmasi eksplisit saat stok berubah sejak snapshot, didukung ledger `stock_movements`.

Saat sesi dibuka, sistem menyimpan snapshot stok. Hitungan fisik di toko bisa memakan waktu, dan selama itu toko tetap berjualan. Saat manager approve, stok di-set ke angka hitungan, jadi penjualan yang terjadi sejak snapshot akan tertimpa tanpa ada yang menyadarinya. Karena itu, sebelum menulis apa pun, server membandingkan stok terkini dengan snapshot untuk item yang dihitung. Kalau berbeda dan manager belum mengonfirmasi, server membalas 409 `STOCK_CHANGED` beserta daftar item (snapshot, stok sekarang, hasil hitungan), dan tidak ada yang ditulis. Di UI, item itu disorot kuning dan tombolnya menjadi "Approve anyway". Manager bisa melanjutkan kalau memang yakin.

**Kenapa ini penting:** tanpa ini sistem bisa mengubah stok jadi salah dengan diam-diam. Hasilnya terlihat rapi karena stok sama dengan hitungan, padahal selisihnya hanyalah penjualan yang terjadi saat penghitungan. Kesalahan seperti ini sulit dilacak belakangan. Saya memilih tidak otomatis memblokir selamanya dan tidak otomatis menimpa, karena keduanya salah di sebagian kasus. Keputusannya diserahkan ke manager, tetapi dengan informasi yang lengkap.

**Ledger sebagai pelengkap:** setiap perubahan stok dicatat di `stock_movements` (siapa, kapan, sesi dan submission mana, stok sebelum dan sesudah). `qty_before` adalah stok terkini saat approve, bukan snapshot, jadi riwayatnya menunjukkan perubahan yang benar-benar terjadi. Kalau muncul pertanyaan di kemudian hari ("kenapa stok barang ini berubah?"), jawabannya bisa ditelusuri.

**Yang tidak diselesaikan:** sistem tidak mengoreksi penjualan secara otomatis. Stok ditimpa ke angka hitungan, dan manager hanya diberi tahu. Menggabungkan penjualan ke hitungan butuh data transaksi penjualan, yang di luar cakupan tugas ini.
