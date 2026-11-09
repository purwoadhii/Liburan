// Isi game yang mudah diubah. Simpan file ini, lalu muat ulang halaman.
window.SAFARI = {
  judul: 'Liburan Safari',
  subjudul: 'Jalan-jalan berdua, bergandengan tangan',
  namaGerbang: 'PETUALANGAN SAFARI',
  namaPasangan: 'Dia',

  // Obrolan AI: berapa pesan terakhir yang dikirim ke AI berikutnya (hemat kuota)
  riwayatAI: 3,

  // Waktu: jam saat mulai (0-23) dan berapa menit nyata untuk 1 jam di game
  jamMulai: 9,
  menitPerJam: 1,

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
    babyzoo: 'Ada kelinci dan kambing kecil. Lucu!',
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
