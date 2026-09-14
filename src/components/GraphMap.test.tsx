import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import GraphMap from './GraphMap';
import TransitionOverlapStudio from './TransitionOverlapStudio';
import { generateDefaultEnvelopes } from '../lib/djMixerLogic';
import { TrackDef, TransitionConfig } from '../types';

describe('GraphMap and TransitionOverlapStudio Node Connection', () => {
  const track1: TrackDef = {
    id: 'track-1',
    title: 'Track 1',
    artist: 'Artist 1',
    bpm: 124,
    key: '8A',
    duration: 180,
    path: '/path/1.mp3',
  };

  const track2: TrackDef = {
    id: 'track-2',
    title: 'Track 2',
    artist: 'Artist 2',
    bpm: 126,
    key: '9A',
    duration: 200,
    path: '/path/2.mp3',
  };

  it('renders TransitionOverlapStudio without throwing error for newly connected edge', () => {
    const newTransition: TransitionConfig = {
      id: 'tr-test-1',
      sourceTrackId: track1.id,
      sourceSlotId: 'slot-1',
      sourceSlotName: 'Intro',
      sourceSlotNumber: 1,
      sourceTimeSec: 0,
      targetTrackId: track2.id,
      targetSlotId: 'slot-2',
      targetSlotName: 'Drop',
      targetSlotNumber: 2,
      targetTimeSec: 32,
      durationBeats: 32,
      preset: 'bass-swap',
      envelopes: generateDefaultEnvelopes('bass-swap', 32),
    };

    expect(() => {
      renderToString(
        <TransitionOverlapStudio
          transition={newTransition}
          sourceTrack={track1}
          targetTrack={track2}
          onSave={() => {}}
          onClose={() => {}}
        />
      );
    }).not.toThrow();
  });

  it('renders GraphMap with canvas mode and transitions without error', () => {
    const newTransition: TransitionConfig = {
      id: 'tr-test-2',
      sourceTrackId: track1.id,
      sourceSlotId: 'slot-1',
      sourceSlotName: 'Intro',
      sourceSlotNumber: 1,
      sourceTimeSec: 0,
      targetTrackId: track2.id,
      targetSlotId: 'slot-2',
      targetSlotName: 'Drop',
      targetSlotNumber: 2,
      targetTimeSec: 32,
      durationBeats: 32,
      preset: 'bass-swap',
      envelopes: generateDefaultEnvelopes('bass-swap', 32),
    };

    expect(() => {
      renderToString(
        <GraphMap
          tracks={[track1, track2]}
          libraryTracks={[track1, track2]}
          transitions={[newTransition]}
          activeTransitionId={newTransition.id}
          onAddSuggested={() => {}}
          onPlaySegment={() => {}}
          onAnalyze={() => {}}
        />
      );
    }).not.toThrow();
  });
});
