import { describe, it, expect, vi } from 'vitest';
import { sanitizeFilename, audioBufferToWav, audioBufferToMp3, downloadBlob } from './audioExport';

// Mock AudioBuffer helper for Node/Vitest
function createMockAudioBuffer(channels: number, length: number, sampleRate = 44100): AudioBuffer {
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.8;
    }
    channelData.push(data);
  }

  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (c: number) => channelData[c],
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

describe('audioExport utility tests', () => {
  describe('sanitizeFilename', () => {
    it('should sanitize illegal characters for Windows and Unix filesystems', () => {
      expect(sanitizeFilename('Techno: Set / Vol. 1 * 2026?')).toBe('Techno_ Set _ Vol. 1 _ 2026_');
      expect(sanitizeFilename('Set <Mix> | "Live"')).toBe('Set _Mix_ _ _Live_');
    });

    it('should preserve German umlauts and valid characters', () => {
      expect(sanitizeFilename('Über_Gänge_München-Set')).toBe('Über_Gänge_München-Set');
    });

    it('should fall back to default fallback if empty or all invalid', () => {
      expect(sanitizeFilename('')).toBe('DJ_Set');
      expect(sanitizeFilename('   ')).toBe('DJ_Set');
      expect(sanitizeFilename(':::')).toBe('___');
    });
  });

  describe('audioBufferToWav', () => {
    it('should generate a valid WAV blob with proper headers and length', async () => {
      const sampleRate = 44100;
      const length = sampleRate * 1; // 1 second
      const mockBuffer = createMockAudioBuffer(2, length, sampleRate);

      const blob = audioBufferToWav(mockBuffer);
      expect(blob.type).toBe('audio/wav');
      // 44 bytes header + (44100 samples * 2 channels * 2 bytesPerSample) = 44 + 176400 = 176444
      expect(blob.size).toBe(176444);

      const arrayBuffer = await blob.arrayBuffer();
      const view = new DataView(arrayBuffer);
      const textDecoder = new TextDecoder('ascii');
      const riff = textDecoder.decode(new Uint8Array(arrayBuffer.slice(0, 4)));
      const wave = textDecoder.decode(new Uint8Array(arrayBuffer.slice(8, 12)));

      expect(riff).toBe('RIFF');
      expect(wave).toBe('WAVE');
      expect(view.getUint16(20, true)).toBe(1); // PCM
      expect(view.getUint16(22, true)).toBe(2); // Stereo
      expect(view.getUint32(24, true)).toBe(44100); // Sample rate
    });
  });

  describe('audioBufferToMp3', () => {
    it('should encode stereo AudioBuffer to MP3 with progress tracking', async () => {
      const sampleRate = 44100;
      const length = sampleRate * 2; // 2 seconds
      const mockBuffer = createMockAudioBuffer(2, length, sampleRate);

      const progressValues: number[] = [];
      const blob = await audioBufferToMp3(mockBuffer, {
        bitrate: 320,
        onProgress: (pct) => progressValues.push(pct),
      });

      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBeGreaterThan(50000);
      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });
  });

  describe('downloadBlob', () => {
    it('should set download attributes and delay URL revocation', () => {
      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;

      const mockUrl = 'blob:http://localhost:3000/1234-uuid';
      URL.createObjectURL = vi.fn(() => mockUrl);
      URL.revokeObjectURL = vi.fn();

      const appendChildMock = vi.fn();
      const clickMock = vi.fn();
      const mockElement = {
        style: {},
        href: '',
        download: '',
        setAttribute: vi.fn(),
        click: clickMock,
      };

      const mockDoc = {
        createElement: vi.fn(() => mockElement),
        body: {
          appendChild: appendChildMock,
          contains: vi.fn(() => true),
          removeChild: vi.fn(),
        },
      };

      (globalThis as any).window = {};
      (globalThis as any).document = mockDoc;

      const blob = new Blob(['test'], { type: 'text/plain' });
      downloadBlob(blob, 'TestMix.mp3');

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(mockDoc.createElement).toHaveBeenCalledWith('a');
      expect(mockElement.download).toBe('TestMix.mp3');
      expect(mockElement.setAttribute).toHaveBeenCalledWith('download', 'TestMix.mp3');
      expect(appendChildMock).toHaveBeenCalledWith(mockElement);
      expect(clickMock).toHaveBeenCalled();
      // Should NOT revoke immediately!
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();

      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      delete (globalThis as any).window;
      delete (globalThis as any).document;
    });
  });
});
