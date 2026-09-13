import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateId } from './audioMetadata';

describe('generateId', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should return alphanumeric strings without special characters', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('should generate unique IDs across multiple calls (non-collision test)', () => {
    const count = 1000;
    const generatedIds = new Set<string>();

    for (let i = 0; i < count; i++) {
      const id = generateId();
      generatedIds.add(id);
    }

    expect(generatedIds.size).toBe(count);
  });

  it('should produce deterministic output when Math.random is mocked', () => {
    // Math.random() = 0.123456789
    // (0.123456789).toString(36) => "0.4fzzzx..."
    // substring(2, 9) extracts 7 chars after "0."
    const mockValue = 0.123456789;
    vi.spyOn(Math, 'random').mockReturnValue(mockValue);

    const expectedSubstring = mockValue.toString(36).substring(2, 9);
    const id = generateId();

    expect(id).toBe(expectedSubstring);
  });

  it('should handle edge values for Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const idZero = generateId();
    expect(typeof idZero).toBe('string');

    vi.spyOn(Math, 'random').mockReturnValue(0.999999999999);
    const idMax = generateId();
    expect(typeof idMax).toBe('string');
  });
});
