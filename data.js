// Isi game yang mudah diubah. Simpan file ini, lalu muat ulang halaman.
window.SAFARI = {
  judul: 'Liburan Safari',
  subjudul: 'Jalan-jalan berdua, bergandengan tangan',
  namaGerbang: 'PETUALANGAN SAFARI',
  namaPasangan: 'Dia',

  // Obrolan AI: berapa pesan terakhir yang dikirim ke AI berikutnya (hemat kuota)
  riwayatAI: 3,

  // Waktu taman ikut jam dunia nyata (sama untuk semua orang): 1 hari di taman = 60 menit nyata
  menitPerHari: 60,
  // Uang jajan berdua per hari (rupiah), kembali penuh setiap jam berikut (waktu taman)
  uangHarian: 200000,
  jamReset: 7,

  // Topi saat siang terik
  tanyaTopi: 'Kamu pasti merasa panas kan? Ingin mengenakan topi?',
  saatPasangTopi: ['Sini, aku pakaikan. Biar kamu nggak kepanasan.'],
  setelahPakaiTopi: ['Nah, cantik. Sekarang nggak kepanasan lagi.'],
  jawabTidakTopi: ['Oke, bilang aja ya kalau kepanasan.'],

  // Warna baju (boleh diganti kode warna lain)
  bajuKamu: '#e8836f',
  bajuPasangan: '#4f7d6b',
  celanaPasangan: '#c9b28a',

  // Kalimat pasangan saat diketuk
  kataPasangan: [
    'Senang banget bisa liburan berdua sama kamu.',
    'Tanganmu jangan dilepas ya, nanti hilang di antara jerapah.',
    'Capek? Nanti kita istirahat di dekat air terjun.',
    'Foto dulu yuk, mumpung pemandangannya bagus.',
    'Kamu mau lihat hewan apa lagi?',
    'Hari ini rasanya pengin lama-lama aja.'
  ],

  // Kalau kamu menabrak pengunjung lain
  kataTabrak: [
    'Hati-hati kalau jalan! Pakai mata dong!',
    'Aduh! Hati-hati dong kalau jalan, pakai mata!'
  ],
  maafPasangan: ['Maaf ya, nggak sengaja.', 'Maaf, Kak. Kami kurang hati-hati.'],

  // Pengunjung yang minta izin duduk di meja kalian
  tanyaNumpang: ['Permisi, apakah boleh duduk di sini?', 'Permisi Kak, kursi ini kosong? Boleh saya duduk di sini?'],
  jawabBoleh: ['Terima kasih ya!', 'Makasih banyak, Kak.'],
  jawabPelit: ['Dasar pelit!', 'Huh, dasar pelit!'],
  setelahPelit: ['Biarin aja, kita lagi pengin berdua kan.'],
  // Kalau kalian duduk di meja yang sudah ada orangnya, dia mengeluh lalu pergi
  keluhDuduk: ['Ini orang siapa sih? Main duduk aja, nggak permisi! Nggak sopan banget.'],

  // Jawaban orang lain setelah kamu mengetik balasan (⌨️ Balas)
  balasanNpc: {
    tegur: ['Ya sudah, lain kali hati-hati!', 'Hmm, iya deh.'],
    keluh: ['Ya sudah, aku pindah aja.', 'Huh!'],
    pelit: ['Bodo amat!', 'Hmph!'],
    boleh: ['Iya, sama-sama.', 'Makasih ya, Kak.'],
    pelayan: ['Sama-sama, Kak!', 'Siap, Kak. Selamat makan!'],
    _: ['Oh, iya.', 'Hmm.']
  },

  // Komentar pasangan saat pertama kali masuk sebuah area
  komentarZona: {
    parkir: 'Sudah sampai! Yuk masuk lewat gerbang.',
    flamingo: 'Lihat, flamingonya pink semua!',
    gajah: 'Gajahnya besar banget, lihat belalainya.',
    singa: 'Hati-hati, itu raja hutan. Jangan dekat-dekat pagar.',
    unta: 'Untanya santai banget jalannya.',
    bison: 'Bison itu kuat, lihat punuknya.',
    jerapah: 'Lehernya tinggi sekali. Coba kasih wortel!',
    zebra: 'Belangnya rapi ya, kayak garis-garis bajumu.',
    babyzoo: 'Ada kelinci kecil. Lucu!',
    rekreasi: 'Naik bianglala nanti sore yuk.',
    harimau: 'Harimaunya lagi jalan-jalan juga, kayak kita.',
    beruang: 'Itu beruang madu, ada tanda oranye di dadanya.',
    kemah: 'Kapan-kapan kita kemah di sini ya.',
    panda: 'Pandanya lagi makan bambu. Gemas!',
    airterjun: 'Dengar suara airnya? Adem banget di sini.',
    foodcourt: 'Banyak banget pilihannya. Kamu mau makan apa?',
    bioskop: 'Nonton film yuk, aku yang pilih tempat duduknya.',
    burung: 'Ayo masuk ke sangkar burung. Pelan-pelan ya, biar burungnya nggak kaget.'
  }
};
