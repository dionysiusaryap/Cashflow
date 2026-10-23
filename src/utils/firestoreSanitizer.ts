/**
 * Utility untuk membersihkan payload dari nilai `undefined` sebelum dikirim ke Firestore.
 * Firestore Client SDK secara ketat menolak nilai `undefined` pada properti dokumen.
 */
export function sanitizePayload<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizePayload(item)) as unknown as T;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        result[key] = sanitizePayload(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result as T;
}
