import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * Clean and sanitize filenames for safe filesystem downloads (compatible with Windows, macOS, Linux).
 */
export function sanitizeFilename(name: string, fallback = 'DJ_Set'): string {
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  // Replace illegal filename characters: \ / : * ? " < > |
  const cleaned = trimmed.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Reliably trigger a browser file download without premature blob URL revocation.
 *
 * CRITICAL FIX:
 * Revoking the object URL synchronously immediately after a.click() causes Chromium/Edge
 * on Windows to lose the download metadata and fallback to saving the file as the raw
 * Blob UUID (e.g. "1b500859-abe7-40d7-8475-d1b5c99b9339") with no file extension!
 * Keeping the URL alive for 60s ensures the browser download manager successfully
 * receives and finishes saving the file with its intended name and extension.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  a.setAttribute('download', filename);

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    try {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    } catch {
      // Ignore if element or URL was already cleared
    }
  }, 60000);
}

/**
 * Encodes an AudioBuffer to a standard 16-bit PCM WAV Blob.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = buffer.length;
  const dataByteCount = numSamples * blockAlign;
  const headerByteCount = 44;
  const totalByteCount = headerByteCount + dataByteCount;

  const arrayBuffer = new ArrayBuffer(totalByteCount);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteCount, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteCount, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export interface Mp3ExportOptions {
  bitrate?: number; // default 320 kbps
  onProgress?: (percent: number) => void;
}

/**
 * Encodes an AudioBuffer to an MP3 Blob using lamejs with asynchronous chunking,
 * ensuring the UI stays responsive and progress updates continuously.
 */
export async function audioBufferToMp3(
  buffer: AudioBuffer,
  options: Mp3ExportOptions = {}
): Promise<Blob> {
  const { bitrate = 320, onProgress } = options;
  const numChannels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;

  const mp3encoder = new Mp3Encoder(numChannels, sampleRate, bitrate);
  const mp3Chunks: Uint8Array[] = [];

  const leftFloat = buffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? buffer.getChannelData(1) : leftFloat;

  // 1152 is standard MP3 frame size. Use a multiple (1152 * 10 = 11520 samples)
  const chunkSize = 11520;
  const leftChunk = new Int16Array(chunkSize);
  const rightChunk = new Int16Array(chunkSize);

  let lastYieldTime = Date.now();

  for (let i = 0; i < numSamples; i += chunkSize) {
    const count = Math.min(chunkSize, numSamples - i);

    for (let j = 0; j < count; j++) {
      const idx = i + j;
      const l = Math.max(-1, Math.min(1, leftFloat[idx]));
      const r = Math.max(-1, Math.min(1, rightFloat[idx]));
      leftChunk[j] = l < 0 ? l * 0x8000 : l * 0x7FFF;
      rightChunk[j] = r < 0 ? r * 0x8000 : r * 0x7FFF;
    }

    const curLeft = count === chunkSize ? leftChunk : leftChunk.subarray(0, count);
    const curRight = count === chunkSize ? rightChunk : rightChunk.subarray(0, count);

    const mp3buf = numChannels > 1
      ? mp3encoder.encodeBuffer(curLeft, curRight)
      : mp3encoder.encodeBuffer(curLeft);

    if (mp3buf && mp3buf.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3buf.buffer, mp3buf.byteOffset, mp3buf.byteLength));
    }

    // Report progress
    if (onProgress) {
      const pct = Math.min(99, Math.round((i / numSamples) * 100));
      onProgress(pct);
    }

    // Yield control to event loop every ~25ms to keep UI and progress bar animated
    const now = Date.now();
    if (now - lastYieldTime > 25) {
      await new Promise(resolve => setTimeout(resolve, 0));
      lastYieldTime = Date.now();
    }
  }

  // Flush remaining buffer
  const flushBuf = mp3encoder.flush();
  if (flushBuf && flushBuf.length > 0) {
    mp3Chunks.push(new Uint8Array(flushBuf.buffer, flushBuf.byteOffset, flushBuf.byteLength));
  }

  if (onProgress) {
    onProgress(100);
  }

  return new Blob(mp3Chunks, { type: 'audio/mpeg' });
}
