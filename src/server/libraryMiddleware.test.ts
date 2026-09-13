import { describe, test, expect } from 'bun:test';
import { isSafeSubpath } from './libraryMiddleware';

describe('isSafeSubpath Security Tests', () => {
  const baseDir = '/app/LIBRARY';

  test('allows safe subpath files inside library directory', () => {
    expect(isSafeSubpath(baseDir, '/app/LIBRARY/audio.mp3')).toBe(true);
    expect(isSafeSubpath(baseDir, '/app/LIBRARY/subfolder/audio.mp3')).toBe(true);
  });

  test('prevents prefix collision directory traversal attack', () => {
    // /app/LIBRARY-secret startsWith /app/LIBRARY, but is NOT inside /app/LIBRARY
    expect(isSafeSubpath(baseDir, '/app/LIBRARY-secret/passwords.txt')).toBe(false);
  });

  test('prevents standard relative directory traversal attack', () => {
    expect(isSafeSubpath(baseDir, '/app/LIBRARY/../etc/passwd')).toBe(false);
    expect(isSafeSubpath(baseDir, '../etc/passwd')).toBe(false);
  });

  test('prevents accessing base directory itself', () => {
    expect(isSafeSubpath(baseDir, '/app/LIBRARY')).toBe(false);
  });
});
