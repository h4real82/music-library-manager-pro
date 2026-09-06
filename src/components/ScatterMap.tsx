import React from 'react';
import TrackMapper from './TrackMapper';
import { Track } from '../App';

interface ScatterMapProps {
  tracks: Track[];
  onPlay: (track: Track) => void;
  onAddMultiple: (tracks: Track[]) => void;
}

/**
 * ScatterMap (Legacy alias for TrackMapper)
 */
export default function ScatterMap(props: ScatterMapProps) {
  return <TrackMapper {...props} />;
}
