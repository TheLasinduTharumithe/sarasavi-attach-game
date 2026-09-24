import { base64ToImgSrc, fileToWebpBase64 } from "avatar64";

export type ImageKind = "bookCover" | "authorAvatar" | "advertisement";

const IMAGE_PROFILES: Record<ImageKind, {
  maxSize: number;
  quality: number;
  maxDecodedBytes: number;
}> = {
  bookCover: { maxSize: 640, quality: 0.72, maxDecodedBytes: 280 * 1024 },
  authorAvatar: { maxSize: 320, quality: 0.78, maxDecodedBytes: 220 * 1024 },
  advertisement: { maxSize: 960, quality: 0.68, maxDecodedBytes: 650 * 1024 },
};

export async function imageFileToBase64(file: File, kind: ImageKind): Promise<string> {
  const profile = IMAGE_PROFILES[kind];
  const result = await fileToWebpBase64(file, {
    maxSize: profile.maxSize,
    quality: profile.quality,
    maxInputBytes: 6 * 1024 * 1024,
    allowedMime: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });

  if (result.decodedBytes > profile.maxDecodedBytes) {
    const maxKb = Math.floor(profile.maxDecodedBytes / 1024);
    throw new Error(`The optimized image is still too large. Please use an image smaller than ${maxKb} KB.`);
  }

  // avatar64 returns plain WebP Base64 text. Firestore stores this string directly.
  return result.base64;
}

export function imageSrc(value?: string | null): string {
  if (!value) return "";
  if (/^(https?:|blob:|\/)/i.test(value)) return value;

  try {
    return base64ToImgSrc(value, {
      mimeFallback: "image/webp",
      maxBase64Chars: 1_000_000,
      maxDecodedBytes: 700 * 1024,
    });
  } catch {
    return "";
  }
}
