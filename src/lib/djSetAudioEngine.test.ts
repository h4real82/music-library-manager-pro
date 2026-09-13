import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DjSetAudioEngine, globalDjSetEngine } from './djSetAudioEngine';
import { TrackDef, TransitionConfig, TransitionEnvelopes } from '../types';

// Mock classes for Web Audio API & HTMLAudioElement
class MockAudioParam {
  public value: number = 0;
  public setValueAtTime = vi.fn((val: number) => { this.value = val; });
  public setTargetAtTime = vi.fn((val: number) => { this.value = val; });
}

class MockGainNode {
  public gain = new MockAudioParam();
  public connect = vi.fn();
}

class MockBiquadFilterNode {
  public type: string = '';
  public frequency = new MockAudioParam();
  public Q = new MockAudioParam();
  public gain = new MockAudioParam();
  public connect = vi.fn();
}

class MockMediaElementAudioSourceNode {
  public connect = vi.fn();
}

class MockAudioContext {
  public currentTime: number = 0;
  public state: string = 'suspended';
  public destination = {};
  public createGain = vi.fn(() => new MockGainNode());
  public createBiquadFilter = vi.fn(() => new MockBiquadFilterNode());
  public createMediaElementSource = vi.fn(() => new MockMediaElementAudioSourceNode());
  public resume = vi.fn(async () => { this.state = 'running'; });
}

class MockHTMLAudioElement {
  public crossOrigin: string = '';
  public src: string = '';
  public currentTime: number = 0;
  public playbackRate: number = 1.0;
  public paused: boolean = true;

  public load = vi.fn();
  public play = vi.fn(async () => { this.paused = false; });
  public pause = vi.fn(() => { this.paused = true; });
}

const sampleTrackA: TrackDef = {
  id: 'track-a',
  title: 'Track A',
  artist: 'Artist A',
  bpm: 128,
  key: '8A',
  energy: 7,
  duration: 180,
  url: 'https://example.com/trackA.mp3',
  filePath: '/audio/trackA.mp3',
};

const sampleTrackB: TrackDef = {
  id: 'track-b',
  title: 'Track B',
  artist: 'Artist B',
  bpm: 130,
  key: '9A',
  energy: 8,
  duration: 200,
  url: 'https://example.com/trackB.mp3',
  filePath: '/audio/trackB.mp3',
};

const sampleTransition: TransitionConfig = {
  id: 'trans-1',
  sourceTrackId: 'track-a',
  targetTrackId: 'track-b',
  sourceSlotId: 'slot-3-track-a',
  sourceSlotName: 'Outro Transition',
  sourceSlotNumber: 3,
  sourceTimeSec: 160,
  targetSlotId: 'slot-1-track-b',
  targetSlotName: 'Intro Cue',
  targetSlotNumber: 1,
  targetTimeSec: 0,
  durationBeats: 32,
  durationSec: 15,
  preset: 'bass-swap',
};

describe('DjSetAudioEngine - State Transitions and Logic', () => {
  let engine: DjSetAudioEngine;

  beforeEach(() => {
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('Audio', MockHTMLAudioElement);
    vi.stubGlobal('window', {
      AudioContext: MockAudioContext,
      Audio: MockHTMLAudioElement,
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    engine = new DjSetAudioEngine();
  });

  describe('Track Loading & Track Audio URL', () => {
    it('should generate correct audio URL depending on track parameters', () => {
      expect(engine.getTrackAudioUrl(sampleTrackA)).toBe('https://example.com/trackA.mp3');
      const filePathTrack: TrackDef = { id: 't2', title: 'T2', artist: 'A2', bpm: 120, key: '1A', energy: 5, filePath: '/path/to/song.mp3' };
      expect(engine.getTrackAudioUrl(filePathTrack)).toBe('/api/tracks/audio?path=%2Fpath%2Fto%2Fsong.mp3');
      const emptyTrack: TrackDef = { id: 't3', title: 'T3', artist: 'A3', bpm: 120, key: '1A', energy: 5 };
      expect(engine.getTrackAudioUrl(emptyTrack)).toBe('');
    });

    it('should load Deck A and Deck B with tracks and set currentTime', () => {
      engine.loadDeckA(sampleTrackA, 10);
      engine.loadDeckB(sampleTrackB, 20);

      const elements = engine.getAudioElements();
      expect(elements.audioA?.src).toBe('https://example.com/trackA.mp3');
      expect(elements.audioA?.currentTime).toBe(10);
      expect(elements.audioB?.src).toBe('https://example.com/trackB.mp3');
      expect(elements.audioB?.currentTime).toBe(20);
    });
  });

  describe('Play / Pause State Transitions', () => {
    it('should transition from paused to playing state', async () => {
      expect(engine.getIsPlaying()).toBe(false);
      engine.loadDeckA(sampleTrackA);
      await engine.play();
      expect(engine.getIsPlaying()).toBe(true);
    });

    it('should transition from playing to paused state', async () => {
      engine.loadDeckA(sampleTrackA);
      await engine.play();
      expect(engine.getIsPlaying()).toBe(true);

      engine.pause();
      expect(engine.getIsPlaying()).toBe(false);
    });

    it('should handle export singleton instance globalDjSetEngine', () => {
      expect(globalDjSetEngine).toBeInstanceOf(DjSetAudioEngine);
    });
  });

  describe('Transition Calculations (computeTransitionState)', () => {
    it('should clamp progress value to 0.0 - 1.0 range', () => {
      const stateUnder = engine.computeTransitionState(-0.5, 'bass-swap');
      expect(stateUnder.progress).toBe(0.0);

      const stateOver = engine.computeTransitionState(1.5, 'bass-swap');
      expect(stateOver.progress).toBe(1.0);
    });

    describe('bass-swap preset', () => {
      it('should compute low-end active on Deck A prior to drop (progress < 0.5)', () => {
        const state = engine.computeTransitionState(0.25, 'bass-swap');
        expect(state.isBassSwapped).toBe(false);
        expect(state.deckA.eqLow).toBe(1.0);
        expect(state.deckB.eqLow).toBe(0.0);
        expect(state.phaseLabel).toContain('Vor dem Drop');
      });

      it('should swap bass to Deck B after the drop (progress >= 0.5)', () => {
        const state = engine.computeTransitionState(0.5, 'bass-swap');
        expect(state.isBassSwapped).toBe(true);
        expect(state.deckA.eqLow).toBe(0.0);
        expect(state.deckB.eqLow).toBe(1.0);
        expect(state.phaseLabel).toContain('BASS SWAP');
      });
    });

    describe('eq-blend preset', () => {
      it('should calculate 3 phases correctly: intro layering, crossover, bass swap', () => {
        // Phase 1: progress < 0.2
        const p1 = engine.computeTransitionState(0.1, 'eq-blend');
        expect(p1.phaseLabel).toContain('Phase 1: Intro');
        expect(p1.deckA.eqLow).toBe(1.0);
        expect(p1.deckB.eqLow).toBe(0.0);

        // Phase 2: 0.2 <= progress < 0.8
        const p2 = engine.computeTransitionState(0.5, 'eq-blend');
        expect(p2.phaseLabel).toContain('Phase 2: EQ-Crossover');
        expect(p2.deckA.volume).toBeCloseTo(Math.cos(0.5 * Math.PI / 2));
        expect(p2.deckB.volume).toBeCloseTo(Math.sin(0.5 * Math.PI / 2));

        // Phase 3: progress >= 0.8
        const p3 = engine.computeTransitionState(0.9, 'eq-blend');
        expect(p3.phaseLabel).toContain('Phase 3: BASS SWAP');
        expect(p3.isBassSwapped).toBe(true);
        expect(p3.deckA.eqLow).toBe(0.0);
        expect(p3.deckB.eqLow).toBe(1.0);
      });
    });

    describe('filter-sweep preset', () => {
      it('should sweep HPF cutoff frequency up to 2500Hz before drop (progress < 0.7)', () => {
        const state = engine.computeTransitionState(0.35, 'filter-sweep');
        expect(state.isBassSwapped).toBe(false);
        expect(state.deckA.filterCutoff).toBeGreaterThan(20);
        expect(state.phaseLabel).toContain('HPF Sweep');
      });

      it('should trigger drop and swap bass when progress >= 0.7', () => {
        const state = engine.computeTransitionState(0.85, 'filter-sweep');
        expect(state.isBassSwapped).toBe(true);
        expect(state.deckA.volume).toBe(0.0);
        expect(state.deckB.volume).toBe(1.0);
        expect(state.phaseLabel).toContain('DROP');
      });
    });

    describe('cut-drop preset', () => {
      it('should keep Track A active until fader slam (progress < 0.98)', () => {
        const state = engine.computeTransitionState(0.5, 'cut-drop');
        expect(state.isBassSwapped).toBe(false);
        expect(state.deckA.volume).toBe(1.0);
        expect(state.deckB.volume).toBe(0.0);
      });

      it('should slam fader to Track B on 1.0 (progress >= 0.98)', () => {
        const state = engine.computeTransitionState(0.99, 'cut-drop');
        expect(state.isBassSwapped).toBe(true);
        expect(state.deckA.volume).toBe(0.0);
        expect(state.deckB.volume).toBe(1.0);
        expect(state.phaseLabel).toContain('FADER SLAM');
      });
    });

    describe('equal-power preset', () => {
      it('should compute trigonometric equal power curve across progress', () => {
        const state = engine.computeTransitionState(0.5, 'equal-power');
        expect(state.deckA.volume).toBeCloseTo(Math.cos(0.5 * Math.PI / 2));
        expect(state.deckB.volume).toBeCloseTo(Math.sin(0.5 * Math.PI / 2));
      });
    });

    describe('Custom Envelopes Evaluation', () => {
      it('should compute transition parameters using custom envelopes', () => {
        const customEnvelopes: TransitionEnvelopes = {
          lowA: [{ id: '1', beat: 0, value: 1.0 }, { id: '2', beat: 32, value: 0.0 }],
          lowB: [{ id: '1', beat: 0, value: 0.0 }, { id: '2', beat: 32, value: 1.0 }],
          midA: [{ id: '1', beat: 0, value: 1.0 }, { id: '2', beat: 32, value: 0.0 }],
          midB: [{ id: '1', beat: 0, value: 0.0 }, { id: '2', beat: 32, value: 1.0 }],
          highA: [{ id: '1', beat: 0, value: 1.0 }, { id: '2', beat: 32, value: 0.0 }],
          highB: [{ id: '1', beat: 0, value: 0.0 }, { id: '2', beat: 32, value: 1.0 }],
          volumeA: [{ id: '1', beat: 0, value: 1.0 }, { id: '2', beat: 32, value: 0.0 }],
          volumeB: [{ id: '1', beat: 0, value: 0.0 }, { id: '2', beat: 32, value: 1.0 }],
        };

        const stateMid = engine.computeTransitionState(0.5, 'bass-swap', customEnvelopes, 32);
        expect(stateMid.deckA.eqLow).toBe(0.5);
        expect(stateMid.deckB.eqLow).toBe(0.5);

        const stateLate = engine.computeTransitionState(0.8, 'bass-swap', customEnvelopes, 32);
        expect(stateLate.isBassSwapped).toBe(true);
        expect(stateLate.phaseLabel).toContain('BASS SWAP');
      });
    });
  });

  describe('DSP Node Updates & Callbacks (applyTransitionState & setProgress)', () => {
    it('should apply transition state to audio context nodes and invoke onStateChange callback', () => {
      engine.init(); // Initialize audio nodes
      const cb = vi.fn();
      engine.setCallback(cb);

      engine.setProgress(0.5, 'bass-swap');

      expect(cb).toHaveBeenCalledTimes(1);
      const stateArg = cb.mock.calls[0][0];
      expect(stateArg.progress).toBe(0.5);
      expect(stateArg.isBassSwapped).toBe(true);
    });
  });

  describe('Multi-Track Continuous Set Timeline State Transitions', () => {
    const tracks = [sampleTrackA, sampleTrackB];
    const transitions = [sampleTransition];

    it('should initialize continuous set mode and seek correctly', () => {
      engine.initSet(tracks, transitions, 0);
      expect(engine.getSetPlayheadSec()).toBe(0);

      engine.seekSet(50);
      expect(engine.getSetPlayheadSec()).toBe(50);
    });

    it('should transition between solo zone and overlap transition zone', () => {
      const cb = vi.fn();
      engine.onSetTimeUpdate(cb);

      // 1. Time = 10s -> Solo zone (Track A solo)
      engine.initSet(tracks, transitions, 10);
      engine.seekSet(10);
      expect(cb).toHaveBeenCalled();
      let event = cb.mock.calls[cb.mock.calls.length - 1][0];
      expect(event.activeTrackIndex).toBe(0);
      expect(event.activeTrackId).toBe('track-a');
      expect(event.activeTransitionId).toBeNull();

      // 2. Time = 165s -> Transition Overlap Zone (between 160s and 174.77s)
      engine.seekSet(165);
      event = cb.mock.calls[cb.mock.calls.length - 1][0];
      expect(event.activeTrackIndex).toBe(0);
      expect(event.activeTrackId).toBe('track-a');
      expect(event.incomingTrackId).toBe('track-b');
      expect(event.activeTransitionId).toBe('trans-1');
      expect(event.transitionProgress).toBeGreaterThan(0);
    });

    it('should unsubscribe onSetTimeUpdate callback when returned function is executed', () => {
      const cb = vi.fn();
      const unsubscribe = engine.onSetTimeUpdate(cb);

      engine.seekSet(10);
      expect(cb).toHaveBeenCalled();

      cb.mockClear();
      unsubscribe();

      engine.seekSet(20);
      expect(cb).not.toHaveBeenCalled();
    });

    it('should handle playSet with initial set start time', async () => {
      await engine.playSet(tracks, transitions, 30);
      expect(engine.getIsPlaying()).toBe(true);
      expect(engine.getSetPlayheadSec()).toBe(30);
    });
  });

  describe('Playback Controls & Deck Helpers', () => {
    it('should synchronize tempo of Deck B relative to Deck A', () => {
      engine.loadDeckA(sampleTrackA);
      engine.loadDeckB(sampleTrackB);

      engine.syncDecksTempo(128, 130);
      const elements = engine.getAudioElements();
      expect(elements.audioB?.playbackRate).toBeCloseTo(128 / 130);
    });

    it('should seek Deck A and Deck B individually', () => {
      engine.loadDeckA(sampleTrackA);
      engine.loadDeckB(sampleTrackB);

      engine.seekDeckA(45);
      engine.seekDeckB(90);

      const elements = engine.getAudioElements();
      expect(elements.audioA?.currentTime).toBe(45);
      expect(elements.audioB?.currentTime).toBe(90);
    });

    it('should nudge beatgrid of Deck A and Deck B', () => {
      engine.loadDeckA(sampleTrackA, 10);
      engine.nudgeBeatgrid('A', 500); // +500ms

      const elements = engine.getAudioElements();
      expect(elements.audioA?.currentTime).toBe(10.5);
      expect(sampleTrackA.beatgridOffsetMs).toBe(500);
    });

    it('should auto phase align Deck B to Deck A', () => {
      engine.loadDeckA(sampleTrackA, 10);
      engine.loadDeckB(sampleTrackB, 10);

      engine.autoPhaseAlign(128, 128);
      const elements = engine.getAudioElements();
      expect(elements.audioB?.currentTime).toBeDefined();
    });
  });
});
