import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import SetExportModal from './SetExportModal';
import TrackMapper from './TrackMapper';
import { Track } from '../App';

describe('View and Export Enhancements', () => {
  const sampleTracks: Track[] = [
    {
      id: 't-1',
      title: 'Hypnotic Beats',
      artist: 'DJ One',
      bpm: 128,
      key: '8A',
      energy: 7,
      duration: 360,
      coverArt: 'data:image/png;base64,sampleCover1',
    },
    {
      id: 't-2',
      title: 'Dark Dimension',
      artist: 'DJ Two',
      bpm: 128, // Same BPM
      key: '8A', // Same Key!
      energy: 7,
      duration: 340,
      coverArt: 'data:image/png;base64,sampleCover2',
    },
    {
      id: 't-3',
      title: 'Ethereal Flight',
      artist: 'DJ Three',
      bpm: 130,
      key: '9A',
      energy: 8,
      duration: 400,
    },
  ];

  it('SetExportModal renders strictly MP3, Playlist, and TXT export options with accessible dialog ARIA markup', () => {
    const html = renderToString(
      <SetExportModal
        isOpen={true}
        onClose={() => {}}
        tracks={sampleTracks}
        transitions={[]}
        onSaveAsPlaylist={() => {}}
      />
    );

    // Verify exactly the requested export options are present
    expect(html).toContain('Audio Mix (.mp3)');
    expect(html).toContain('M3U-Playliste (.m3u8)');
    expect(html).toContain('Trackliste (.txt)');

    // Verify dialog accessibility attributes
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="export-modal-title"');
    expect(html).toContain('id="export-modal-title"');

    // Verify accessible form input
    expect(html).toContain('id="playlist-name-input"');
    expect(html).toContain('aria-label="Name des DJ Sets"');

    // Verify CUE and JSON project export options are removed from export options
    expect(html).not.toContain('CUE-Sheet (.cue)');
    expect(html).not.toContain('Set-Projekt (.json)');
  });

  it('TrackMapper renders with BPM and Key as default axes and shows miniature cover artwork', () => {
    const html = renderToString(
      <TrackMapper
        tracks={sampleTracks}
        onPlay={() => {}}
        onAddMultiple={() => {}}
      />
    );

    // Default axes should be BPM and Camelot Key
    expect(html).toContain('BPM (Tempo)');
    expect(html).toContain('Camelot Key (1A - 12B)');

    // Should render cover thumbnails for tracks with coverArt
    expect(html).toContain('data:image/png;base64,sampleCover1');
    expect(html).toContain('data:image/png;base64,sampleCover2');

    // Verify that co-located tracks (t-1 and t-2 have identical 128 BPM and 8A Key)
    // do not have identical coordinates in the rendered styles
    // Extract left and top style percentages
    const t1Match = html.match(/data:image\/png;base64,sampleCover1[\s\S]*?<\/div>/);
    const leftMatches = [...html.matchAll(/left:([^;%]+)%/g)].map(m => parseFloat(m[1]));
    const topMatches = [...html.matchAll(/top:([^;%]+)%/g)].map(m => parseFloat(m[1]));

    expect(leftMatches.length).toBeGreaterThanOrEqual(2);
    expect(topMatches.length).toBeGreaterThanOrEqual(2);

    // Positions of t-1 and t-2 should not be identical because of anti-collision layout
    const pos1 = { x: leftMatches[0], y: topMatches[0] };
    const pos2 = { x: leftMatches[1], y: topMatches[1] };
    const dist = Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y);
    expect(dist).toBeGreaterThan(0.5); // Successfully separated without overlapping!
  });
});
