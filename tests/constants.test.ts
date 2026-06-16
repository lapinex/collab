import { describe, it, expect } from '@jest/globals';
import { MESSAGE_LIMITS, FILE_LIMITS } from '@/lib/constants';

describe('Constants', () => {
  it('should have reasonable message limits', () => {
    expect(MESSAGE_LIMITS.MAX_CONTENT_LENGTH).toBeGreaterThan(0);
    expect(MESSAGE_LIMITS.MAX_CONTENT_LENGTH).toBeLessThan(10000);
  });

  it('should have positive file limits', () => {
    expect(FILE_LIMITS.MAX_FILE_SIZE).toBeGreaterThan(0);
    expect(FILE_LIMITS.MAX_IMAGE_SIZE).toBeGreaterThan(0);
    expect(FILE_LIMITS.MAX_VIDEO_SIZE).toBeGreaterThan(0);
    expect(FILE_LIMITS.MAX_GIF_SIZE).toBeGreaterThan(0);
  });
});
