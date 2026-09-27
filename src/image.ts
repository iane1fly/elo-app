import { IMAGE_DATA_URL_LIMITS } from './profile';

export type ImagePurpose = 'avatar' | 'cover' | 'post';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const IMAGE_SETTINGS: Record<ImagePurpose, { maxDimension: number; maxBytes: number; maxDataUrlLength: number }> = {
  avatar: { maxDimension: 512, maxBytes: 72 * 1024, maxDataUrlLength: IMAGE_DATA_URL_LIMITS.avatar },
  cover: { maxDimension: 1600, maxBytes: 270 * 1024, maxDataUrlLength: IMAGE_DATA_URL_LIMITS.cover },
  post: { maxDimension: 1440, maxBytes: 270 * 1024, maxDataUrlLength: IMAGE_DATA_URL_LIMITS.post },
};

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível processar esta imagem.'));
    }, 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Não foi possível preparar a imagem.'));
    reader.onerror = () => reject(new Error('Não foi possível preparar a imagem.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Keeps the original file on the user's device. The returned compact JPEG is
 * embedded in Elo's Firestore document, avoiding a paid Firebase Storage plan.
 */
export async function compressLocalImage(file: File, purpose: ImagePurpose): Promise<string> {
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(file.type.toLowerCase())) {
    throw new Error('Escolhe uma imagem JPG, PNG ou WebP.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('A imagem original tem de ter menos de 10 MB.');
  }
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Este navegador não consegue processar imagens locais. Tenta outro navegador.');
  }

  let bitmap: ImageBitmap | undefined;
  const canvas = document.createElement('canvas');
  try {
    bitmap = await createImageBitmap(file);
    const settings = IMAGE_SETTINGS[purpose];
    const longestSide = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, settings.maxDimension / longestSide);
    const qualities = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];

    for (let sizeAttempt = 0; sizeAttempt < 6; sizeAttempt += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível preparar a imagem.');

      // Flatten transparent PNGs onto the app's white background before JPEG conversion.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const blob = await canvasToJpeg(canvas, quality);
        if (blob.size > settings.maxBytes) continue;
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl.length <= settings.maxDataUrlLength) return dataUrl;
      }
      scale *= 0.82;
    }
    throw new Error('A imagem continua demasiado grande. Escolhe uma imagem mais pequena.');
  } finally {
    bitmap?.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
