import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import BeatgridRepairModal from './BeatgridRepairModal';
import { TrackDef } from '../types';

describe('BeatgridRepairModal Performance Waveform & Sync Studio', () => {
  const testTrack: TrackDef = {
    id: 'track-bg-1',
    title: 'Cyberpulse Anthem',
    artist: 'Future DJ',
    bpm: 128,
    key: '11A',
    energy: 7,
    duration: 210,
    beatgridOffsetMs: 45,
  };

  const partnerTrack: TrackDef = {
    id: 'track-bg-2',
    title: 'Sub Zero Bass',
    artist: 'Neon Producer',
    bpm: 128,
    key: '12A',
    energy: 8,
    duration: 195,
    beatgridOffsetMs: 15,
  };

  it('renders BeatgridRepairModal with performance waveform and track info', () => {
    const html = renderToString(
      <BeatgridRepairModal
        track={testTrack}
        onSave={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('Taktgitter &amp; Phasen-Reparatur');
    expect(html).toContain('Performance Waveform Studio');
    expect(html).toContain('Cyberpulse Anthem');
    expect(html).toContain('Future DJ');
    expect(html).toContain('+45');
    expect(html).toContain('ms');

    // Performance waveform elements
    expect(html).toContain('bgRepairBodyGradTrack');
    expect(html).toContain('bgRepairCoreGradTrack');
    expect(html).toContain('Visual Beatgrid &amp; Transient Monitor');
    expect(html).toContain('Phase Nudge');
    expect(html).toContain('TAP TEMPO');
  });

  it('renders stacked dual-lane comparison mode when referenceTrack is provided', () => {
    const html = renderToString(
      <BeatgridRepairModal
        track={testTrack}
        referenceTrack={partnerTrack}
        onSave={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('DECK A (Referenz)');
    expect(html).toContain('Sub Zero Bass');
    expect(html).toContain('DECK B (In Bearbeitung)');
    expect(html).toContain('Cyberpulse Anthem');
    expect(html).toContain('bgRepairBodyGradRef');
    expect(html).toContain('bgRepairCoreGradRef');
    expect(html).toContain('Beide Decks');
    expect(html).toContain('Auto-Phase Lock mit Partner');
  });

  it('renders nudge controls for fine millisecond and beat adjustments', () => {
    const html = renderToString(
      <BeatgridRepairModal
        track={testTrack}
        onSave={() => {}}
        onClose={() => {}}
      />
    );

    expect(html).toContain('-1 ms');
    expect(html).toContain('+1 ms');
    expect(html).toContain('-10 ms');
    expect(html).toContain('+10 ms');
    expect(html).toContain('-1/4 Beat');
    expect(html).toContain('+1/4 Beat');
    expect(html).toContain('-1 Beat');
    expect(html).toContain('+1 Beat');
  });
});
