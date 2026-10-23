/**
 * Helper terpusat untuk perhitungan tanggal, periode anggaran, dan horizon kewajiban.
 */

/**
 * Ekstraksi komponen tahun, bulan, dan tanggal lokal dari string atau Date
 * untuk mencegah pergeseran tanggal akibat UTC/Timezone offset.
 */
export const extractDateParts = (dateInput: string | Date): { year: number; month: number; day: number } | null => {
  if (!dateInput || dateInput === 'Semua Bulan') return null;

  if (typeof dateInput === 'string') {
    // Jika format 'YYYY-MM-DD' atau dimulai dengan 'YYYY-MM-DD'
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10), // 1 - 12
        day: parseInt(match[3], 10)     // 1 - 31
      };
    }
  }

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate()
  };
};

/**
 * Menghitung periode anggaran finansial berdasarkan cutoff tanggal 25.
 * Tanggal 1 s.d. 24 = Masuk periode bulan berjalan ('YYYY-MM').
 * Tanggal 25 s.d. akhir bulan = Masuk periode bulan BERIKUTNYA ('YYYY-(MM+1)').
 * Peralihan Desember (bulan 12) tanggal 25+ akan menjadi Januari tahun berikutnya.
 *
 * @param dateInput Format string ('YYYY-MM-DD' / ISO) atau Date
 * @returns Format string 'YYYY-MM' atau 'Semua Bulan'
 */
export const getFinancialPeriod = (dateInput: string | Date): string => {
  if (dateInput === 'Semua Bulan') return 'Semua Bulan';

  const parts = extractDateParts(dateInput);
  if (!parts) return '';

  let { year, month, day } = parts;

  // Cutoff tanggal 25: masuk ke anggaran bulan berikutnya
  if (day >= 25) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const monthStr = month.toString().padStart(2, '0');
  return `${year}-${monthStr}`;
};

/**
 * Menghasilkan array periode finansial ke belakang dari periode tertentu.
 */
export const getLast6FinancialPeriods = (currentPeriod: string): string[] => {
  if (!currentPeriod || currentPeriod === 'Semua Bulan') {
    currentPeriod = getFinancialPeriod(new Date());
  }

  const [yearStr, monthStr] = currentPeriod.split('-');
  const periods: string[] = [];

  for (let i = 5; i >= 0; i--) {
    let m = parseInt(monthStr, 10) - i;
    let y = parseInt(yearStr, 10);
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    periods.push(`${y}-${m.toString().padStart(2, '0')}`);
  }

  return periods;
};

/**
 * Konversi string YYYY-MM ke nama bulan dan tahun Indonesia, e.g. "Oktober 2026"
 */
export const formatPeriodToMonthYear = (periodStr: string): string => {
  if (!periodStr) return '';
  if (periodStr === 'Semua Bulan') return 'Pengeluaran Rutin (Semua Bulan)';

  const [yearStr, monthStr] = periodStr.split('-');
  if (!yearStr || !monthStr) return periodStr;

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const mIndex = parseInt(monthStr, 10) - 1;
  if (mIndex >= 0 && mIndex < 12) {
    return `${monthNames[mIndex]} ${yearStr}`;
  }

  return periodStr;
};

/**
 * Format tanggal Indonesia ramah pengguna: "25 Okt 2026"
 */
export const formatDateShort = (dateInput: string | Date): string => {
  if (dateInput === 'Semua Bulan') return 'Semua Bulan';
  const parts = extractDateParts(dateInput);
  if (!parts) return '-';

  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${parts.day} ${shortMonths[parts.month - 1]} ${parts.year}`;
};

/**
 * Menghitung selisih hari antara tanggal target dengan tanggal hari ini (atau baseDate).
 * Positif = di masa depan (masih ada sisa hari).
 * 0 = hari ini.
 * Negatif = terlambat (overdue).
 */
export const getDaysRemaining = (dueDateInput: string | Date, baseDate: Date = new Date()): number => {
  const dueParts = extractDateParts(dueDateInput);
  if (!dueParts) return 0;

  const targetDate = new Date(dueParts.year, dueParts.month - 1, dueParts.day);
  const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());

  const diffTime = targetDate.getTime() - base.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Menghitung tanggal jatuh tempo berikutnya (+1 bulan dari tanggal saat ini)
 */
export const calculateNextMonthlyDueDate = (currentDueDateStr: string): string => {
  const parts = extractDateParts(currentDueDateStr);
  if (!parts) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + 1);
    return fallback.toISOString().split('T')[0];
  }

  let nextYear = parts.year;
  let nextMonth = parts.month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  // Tangani kasus akhir bulan (misal tanggal 31 di bulan yang hanya ada 30 atau 28 hari)
  const maxDaysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
  const nextDay = Math.min(parts.day, maxDaysInNextMonth);

  return `${nextYear}-${nextMonth.toString().padStart(2, '0')}-${nextDay.toString().padStart(2, '0')}`;
};

/**
 * Menghitung tanggal jatuh tempo sebelumnya (-1 bulan dari tanggal saat ini untuk keperluan rollback/reversal)
 */
export const calculatePreviousMonthlyDueDate = (currentDueDateStr: string): string => {
  const parts = extractDateParts(currentDueDateStr);
  if (!parts) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() - 1);
    return fallback.toISOString().split('T')[0];
  }

  let prevYear = parts.year;
  let prevMonth = parts.month - 1;
  if (prevMonth <= 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const maxDaysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
  const prevDay = Math.min(parts.day, maxDaysInPrevMonth);

  return `${prevYear}-${prevMonth.toString().padStart(2, '0')}-${prevDay.toString().padStart(2, '0')}`;
};

/**
 * Mendapatkan timestamp saat ini secara terisolasi untuk event handlers
 */
export const getCurrentTimestamp = (): number => {
  return Date.now();
};
