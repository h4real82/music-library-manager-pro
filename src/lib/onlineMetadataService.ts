import { OnlineMetadataInfo, TrackDef } from '../types';

export interface OnlineLookupResult {
  success: boolean;
  query: string;
  candidates: {
    id: string;
    title: string;
    artist: string;
    album: string;
    year: string;
    label: string;
    genre?: string;
    coverArt?: string;
    bpm?: number;
    previewUrl?: string;
    source?: string;
    isrc: string;
    tags: string[];
    score: number;
  }[];
  portalLinks: {
    name: string;
    url: string;
    icon: string;
  }[];
  networkNotice?: string;
  error?: string;
}

/**
 * Calls backend proxy /api/library/online-lookup to search MusicBrainz & online databases
 */
export async function fetchOnlineTrackMetadata(artist: string, title: string, fullQuery?: string): Promise<OnlineLookupResult> {
  const queryParam = fullQuery ? `&query=${encodeURIComponent(fullQuery)}` : '';
  const url = `/api/library/online-lookup?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}${queryParam}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Merges chosen online metadata candidate into a TrackDef
 */
export function mergeCandidateIntoTrack(
  track: TrackDef,
  candidate: OnlineLookupResult['candidates'][0],
  portalLinks?: OnlineLookupResult['portalLinks']
): Partial<TrackDef> {
  const onlineMeta: OnlineMetadataInfo = {
    matchedTitle: candidate.title,
    matchedArtist: candidate.artist,
    album: candidate.album || undefined,
    year: candidate.year || undefined,
    label: candidate.label || undefined,
    isrc: candidate.isrc || undefined,
    genre: candidate.tags && candidate.tags.length > 0 ? candidate.tags[0] : undefined,
    tags: candidate.tags,
    musicBrainzId: candidate.id,
    coverArtUrl: candidate.coverArt || undefined,
    fetchedAt: Date.now()
  };

  if (portalLinks) {
    portalLinks.forEach(p => {
      if (p.name === 'Beatport') onlineMeta.beatportUrl = p.url;
      if (p.name === 'Discogs') onlineMeta.discogsUrl = p.url;
      if (p.name === 'Traxsource') onlineMeta.traxsourceUrl = p.url;
      if (p.name === 'Spotify') onlineMeta.spotifyUrl = p.url;
      if (p.name.includes('Tunebat')) onlineMeta.tunebatUrl = p.url;
    });
  }

  return {
    title: candidate.title || track.title,
    artist: candidate.artist || track.artist,
    album: candidate.album || track.album,
    year: candidate.year || track.year,
    label: candidate.label || track.label,
    genre: candidate.genre || (candidate.tags && candidate.tags[0]) || track.genre,
    style: candidate.genre || (candidate.tags && candidate.tags.length > 0 ? candidate.tags[0] : track.style),
    coverArt: candidate.coverArt || track.coverArt,
    onlineMetadata: onlineMeta
  };
}
