export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const calculateHealthScore = (savingRate: number, debtRatio: number) => {
  let score = 100;
  
  if (savingRate >= 20) score -= 0;
  else if (savingRate >= 10) score -= 10;
  else if (savingRate > 0) score -= 30;
  else score -= 50;
  
  if (debtRatio === 0) score -= 0;
  else if (debtRatio <= 20) score -= 10;
  else if (debtRatio <= 35) score -= 20;
  else if (debtRatio <= 50) score -= 40;
  else score -= 60;

  return Math.max(0, Math.min(100, score));
};

export const getHealthScoreStatus = (score: number) => {
  if (score >= 80) return { label: 'Sangat Sehat', class: 'score-excellent' };
  if (score >= 60) return { label: 'Sehat', class: 'score-good' };
  if (score >= 40) return { label: 'Perlu Perhatian', class: 'score-warning' };
  return { label: 'Perlu Perbaikan', class: 'score-danger' };
};
