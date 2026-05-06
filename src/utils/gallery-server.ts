/**
 * Validación de imágenes para la galería (servidor).
 */

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Comprueba que los primeros bytes coincidan con el MIME declarado. */
export function bufferMatchesImageMime(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;
  switch (mime) {
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.subarray(0, 8).equals(PNG_SIG);
    case "image/gif": {
      const sig = buffer.subarray(0, 6).toString("ascii");
      return sig === "GIF87a" || sig === "GIF89a";
    }
    case "image/webp":
      return (
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}
