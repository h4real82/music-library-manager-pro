import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import SetPlaylistDrawer from './SetPlaylistDrawer';
import { TrackDef } from '../types';

describe('SetPlaylistDrawer accessibility', () => {
  const mockTrack: TrackDef = {
    id: 'track-1',
    title: 'Deep Focus Track',
    artist: 'DJ Audio',
    bpm: 124,
    key: '8A',
    duration: 300,
  };

  it('renders open drawer button with correct ARIA label when collapsed', () => {
    const html = renderToString(
      <SetPlaylistDrawer
        playlist={[mockTrack]}
        onSetPlaylist={vi.fn()}
        currentTrack={null}
        isPlaying={false}
        onPlayTrack={vi.fn()}
        isOpen={false}
      />
    );

    expect(html).toContain('aria-label="Set Playlist öffnen"');
  });

  it('renders close button and track action buttons with ARIA labels when expanded', () => {
    const html = renderToString(
      <SetPlaylistDrawer
        playlist={[mockTrack]}
        onSetPlaylist={vi.fn()}
        currentTrack={null}
        isPlaying={false}
        onPlayTrack={vi.fn()}
        isOpen={true}
        onOpenSetExport={vi.fn()}
        onSaveAsPlaylist={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Set Playlist einklappen"');
    expect(html).toContain('aria-label="Playlist als M3U-Datei herunterladen"');
    expect(html).toContain('aria-label="CUE Sheet, M3U8 und Projekt-Export öffnen"');
    expect(html).toContain('aria-label="In linker Sidebar als Playlist ablegen"');
    expect(html).toContain('aria-label="Trackliste in Zwischenablage kopieren"');
    expect(html).toContain('aria-label="Set Playlist leeren"');
    expect(html).toContain('aria-label="Deep Focus Track nach oben verschieben"');
    expect(html).toContain('aria-label="Deep Focus Track nach unten verschieben"');
    expect(html).toContain('aria-label="Deep Focus Track aus Playlist entfernen"');
  });
});
