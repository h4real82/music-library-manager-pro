export interface DjoidGroup {
  id: string;
  name: string;
  mood?: string;
  style?: string;
  color?: string;
  createdAt?: number;
}

export interface TrackSegment {
  id: string;
  name: string;
  energy: number;
  key: string;
  duration: number;
  startSec: number;
  endSec: number;
  color: string;
}

export type HotCue = {
  id: string;
  slot?: number;
  timeMs: number;
  type: number;
  name: string;
};

export interface TrackDef {
  id: string;
  filename?: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  energy: number;
  vibe?: string;
  mood?: string;
  style?: string;
  groups?: string[];
  filePath?: string;
  fileSize?: number;
  format?: string;
  url?: string;
  coverArt?: string;
  gradient?: string;
  segments?: TrackSegment[];
  duration?: number;
  hotCues?: HotCue[];
  file?: File;
  fileFallback?: File;
  fileHandle?: any;
}

export interface ChapterDef {
  id: string;
  name: string;
  tracks: TrackDef[];
}

export interface PlaylistDef {
  id: string;
  name: string;
  trackIds: string[];
}



