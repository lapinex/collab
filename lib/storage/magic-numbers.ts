// Magic numbers for file type validation
// This ensures the actual file content matches the declared MIME type

export interface MagicNumberCheck {
  isValid: boolean;
  detectedMimeType?: string;
  error?: string;
}

// Magic numbers for common file types
const MAGIC_NUMBERS: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46], [0x57, 0x45, 0x42, 0x50]], // RIFF....WEBP
  'video/mp4': [[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]],
  'video/webm': [[0x1a, 0x45, 0xdf, 0xa3]],
  'audio/mpeg': [[0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]],
  'audio/ogg': [[0x4f, 0x67, 0x67, 0x53]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'application/zip': [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]],
};

export function checkMagicNumber(
  buffer: Buffer,
  declaredMimeType: string
): MagicNumberCheck {
  if (buffer.length === 0) {
    return {
      isValid: false,
      error: 'File is empty',
    };
  }

  // Get expected magic numbers for declared MIME type
  const expectedMagicNumbers = MAGIC_NUMBERS[declaredMimeType];

  if (!expectedMagicNumbers) {
    // MIME type not in our list, allow it (for MVP)
    return {
      isValid: true,
    };
  }

  // Check if buffer starts with any of the expected magic numbers
  for (const magicNumber of expectedMagicNumbers) {
    if (buffer.length < magicNumber.length) {
      continue;
    }

    let matches = true;
    for (let i = 0; i < magicNumber.length; i++) {
      if (buffer[i] !== magicNumber[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return {
        isValid: true,
        detectedMimeType: declaredMimeType,
      };
    }
  }

  // Try to detect actual MIME type
  const detectedMimeType = detectMimeTypeFromMagicNumber(buffer);

  return {
    isValid: false,
    detectedMimeType,
    error: `File content does not match declared MIME type. Detected: ${detectedMimeType || 'unknown'}, Declared: ${declaredMimeType}`,
  };
}

function detectMimeTypeFromMagicNumber(buffer: Buffer): string | undefined {
  for (const [mimeType, magicNumbers] of Object.entries(MAGIC_NUMBERS)) {
    for (const magicNumber of magicNumbers) {
      if (buffer.length < magicNumber.length) {
        continue;
      }

      let matches = true;
      for (let i = 0; i < magicNumber.length; i++) {
        if (buffer[i] !== magicNumber[i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return mimeType;
      }
    }
  }

  return undefined;
}

export function validateFileExtension(fileName: string, mimeType: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  const extensionMap: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/gif': ['gif'],
    'image/webp': ['webp'],
    'video/mp4': ['mp4'],
    'video/webm': ['webm'],
    'audio/mpeg': ['mp3', 'mpeg'],
    'audio/ogg': ['ogg'],
    'application/pdf': ['pdf'],
    'application/zip': ['zip'],
  };

  const allowedExtensions = extensionMap[mimeType];
  if (!allowedExtensions) {
    return true; // Unknown MIME type, allow
  }

  return extension ? allowedExtensions.includes(extension) : false;
}
