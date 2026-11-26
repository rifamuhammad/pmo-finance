import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface OfficialCatalogSeedItem {
  sku: string;
  name: string;
  category: string;
  location: string;
  unitCode: 'BU-MICE' | 'BU-KLINIK' | 'BU-ITS' | 'BU-TCI';
  unitPrice: string;
  unit: string;
  taxCode: string;
  taxScheme: 'PB1_10' | 'PPN12_PMK131' | 'PPN12_PPH4_2' | 'PPN12_PPH23' | 'BEBAS_PAJAK';
  taxInclusive: boolean;
  revenueAccountCode: string;
  overtimeNote?: string;
  freeFacilities?: string;
}

// Katalog Resmi 4 Unit Bisnis (100% Mengacu Harga COA PBI 92 Item + RAB Pendapatan 2027 v4)
export const OFFICIAL_REVENUE_CATALOG: OfficialCatalogSeedItem[] = [
  // ==================== 1. MICE (UTCC, GSG, GAZEBO, RUANG SIDANG, WISMA, OR, PERALATAN, F&B, LAUNDRY) ====================
  { sku: 'MICE-UTCC-01', name: 'UTCC Paket I (Full 8 Jam)', category: 'UTCC & Gedung', location: 'UTCC', unitCode: 'BU-MICE', unitPrice: '30000000.00', unit: 'per 8 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', overtimeNote: 'Kelebihan jam Rp 2.500.000/jam', freeFacilities: '500 kursi, 4 mic, AC, tribun, 2 meja resepsionis, meja + rempel, podium, gong, panggung musik' },
  { sku: 'MICE-UTCC-02', name: 'UTCC Paket II (4 Jam)', category: 'UTCC & Gedung', location: 'UTCC', unitCode: 'BU-MICE', unitPrice: '20000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', overtimeNote: 'Kelebihan jam Rp 2.500.000/jam', freeFacilities: '500 kursi, 4 mic, AC, tribun, 2 meja resepsionis, podium, gong, panggung musik' },
  { sku: 'MICE-UTCC-OT', name: 'Kelebihan Jam Pemakaian UTCC', category: 'UTCC & Gedung', location: 'UTCC', unitCode: 'BU-MICE', unitPrice: '2500000.00', unit: 'per jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-GSG-01', name: 'Gedung Serbaguna Lantai 2', category: 'Ruang Meeting', location: 'GSG', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 8 jam/kelas', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '50 kursi, 2 mic, AC, 1 meja resepsionis, 2 proyektor' },
  { sku: 'MICE-GSG-03', name: 'Gedung Serbaguna Lantai Dasar', category: 'Ruang Meeting', location: 'GSG', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 8 jam/kelas', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '20 kursi, 2 mic, AC, 1 meja resepsionis, proyektor' },
  { sku: 'MICE-GSG-02', name: 'Gedung Serbaguna Ruang Komputer', category: 'Ruang Meeting', location: 'GSG', unitCode: 'BU-MICE', unitPrice: '3000000.00', unit: 'per 8 jam/kelas', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '20 set komputer, mic, AC, meja resepsionis, infocus' },
  { sku: 'MICE-GZB-01', name: 'Gazebo', category: 'Area Outdoor', location: 'Gazebo', unitCode: 'BU-MICE', unitPrice: '2000000.00', unit: 'per 8 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', overtimeNote: 'Kelebihan jam 15% dari harga sewa/jam', freeFacilities: '50 kursi' },
  { sku: 'MICE-GZB-03', name: 'Air Mancur', category: 'Area Outdoor', location: 'Gazebo', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 8 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-GZB-04', name: 'Lingkungan Danau', category: 'Area Outdoor', location: 'Gazebo', unitCode: 'BU-MICE', unitPrice: '3000000.00', unit: 'per 8 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: 'Jogging track, danau, saung, flying fox' },
  { sku: 'MICE-GZB-02', name: 'Gazebo dan Area', category: 'Area Outdoor', location: 'Gazebo', unitCode: 'BU-MICE', unitPrice: '5000000.00', unit: 'per 8 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: 'Gazebo, jogging track, danau, saung, flying fox' },
  { sku: 'MICE-AUL-W1', name: 'Aula Gedung Wisma 1', category: 'UTCC & Gedung', location: 'Aula Wisma 1', unitCode: 'BU-MICE', unitPrice: '5000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', overtimeNote: 'Kelebihan jam 25%/jam', freeFacilities: '50 kursi, 2 mic, AC, meja resepsionis, 1 infocus' },
  { sku: 'MICE-AUL-LPM', name: 'Aula Gedung LPPM', category: 'UTCC & Gedung', location: 'Aula LPPM', unitCode: 'BU-MICE', unitPrice: '1500000.00', unit: 'per 8 jam/kelas', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-RNG-W1L2', name: 'Ruang Sidang Wisma 1 Lantai 2', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '200 kursi, 2 mic, AC, meja resepsionis, 1 infocus' },
  { sku: 'MICE-RNG-W1LD', name: 'Ruang Sidang Wisma 1 Lantai Dasar', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '800000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '50 kursi, 2 mic, AC, meja resepsionis, 1 infocus' },
  { sku: 'MICE-RNG-W2LD', name: 'Ruang Sidang Wisma 2 Lantai Dasar', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '70 kursi, 2 mic, AC, meja resepsionis, 1 infocus' },
  { sku: 'MICE-RNG-W2L2', name: 'Ruang Sidang Wisma 2 Lantai 2 / Lantai 3', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '800000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '20 kursi, 2 mic, AC, meja resepsionis, 1 infocus' },
  { sku: 'MICE-RNG-W3LD', name: 'Ruang Sidang Wisma 3 Lantai Dasar', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '60 kursi, 2 mic, AC, meja resepsionis, 1 infocus' },
  { sku: 'MICE-RNG-CMR', name: 'Ruang Cemara', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 8 jam/kelas', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '50 kursi, 2 mic, AC, 1 meja resepsionis, 2 proyektor' },
  { sku: 'MICE-RNG-PNS', name: 'Ruang Pinus', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '200 kursi, 2 mic, AC, meja resepsionis, 1 infocus' },
  { sku: 'MICE-RNG-RSM', name: 'Ruang Rasamala', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', overtimeNote: 'Kelebihan jam 25%/jam', freeFacilities: '70 kursi, 2 mic, AC, 1 infocus' },
  { sku: 'MICE-RNG-MTO', name: 'Ruang Matoa', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '800000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-RNG-GDR', name: 'Ruang Gandaria', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '800000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-RNG-KNR', name: 'Ruang Kenari', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '800000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '20 kursi, 2 mic, AC' },
  { sku: 'MICE-RNG-MHN', name: 'Ruang Mahoni', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '60 kursi, 2 mic, AC, 1 infocus' },
  { sku: 'MICE-RNG-MRT', name: 'Ruang Meranti', category: 'Ruang Sidang', location: 'Ruang Sidang', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-RNG-KLT', name: 'Gedung Kualitas Lantai 3', category: 'Ruang Sidang', location: 'Gedung Kualitas', unitCode: 'BU-MICE', unitPrice: '2500000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-STJ-BRM', name: 'Ruang Brahma Gedung Setijadi Lantai 1', category: 'Ruang Sidang', location: 'Gedung Setijadi', unitCode: 'BU-MICE', unitPrice: '800000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-STJ-CND', name: 'Ruang Candra Gedung Setijadi Lantai 1', category: 'Ruang Sidang', location: 'Gedung Setijadi', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-STJ-SNB', name: 'Ruang Sinabung Gedung Setijadi Lantai 2', category: 'Ruang Sidang', location: 'Gedung Setijadi', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-STJ-MRB', name: 'Ruang Merbabu Gedung Setijadi Lantai 2', category: 'Ruang Sidang', location: 'Gedung Setijadi', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-STJ-SMR', name: 'Ruang Komputer Semeru Gedung Setijadi Lantai 2', category: 'Ruang Meeting', location: 'Gedung Setijadi', unitCode: 'BU-MICE', unitPrice: '2000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-STJ-RNJ', name: 'Ruang Komputer Rinjani Gedung Setijadi Lantai 2', category: 'Ruang Meeting', location: 'Gedung Setijadi', unitCode: 'BU-MICE', unitPrice: '2000000.00', unit: 'per 4 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-RNG-UPB', name: 'Ruang Sidang UPBJJ-UT (Sentra Jawa Bali)', category: 'Ruang Sidang', location: 'R.S. UPBJJ-UT', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per 4 jam/kelas', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: '50 kursi, AC' },
  { sku: 'MICE-UPB-SKS', name: 'Ruang Sidang UPBJJ-UT (Sentra Sumatera, Kalimantan, Sulawesi)', category: 'Ruang Sidang', location: 'R.S. UPBJJ-UT', unitCode: 'BU-MICE', unitPrice: '800000.00', unit: 'per 4 jam/kelas', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-UPB-NPM', name: 'Ruang Sidang UPBJJ-UT (Sentra NTT, Papua, Maluku)', category: 'Ruang Sidang', location: 'R.S. UPBJJ-UT', unitCode: 'BU-MICE', unitPrice: '700000.00', unit: 'per 4 jam/kelas', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-UPB-SUO', name: 'Ruang Ujian Online (SUO) / Tutorial UPBJJ-UT', category: 'Ruang Sidang', location: 'R.S. UPBJJ-UT', unitCode: 'BU-MICE', unitPrice: '1500000.00', unit: 'ruang/sesi', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-KMR-STD3', name: 'Kamar Wisma 1 Standard 3 Bed', category: 'Wisma & Penginapan', location: 'Kamar', unitCode: 'BU-MICE', unitPrice: '550000.00', unit: 'kamar/hari', taxCode: 'PB1-10', taxScheme: 'PB1_10', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: 'Sarapan' },
  { sku: 'MICE-KMR-DLX2', name: 'Kamar Wisma Deluxe 2 Bed (Wisma 2/3)', category: 'Wisma & Penginapan', location: 'Kamar', unitCode: 'BU-MICE', unitPrice: '550000.00', unit: 'kamar/hari', taxCode: 'PB1-10', taxScheme: 'PB1_10', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: 'Sarapan' },
  { sku: 'MICE-KMR-DLX1', name: 'Kamar Wisma 3 Deluxe 1 Bed', category: 'Wisma & Penginapan', location: 'Kamar', unitCode: 'BU-MICE', unitPrice: '600000.00', unit: 'kamar/hari', taxCode: 'PB1-10', taxScheme: 'PB1_10', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: 'Sarapan' },
  { sku: 'MICE-KMR-JS', name: 'Kamar Wisma 2 Junior Suite / Standard 4 Bed', category: 'Wisma & Penginapan', location: 'Kamar', unitCode: 'BU-MICE', unitPrice: '700000.00', unit: 'kamar/hari', taxCode: 'PB1-10', taxScheme: 'PB1_10', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: 'Sarapan' },
  { sku: 'MICE-KMR-XB', name: 'Extra Bed Wisma', category: 'Wisma & Penginapan', location: 'Kamar', unitCode: 'BU-MICE', unitPrice: '170000.00', unit: 'kamar/hari', taxCode: 'PB1-10', taxScheme: 'PB1_10', taxInclusive: true, revenueAccountCode: '420301070200', freeFacilities: 'Sarapan' },
  { sku: 'MICE-KMR-KNC', name: 'Denda / Kunci Kamar Wisma', category: 'Wisma & Penginapan', location: 'Kunci Kamar', unitCode: 'BU-MICE', unitPrice: '50000.00', unit: 'unit', taxCode: 'PB1-10', taxScheme: 'PB1_10', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-SHT-IND', name: 'Shooting Indoor / Area Indoor', category: 'Area Outdoor', location: 'Indoor', unitCode: 'BU-MICE', unitPrice: '3000000.00', unit: 'per 8 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-SHT-OUT', name: 'Shooting Outdoor / Area Outdoor', category: 'Area Outdoor', location: 'Outdoor', unitCode: 'BU-MICE', unitPrice: '3000000.00', unit: 'per 8 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-KIS-PJS', name: 'Sewa Kios Pujasera', category: 'Sewa Ruang & Kios', location: 'Pujasera', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'per bulan', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-KTR-ATM', name: 'Sewa Ruang Kantor / Ruang ATM (Tahunan)', category: 'Sewa Ruang & Kios', location: 'Gedung UT', unitCode: 'BU-MICE', unitPrice: '120000000.00', unit: 'per tahun', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: false, revenueAccountCode: '420301070200' },
  { sku: 'MICE-OR-01', name: 'Sarana Olahraga (Basket / Futsal)', category: 'Sarana Olahraga', location: 'Sarana OR', unitCode: 'BU-MICE', unitPrice: '100000.00', unit: 'per 1 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-OR-TNS', name: 'Lapangan Tenis / Sarana OR Area Danau', category: 'Sarana Olahraga', location: 'Sarana OR', unitCode: 'BU-MICE', unitPrice: '100000.00', unit: 'per 2 jam', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  { sku: 'MICE-OR-FIT', name: 'Fitness Center', category: 'Sarana Olahraga', location: 'Sarana OR', unitCode: 'BU-MICE', unitPrice: '50000.00', unit: 'orang/masuk', taxCode: 'PPN-12-PPH42', taxScheme: 'PPN12_PPH4_2', taxInclusive: true, revenueAccountCode: '420301070200' },
  // Sewa Peralatan Event & Sarana Seni (COA 420301070300)
  { sku: 'MICE-SEN-BND', name: 'Alat Band (Set)', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'set/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-SEN-INS', name: 'Alat Musik Satuan (Gitar / Bas / Drum / Keyboard)', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '300000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-SEN-ANG', name: 'Angklung (Set)', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '500000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-SEN-MIC', name: 'Mic / Mic Clip On / Gong / Podium', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '50000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-SEN-STM', name: 'Stand Mic', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '20000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-VDT', name: 'Videotron UTCC (Sisi / Tengah)', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '5000000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-VDR', name: 'Videotron Tengah Ruang Rasamala', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '1000000.00', unit: 'hari', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-LCD', name: 'Proyektor LCD 4500 Lumen', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '2250000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-TVM', name: 'Televisi Monitor 63"', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '1500000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-PHT', name: 'Photo Booth', category: 'Sewa Peralatan Event', location: 'Sarana Seni', unitCode: 'BU-MICE', unitPrice: '250000.00', unit: 'booth/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-KRP', name: 'Karpet Merah (33 meter)', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '600000.00', unit: 'gulung/keg', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-SKT', name: 'Sketsel / Partisi', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '100000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-BZR', name: 'Stand Bazar', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '150000.00', unit: 'meja/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-PRC', name: 'Meja & Kursi Prosesi', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '60000.00', unit: 'set/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-DSP', name: 'Dispenser Juice', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '30000.00', unit: 'unit', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-SFA', name: 'Kursi Sofa / Meja Bundar / Meja Sidang / Taplak / Palet', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '25000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-SRG', name: 'Sarung Kursi', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '20000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-KRS', name: 'Kursi Kerja (Futura)', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '10000.00', unit: 'unit/8 jam', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-CNT', name: 'Container Plastik Besar (Rp 7.500) / Kecil (Rp 4.000)', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '7500.00', unit: 'unit', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  { sku: 'MICE-ALT-CNK', name: 'Cangkir Tea (Besar) & Tatakan / Peralatan Makan', category: 'Sewa Peralatan Event', location: 'Alat Resepsi', unitCode: 'BU-MICE', unitPrice: '1500.00', unit: 'unit', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301070300' },
  // F&B, Laundry & Lainnya (COA 420301090100)
  { sku: 'MICE-FB-SC', name: 'Service Charge Tambahan Sarapan / Katering', category: 'F&B & Service Charge', location: 'Service Charge', unitCode: 'BU-MICE', unitPrice: '54000.00', unit: 'pax/kegiatan', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301090100' },
  { sku: 'MICE-FB-CAF', name: 'Green Cafe & Green Catering', category: 'F&B & Service Charge', location: 'Green Cafe', unitCode: 'BU-MICE', unitPrice: '50000.00', unit: 'paket', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301090100' },
  { sku: 'MICE-LND-01', name: 'Green Laundry (Linen & Komersial)', category: 'Laundry & Lainnya', location: 'Green Laundry', unitCode: 'BU-MICE', unitPrice: '25000.00', unit: 'paket', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301090100' },
  { sku: 'MICE-OTH-SPK', name: 'Bagi Hasil SPKLU PLN & Lainnya', category: 'Laundry & Lainnya', location: 'SPKLU PLN', unitCode: 'BU-MICE', unitPrice: '2500000.00', unit: 'bulan', taxCode: 'PPN-12', taxScheme: 'PPN12_PMK131', taxInclusive: true, revenueAccountCode: '420301090100' },

  // ==================== 2. KLINIK PRATAMA (RAWAT JALAN, KAPITASI, MCU) ====================
  { sku: 'KLN-DRU-01', name: 'Jasa Dokter Umum & Rawat Jalan', category: 'Rawat Jalan Klinik', location: 'Poliklinik Umum', unitCode: 'BU-KLINIK', unitPrice: '150000.00', unit: 'kunjungan', taxCode: 'BEBAS', taxScheme: 'BEBAS_PAJAK', taxInclusive: true, revenueAccountCode: '420301060100' },
  { sku: 'KLN-DRG-01', name: 'Jasa Dokter Gigi & Perawatan Dental', category: 'Rawat Jalan Klinik', location: 'Poliklinik Gigi', unitCode: 'BU-KLINIK', unitPrice: '250000.00', unit: 'tindakan', taxCode: 'BEBAS', taxScheme: 'BEBAS_PAJAK', taxInclusive: true, revenueAccountCode: '420301060200' },
  { sku: 'KLN-LAB-01', name: 'Layanan Laboratorium & Tindakan Medis', category: 'Poliklinik Lainnya', location: 'Laboratorium', unitCode: 'BU-KLINIK', unitPrice: '50000.00', unit: 'pemeriksaan', taxCode: 'BEBAS', taxScheme: 'BEBAS_PAJAK', taxInclusive: true, revenueAccountCode: '420301069900' },
  { sku: 'KLN-KAP-BPJS', name: 'Kapitasi BPJS Kesehatan (Bulanan)', category: 'Kapitasi & Asuransi', location: 'BPJS Kesehatan', unitCode: 'BU-KLINIK', unitPrice: '2500000.00', unit: 'bulan', taxCode: 'BEBAS', taxScheme: 'BEBAS_PAJAK', taxInclusive: true, revenueAccountCode: '420301069900' },
  { sku: 'KLN-KAP-INH', name: 'Kapitasi Klinik Inhouse Mandiri Inhealth', category: 'Kapitasi & Asuransi', location: 'Mandiri Inhealth', unitCode: 'BU-KLINIK', unitPrice: '22500000.00', unit: 'bulan', taxCode: 'BEBAS', taxScheme: 'BEBAS_PAJAK', taxInclusive: true, revenueAccountCode: '420301069900' },
  { sku: 'KLN-MCU-CORP', name: 'Program Korporasi & Medical Check Up (MCU)', category: 'Program Korporasi MCU', location: 'Klinik Pratama', unitCode: 'BU-KLINIK', unitPrice: '1250000.00', unit: 'peserta', taxCode: 'BEBAS', taxScheme: 'BEBAS_PAJAK', taxInclusive: true, revenueAccountCode: '420301069900' },

  // ==================== 3. IT SOLUTION (PROMISE, SERVER, MAINTENANCE, HOSTING) ====================
  { sku: 'ITS-PRM-01', name: 'Penjualan & Implementasi Aplikasi Promise ke Perguruan Tinggi', category: 'Aplikasi Promise', location: 'IT Solution', unitCode: 'BU-ITS', unitPrice: '750000000.00', unit: 'termin/proyek', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301040200' },
  { sku: 'ITS-SRV-01', name: 'Layanan Server Management Perguruan Tinggi Lain', category: 'Server Management', location: 'IT Solution', unitCode: 'BU-ITS', unitPrice: '25000000.00', unit: 'bulan', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301040200' },
  { sku: 'ITS-MNT-01', name: 'Admin & Maintenance Aplikasi Komersial', category: 'Maintenance Aplikasi', location: 'IT Solution', unitCode: 'BU-ITS', unitPrice: '35000000.00', unit: 'bulan/paket', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301040200' },
  { sku: 'ITS-HST-01', name: 'Layanan Aplikasi Komersial & Cloud Hosting', category: 'Hosting & Cloud', location: 'IT Solution', unitCode: 'BU-ITS', unitPrice: '60000000.00', unit: 'tahun', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301040200' },

  // ==================== 4. TCI (PELATIHAN PJJ, TUTOR UT, PEKERTI, LSP P1, KURSUS) ====================
  { sku: 'TCI-PJJ-01', name: 'Program Pelatihan PJJ & Pembelajaran Digital', category: 'Pelatihan PJJ', location: 'TCI', unitCode: 'BU-TCI', unitPrice: '15000000.00', unit: 'batch', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301010200' },
  { sku: 'TCI-TUT-01', name: 'Pelatihan & Sertifikasi Tutor Universitas Terbuka', category: 'Pelatihan & Sertifikasi', location: 'TCI', unitCode: 'BU-TCI', unitPrice: '75000000.00', unit: 'batch', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301010200' },
  { sku: 'TCI-PKR-01', name: 'Pelatihan Pekerti', category: 'Pelatihan Pekerti', location: 'TCI', unitCode: 'BU-TCI', unitPrice: '3500000.00', unit: 'peserta', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301010200' },
  { sku: 'TCI-LSP-01', name: 'Uji Kompetensi LSP P1 Universitas Terbuka', category: 'Sertifikasi LSP P1', location: 'LSP P1 UT', unitCode: 'BU-TCI', unitPrice: '1500000.00', unit: 'asesi', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: true, revenueAccountCode: '420301030200' },
  { sku: 'TCI-KRS-01', name: 'Jasa Pelatihan Korporasi / Kursus / Workshop', category: 'Kursus & Workshop', location: 'TCI', unitCode: 'BU-TCI', unitPrice: '3571428.57', unit: 'hari/batch', taxCode: 'PPN-12-PPH23', taxScheme: 'PPN12_PPH23', taxInclusive: false, revenueAccountCode: '420301010200' },
];

export const DEPRECATED_COA_REMAP: Record<string, string> = {
  // 9 kode Pendapatan buatan sendiri + 1 kode di luar 5 sheet v4 -> kode resmi Pertor 310 (COA PMO per Unit 5 sheet v4.xlsx)
  '420301020200': '420301020100',
  '420301060300': '420301069900',
  '420301060400': '420301069900',
  '420301060500': '420301069900',
  '420301060600': '420301069900',
  '420301060700': '420301069900',
  '420301070201': '420301070200',
  '420301070202': '420301070200',
  '420301070203': '420301070200',
  '420301070204': '420301070200',
  // 9 kode Akun Pendukung Neraca buatan sendiri / arti beda -> kode resmi Pertor 310 Lamp. III
  '110101020100': '110102010100',
  '110101020200': '110102010300',
  '110301010100': '110302030100',
  '120301010100': '120303010100',
  '120301020100': '120307020100',
  '210201010400': '210201010500',
  '210301010100': '210101010200',
  '210401020700': '210401020900',
  '310201010100': '310101010200',
  // 1 kode Beban buatan lama -> kode resmi Pertor 310 (COA PMO per Unit v7.xlsx)
  '590101010100': '590101010300',
};

export async function syncOfficialRevenueCoaAndCatalog() {
  // 1. Non-destructively upsert all official Pertor 310 COAs from coa-pmo-official.json
  const coaPath = path.resolve(__dirname, 'coa-pmo-official.json');
  const coaList = JSON.parse(fs.readFileSync(coaPath, 'utf-8'));
  for (const c of coaList) {
    await prisma.chartOfAccount.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        type: c.type,
        normalBalance: c.normalBalance,
        isControlAccount: Boolean(c.isControlAccount),
        isActive: true,
      },
      create: {
        code: c.code,
        name: c.name,
        type: c.type,
        normalBalance: c.normalBalance,
        isControlAccount: Boolean(c.isControlAccount),
        isActive: true,
      },
    });
  }

  // 1b. Non-destructively migrate references from deprecated/fabricated COAs -> official Pertor 310 COAs & deactivate old codes
  let migratedDeprecated = 0;
  await prisma.$transaction(async (tx) => {
    for (const [oldCode, newCode] of Object.entries(DEPRECATED_COA_REMAP)) {
      await tx.journalLine.updateMany({ where: { accountCode: oldCode }, data: { accountCode: newCode } });
      await tx.bankAccount.updateMany({ where: { glAccountCode: oldCode }, data: { glAccountCode: newCode } });
      await tx.productService.updateMany({ where: { revenueAccountCode: oldCode }, data: { revenueAccountCode: newCode } });
      await tx.customerInvoice.updateMany({ where: { revenueAccountCode: oldCode }, data: { revenueAccountCode: newCode } });
      await tx.payment.updateMany({ where: { revenueAccountCode: oldCode }, data: { revenueAccountCode: newCode } });
      await tx.accountMapping.updateMany({ where: { debitAccountCode: oldCode }, data: { debitAccountCode: newCode } });
      await tx.accountMapping.updateMany({ where: { creditAccountCode: oldCode }, data: { creditAccountCode: newCode } });
      await tx.assetDepreciation.updateMany({ where: { coaCredit: oldCode }, data: { coaCredit: newCode } });
      await tx.assetExpenditure.updateMany({ where: { coaDebit: oldCode }, data: { coaDebit: newCode } });
      await tx.assetExpenditure.updateMany({ where: { coaCredit: oldCode }, data: { coaCredit: newCode } });

      const existingOld = await tx.chartOfAccount.findUnique({ where: { code: oldCode } });
      if (existingOld && existingOld.isActive) {
        const cleanName = existingOld.name.startsWith('[LEGACY]') ? existingOld.name : `[LEGACY] ${existingOld.name}`;
        await tx.chartOfAccount.update({
          where: { code: oldCode },
          data: { isActive: false, name: cleanName },
        });
        migratedDeprecated++;
      }
    }
  });

  // 2. Map Business Units
  const units = await prisma.businessUnit.findMany();
  const unitByCode = new Map(units.map((u) => [u.code, u.id]));

  let upsertedCount = 0;
  for (const item of OFFICIAL_REVENUE_CATALOG) {
    const buId = unitByCode.get(item.unitCode);
    if (!buId) continue;
    await prisma.productService.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        category: item.category,
        location: item.location,
        businessUnitId: buId,
        unitPrice: item.unitPrice,
        unit: item.unit,
        taxCode: item.taxCode,
        taxScheme: item.taxScheme,
        taxInclusive: item.taxInclusive,
        revenueAccountCode: item.revenueAccountCode,
        overtimeNote: item.overtimeNote ?? null,
        freeFacilities: item.freeFacilities ?? null,
        isActive: true,
      },
      create: {
        sku: item.sku,
        name: item.name,
        category: item.category,
        location: item.location,
        businessUnitId: buId,
        unitPrice: item.unitPrice,
        unit: item.unit,
        taxCode: item.taxCode,
        taxScheme: item.taxScheme,
        taxInclusive: item.taxInclusive,
        revenueAccountCode: item.revenueAccountCode,
        overtimeNote: item.overtimeNote ?? null,
        freeFacilities: item.freeFacilities ?? null,
        isActive: true,
      },
    });
    upsertedCount++;
  }

  // 3. Also enrich existing demo Customer profiles (e.g. BUMN -> FP_030, GOVERNMENT -> FP_020)
  await prisma.customer.updateMany({
    where: { organizationType: 'GOVERNMENT', taxCollectorProfile: 'FP_040_UMUM' },
    data: { taxCollectorProfile: 'FP_020_INSTANSI' },
  });
  await prisma.customer.updateMany({
    where: { organizationType: 'SOE_BUMN', taxCollectorProfile: 'FP_040_UMUM' },
    data: { taxCollectorProfile: 'FP_030_BUMN' },
  });

  // 4. Add Universitas Udayana & PPK Satker UT as realistic customer presets if not present
  const extraCustomers = [
    {
      code: 'CUST-UDY-01',
      name: 'Universitas Udayana',
      organizationType: 'GOVERNMENT',
      taxCollectorProfile: 'FP_020_INSTANSI',
      taxIdNpwp: '00.173.489.6-905.000',
      contactPerson: 'Tim PKS & TI Universitas Udayana',
      email: 'pks.ti@unud.ac.id',
      phone: '0361-701954',
      address: 'Kampus Bukit Jimbaran, Badung, Bali',
      creditLimit: '2000000000.00',
    },
    {
      code: 'CUST-PPK-UT',
      name: 'Pejabat Pembuat Komitmen (PPK) Satker Universitas Terbuka',
      organizationType: 'INTERNAL_UT',
      taxCollectorProfile: 'INTERNAL_UT',
      taxIdNpwp: '00.000.000.0-000.000',
      contactPerson: 'PPK Fakultas / Unit UT',
      email: 'ppk@ecampus.ut.ac.id',
      phone: '021-7490941',
      address: 'Jl. Cabe Raya, Pondok Cabe, Pamulang, Tangerang Selatan',
      creditLimit: '1000000000.00',
    },
  ];
  for (const c of extraCustomers) {
    await prisma.customer.upsert({
      where: { code: c.code },
      update: { taxCollectorProfile: c.taxCollectorProfile },
      create: c,
    });
  }

  // 5. Sync Official Single Penerimaan Bank Account (Bank Mandiri 164-00-2022-999-5) & deactivate legacy BNK-MDR-02
  const mgmtUnitId = unitByCode.get('PMO-MGMT') || units[0]?.id;
  if (mgmtUnitId) {
    await prisma.bankAccount.upsert({
      where: { code: 'BNK-MDR-01' },
      update: {
        bankName: 'Bank Mandiri - Rekening Penerimaan PMO UTama',
        accountNumberMasked: '164-00-2022-999-5',
        accountHolder: 'PTNBH UT .USAHA NON AKADEMIK',
        glAccountCode: '110102010100',
        isActive: true,
      },
      create: {
        code: 'BNK-MDR-01',
        bankName: 'Bank Mandiri - Rekening Penerimaan PMO UTama',
        accountNumberMasked: '164-00-2022-999-5',
        accountHolder: 'PTNBH UT .USAHA NON AKADEMIK',
        businessUnitId: mgmtUnitId,
        glAccountCode: '110102010100',
        currentBalance: '0',
        currency: 'IDR',
        isActive: true,
      },
    });
    await prisma.bankAccount.updateMany({
      where: { code: 'BNK-MDR-02' },
      data: { isActive: false },
    });
    await prisma.bankAccount.updateMany({
      where: { code: 'BNK-BTN-01' },
      data: { glAccountCode: '110102010300' },
    });
  }

  return { coaCount: coaList.length, catalogCount: upsertedCount, migratedDeprecated };
}

if (require.main === module) {
  syncOfficialRevenueCoaAndCatalog()
    .then((res) => {
      console.log('SYNC_OK:', res);
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error('SYNC_ERR:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
