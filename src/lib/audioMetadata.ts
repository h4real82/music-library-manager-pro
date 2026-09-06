// @ts-ignore
import * as jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import { TagType } from 'jsmediatags/types';

export interface ExtractedMetadata {
  title: string;
  artist: string;
  album?: string;
  coverArt?: string;
  bpm?: number;
  key?: string;
  duration?: number;
}

/**
 * Fast and safe byte array to base64 conversion without blowing the call stack or freezing the UI.
 */
function uint8ArrayToBase64(data: number[] | Uint8Array): string {
  const CHUNK_SIZE = 8192;
  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
    const chunk = uint8.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

/**
 * Parses basic filename into artist and title if "Artist - Title" format exists.
 */
function parseFilenameFallback(filename: string): { title: string; artist: string } {
  const cleanName = filename.replace(/\.[^/.]+$/, "").trim();
  if (cleanName.includes(' - ')) {
    const parts = cleanName.split(' - ');
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim() || cleanName
    };
  }
  return {
    artist: 'Unknown Artist',
    title: cleanName || 'Untitled Track'
  };
}

/**
 * Safely extract audio duration using the browser's HTML5 Audio API.
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      return resolve(0);
    }

    const audio = new Audio();
    let resolved = false;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = '';
      }
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };

    const done = (dur: number) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(dur > 0 && !isNaN(dur) ? Math.round(dur) : 0);
    };

    const onLoaded = () => done(audio.duration);
    const onError = () => done(0);

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    audio.src = objectUrl;

    // Timeout after 3 seconds in case metadata never loads
    setTimeout(() => done(0), 3000);
  });
}

export function extractMetadata(file: File): Promise<ExtractedMetadata> {
  const fallback = parseFilenameFallback(file.name);

  return new Promise((resolve) => {
    let hasResolved = false;

    const safeResolve = (meta: ExtractedMetadata) => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(meta);
      }
    };

    // Safety timeout: Never hang for more than 2 seconds
    const timer = setTimeout(() => {
      safeResolve({
        title: fallback.title,
        artist: fallback.artist
      });
    }, 2000);

    try {
      jsmediatags.read(file, {
        onSuccess: (tag: TagType) => {
          clearTimeout(timer);
          try {
            const tags = tag.tags || {};
            let coverArt: string | undefined;

            if (tags.picture && tags.picture.data && tags.picture.data.length > 0) {
              // Limit cover art to ~800KB to avoid excessive storage or memory usage
              if (tags.picture.data.length < 800000) {
                try {
                  const format = tags.picture.format || 'image/jpeg';
                  const base64 = uint8ArrayToBase64(tags.picture.data);
                  coverArt = `data:${format};base64,${base64}`;
                } catch {
                  // Ignore cover art conversion error
                }
              }
            }

            let bpm: number | undefined;
            if (tags.TBPM && tags.TBPM.data) {
              const parsed = parseInt(String(tags.TBPM.data), 10);
              if (!isNaN(parsed) && parsed > 0 && parsed < 300) {
                bpm = parsed;
              }
            }

            let key: string | undefined;
            if (tags.TKEY && tags.TKEY.data) {
              key = String(tags.TKEY.data).trim();
            }

            const title = (tags.title && String(tags.title).trim()) || fallback.title;
            const artist = (tags.artist && String(tags.artist).trim()) || fallback.artist;

            safeResolve({
              title,
              artist,
              album: tags.album ? String(tags.album) : undefined,
              coverArt,
              bpm,
              key
            });
          } catch (err) {
            safeResolve({
              title: fallback.title,
              artist: fallback.artist
            });
          }
        },
        onError: () => {
          clearTimeout(timer);
          safeResolve({
            title: fallback.title,
            artist: fallback.artist
          });
        }
      });
    } catch (err) {
      clearTimeout(timer);
      safeResolve({
        title: fallback.title,
        artist: fallback.artist
      });
    }
  });
}

// Helper to generate a unique ID
export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

