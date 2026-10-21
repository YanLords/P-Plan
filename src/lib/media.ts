/** Réduit un logo choisi par l'utilisateur en data URL PNG (stockée dans les réglages). */
export async function logoDataUrl(file: File, maxSize = 600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const encode = (limit: number): string => {
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponible');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  };
  try {
    const full = encode(maxSize);
    if (full.length <= 400_000) return full;
    // ponytail: un seul repli à 320 px suffit pour tenir dans le quota localStorage
    return encode(320);
  } finally {
    bitmap.close?.();
  }
}
