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
}

export function extractMetadata(file: File): Promise<ExtractedMetadata> {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: (tag: TagType) => {
        const tags = tag.tags;
        let coverArt: string | undefined;

        if (tags.picture) {
          const { data, format } = tags.picture;
          let base64String = '';
          for (let i = 0; i < data.length; i++) {
            base64String += String.fromCharCode(data[i]);
          }
          coverArt = `data:${format};base64,${btoa(base64String)}`;
        }

        resolve({
          title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
          artist: tags.artist || 'Unknown Artist',
          album: tags.album,
          coverArt,
          // Extract BPM if present in ID3 TBP/TBPM tag
          bpm: tags.TBPM ? parseInt(tags.TBPM.data, 10) : undefined,
          // Key if present (TKEY)
          key: tags.TKEY ? tags.TKEY.data : undefined,
        });
      },
      onError: (error) => {
        console.warn('Metadata extraction error for', file.name, error);
        // Fallback to basic file info
        resolve({
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: 'Unknown Artist',
        });
      }
    });
  });
}

// Helper to generate a unique ID
export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}
