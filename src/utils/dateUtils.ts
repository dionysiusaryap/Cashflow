/**
 * Menghitung periode bulan finansial (Financial Period) berdasarkan cutoff tanggal 25.
 * Tanggal 1 s.d. 24 = Masuk periode bulan berjalan.
 * Tanggal 25 s.d. 31 = Masuk periode bulan BERIKUTNYA.
 * 
 * @param dateStr Format ISO string atau objek Date
 * @returns Format string 'YYYY-MM'
 */
export const getFinancialPeriod = (dateStr: string | Date): string => {
  if (dateStr === 'Semua Bulan') return 'Semua Bulan';
  
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  let year = d.getFullYear();
  let month = d.getMonth() + 1; // 1-12
  const date = d.getDate();

  // Jika tanggal >= 25, maka ini adalah uang/pengeluaran untuk siklus bulan berikutnya
  if (date >= 25) {
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
 * Menghasilkan array 6 periode finansial ke belakang dari periode saat ini (format 'YYYY-MM')
 */
export const getLast6FinancialPeriods = (currentPeriod: string): string[] => {
  if (!currentPeriod || currentPeriod === 'Semua Bulan') {
    currentPeriod = getFinancialPeriod(new Date());
  }

  const [yearStr, monthStr] = currentPeriod.split('-');
  const periods: string[] = [];
  
  for (let i = 5; i >= 0; i--) {
    let m = parseInt(monthStr) - i;
    let y = parseInt(yearStr);
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    periods.push(`${y}-${m.toString().padStart(2, '0')}`);
  }
  
  return periods;
};

/**
 * Konversi string YYYY-MM ke string yang mudah dibaca, e.g. "Oktober 2026"
 */
export const formatPeriodToMonthYear = (periodStr: string): string => {
  if (!periodStr) return '';
  if (periodStr === 'Semua Bulan') return periodStr;
  
  const [year, month] = periodStr.split('-');
  if (!year || !month) return periodStr;

  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};
