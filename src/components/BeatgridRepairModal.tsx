import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, RotateCcw, Check, Sparkles, Sliders, Activity, Zap, Volume2, ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { TrackDef } from '../types';
import { globalDjSetEngine } from '../lib/djSetAudioEngine';

interface BeatgridRepairModalProps {
  track: TrackDef;
  referenceTrack?: TrackDef | null;
  onSave: (updatedTrack: TrackDef) => void;
  onClose: () => void;
}

export default function BeatgridRepairModal({
  track,
  referenceTrack,
  onSave,
  onClose,
}: BeatgridRepairModalProps) {
  const [bpm, setBpm] = useState<number>(track.bpm || 130);
  const [offsetMs, setOffsetMs] = useState<number>(track.beatgridOffsetMs || 0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [metronomeEnabled, setMetronomeEnabled] = useState<boolean>(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastClickBeatRef = useRef<number>(-1);

  const beatDurationSec = 60 / bpm;
  const barDurationSec = beatDurationSec * 4;

  // Initialize preview audio
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = track.url || (track.filePath ? `/api/tracks/audio?path=${encodeURIComponent(track.filePath)}` : '');
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (audio) setCurrentTimeSec(audio.currentTime);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', () => setIsPlaying(false));

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [track]);

  // Metronome Sound Generator using Web Audio API
  const playClick = (isDownbeat: boolean) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 880 : 440, ctx.currentTime);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {}
  };

  // Metronome tick detection
  useEffect(() => {
    if (!isPlaying || !metronomeEnabled) return;
    const adjustedTime = currentTimeSec - (offsetMs / 1000);
    if (adjustedTime < 0) return;

    const currentBeat = Math.floor(adjustedTime / beatDurationSec);
    if (currentBeat !== lastClickBeatRef.current) {
      lastClickBeatRef.current = currentBeat;
      const isDownbeat = currentBeat % 4 === 0;
      playClick(isDownbeat);
    }
  }, [currentTimeSec, isPlaying, metronomeEnabled, offsetMs, beatDurationSec]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleNudge = (deltaMs: number) => {
    setOffsetMs(prev => prev + deltaMs);
  };

  const handleSetDownbeatAtPlayhead = () => {
    // Current time modulo bar duration
    const currentPos = currentTimeSec;
    const currentBarPhase = currentPos % barDurationSec;
    // Set offset so current position aligns with downbeat (0)
    const newOffsetMs = Math.round(currentBarPhase * 1000);
    setOffsetMs(newOffsetMs);
  };

  const handleAutoPhaseAlignWithPartner = () => {
    if (!referenceTrack) return;
    const partnerBpm = referenceTrack.bpm || 130;
    const partnerBeatSec = 60 / partnerBpm;
    const partnerOffsetSec = (referenceTrack.beatgridOffsetMs || 0) / 1000;

    // Phase difference relative to reference track
    const myBeatSec = 60 / bpm;
    const diffSec = (partnerOffsetSec % partnerBeatSec) - (offsetMs / 1000 % myBeatSec);
    const newOffsetMs = Math.round((offsetMs + (diffSec * 1000)));
    setOffsetMs(newOffsetMs);
  };

  const handleSave = () => {
    const updated: TrackDef = {
      ...track,
      bpm,
      beatgridOffsetMs: offsetMs,
    };
    onSave(updated);
    onClose();
  };

  const currentOffsetSec = offsetMs / 1000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#12141A] border border-[#2A303F] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden shadow-purple-950/40">
        
        {/* MODAL HEADER */}
        <div className="p-4 border-b border-[#242936] bg-[#161920] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white font-mono flex items-center gap-2">
                <span>Taktgitter & Phasen-Reparatur</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-900/60 text-purple-300 border border-purple-400/30">
                  Precision Beatgrid Studio
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Passe Taktanker, Phase und Tempo an, falls das Lied nicht synchron läuft.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-[#242936] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TRACK & SYNC OVERVIEW BAR */}
        <div className="px-6 py-3 bg-[#0D0E12] border-b border-[#242936] flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {track.coverArt ? (
              <img src={track.coverArt} className="w-10 h-10 rounded-lg object-cover border border-[#242936]" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#161920] border border-[#242936] flex items-center justify-center text-gray-500">
                DJ
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate max-w-xs">{track.title}</div>
              <div className="text-[11px] text-gray-400 truncate max-w-xs">{track.artist}</div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 bg-[#161920] px-3 py-1.5 rounded-xl border border-[#242936]">
              <span className="text-gray-400">BPM:</span>
              <span className="text-cyan-400 font-black">{bpm.toFixed(1)}</span>
            </div>

            <div className="flex items-center gap-2 bg-[#161920] px-3 py-1.5 rounded-xl border border-[#242936]">
              <span className="text-gray-400">Taktverschiebung:</span>
              <span className={`font-black ${offsetMs === 0 ? 'text-gray-400' : offsetMs > 0 ? 'text-purple-400' : 'text-amber-400'}`}>
                {offsetMs > 0 ? `+${offsetMs}` : offsetMs} ms
              </span>
              <span className="text-[10px] text-gray-500">
                ({(offsetMs / (beatDurationSec * 1000)).toFixed(2)} Beats)
              </span>
            </div>

            {referenceTrack && (
              <div className="flex items-center gap-2 bg-purple-950/30 px-3 py-1.5 rounded-xl border border-purple-500/30 text-purple-300">
                <span className="text-gray-400">Partner:</span>
                <span className="font-bold truncate max-w-[120px]">{referenceTrack.title}</span>
                <span className="text-cyan-400 font-bold">({referenceTrack.bpm} BPM)</span>
              </div>
            )}
          </div>
        </div>

        {/* INTERACTIVE WAVEFORM & BEATGRID CANVAS */}
        <div className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto">
          
          <div className="bg-[#0B0D12] border border-[#242936] rounded-xl p-4 relative overflow-hidden shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <span>Visual Beatgrid Monitor</span>
                <span className="text-[10px] text-purple-400 font-normal">• Rote Striche = Takt-Eins • Weiße Striche = Viertelschläge</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMetronomeEnabled(!metronomeEnabled)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all ${
                    metronomeEnabled 
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50' 
                      : 'bg-[#161920] text-gray-500 border border-[#242936]'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Metronom {metronomeEnabled ? 'EIN' : 'AUS'}</span>
                </button>
              </div>
            </div>

            {/* Visual Beatgrid Track with Kick Pulses */}
            <div className="relative h-28 bg-[#12141C] rounded-lg overflow-hidden border border-[#242936] flex items-center">
              
              {/* Vertical Beat Grid Lines */}
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 64 }).map((_, beatIdx) => {
                  const beatTimeSec = currentOffsetSec + (beatIdx * beatDurationSec);
                  const leftPct = ((beatTimeSec % 20) / 20) * 100;
                  const isDownbeat = beatIdx % 4 === 0;

                  return (
                    <div
                      key={beatIdx}
                      className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none transition-all"
                      style={{ left: `${leftPct}%` }}
                    >
                      <div className={`w-[2px] h-full ${isDownbeat ? 'bg-red-500/90 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-white/40'}`} />
                      {isDownbeat && (
                        <span className="absolute top-1 text-[9px] font-mono font-bold text-red-400 bg-black/80 px-1 rounded">
                          {(beatIdx / 4) + 1}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Simulated Spectral Waveform Bars */}
              <div className="w-full h-full flex items-center px-2 relative z-10 pointer-events-none">
                {Array.from({ length: 120 }).map((_, idx) => {
                  const t = (idx / 120) * 20;
                  const relTime = t - currentOffsetSec;
                  const beatPhase = ((relTime / beatDurationSec) % 1 + 1) % 1;
                  const isKick = beatPhase < 0.25;
                  const height = isKick ? 85 : Math.max(15, Math.sin(idx * 0.4) * 45 + 30);

                  return (
                    <div
                      key={idx}
                      className={`flex-1 mx-[1px] rounded-sm transition-all ${
                        isKick 
                          ? 'bg-gradient-to-t from-red-600 via-orange-500 to-amber-300' 
                          : 'bg-gradient-to-t from-cyan-600 via-cyan-400 to-teal-300 opacity-60'
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>

              {/* Audio Playhead Needle */}
              <div 
                className="absolute top-0 bottom-0 w-[2px] bg-yellow-400 z-30 shadow-[0_0_8px_rgba(250,204,21,1)]"
                style={{ left: `${((currentTimeSec % 20) / 20) * 100}%` }}
              />
            </div>
          </div>

          {/* REPAIR TOOLS CONTROLS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* COLUMN 1: PHASE NUDGE */}
            <div className="p-4 bg-[#161920] border border-[#242936] rounded-xl flex flex-col gap-3">
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <span>Phase Nudge (Verschiebung)</span>
              </span>
              <p className="text-[11px] text-gray-400">
                Schiebe das Taktgitter millimetergenau nach links oder rechts:
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleNudge(-10)}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3 text-purple-400" />
                  <span>-10 ms</span>
                </button>
                <button
                  onClick={() => handleNudge(10)}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <span>+10 ms</span>
                  <ArrowRight className="w-3 h-3 text-purple-400" />
                </button>

                <button
                  onClick={() => handleNudge(-Math.round(beatDurationSec * 250))}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <ChevronsLeft className="w-3 h-3 text-cyan-400" />
                  <span>-1/4 Beat</span>
                </button>
                <button
                  onClick={() => handleNudge(Math.round(beatDurationSec * 250))}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <span>+1/4 Beat</span>
                  <ChevronsRight className="w-3 h-3 text-cyan-400" />
                </button>

                <button
                  onClick={() => handleNudge(-Math.round(beatDurationSec * 1000))}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <ChevronsLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>-1 Beat</span>
                </button>
                <button
                  onClick={() => handleNudge(Math.round(beatDurationSec * 1000))}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <span>+1 Beat</span>
                  <ChevronsRight className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </div>

              <button
                onClick={() => setOffsetMs(0)}
                className="w-full py-1 text-[10px] font-mono text-gray-500 hover:text-gray-300 transition-colors text-center"
              >
                Verschiebung auf 0 ms zurücksetzen
              </button>
            </div>

            {/* COLUMN 2: DOWNBEAT ANCHOR & AUTO-ALIGN */}
            <div className="p-4 bg-[#161920] border border-[#242936] rounded-xl flex flex-col justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Takt-Eins & Auto-Align</span>
                </span>
                <p className="text-[11px] text-gray-400 mt-1">
                  Setze den ersten Takt-Schlag („Eins“) oder gleiche die Phase automatisch an:
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleSetDownbeatAtPlayhead}
                  className="w-full py-2 bg-gradient-to-r from-amber-600/30 to-red-600/30 hover:from-amber-600/50 hover:to-red-600/50 text-amber-200 border border-amber-500/40 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                  title="Setzt den Downbeat Marker exakt auf die aktuelle Abspielposition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Takt-Eins hier setzen</span>
                </button>

                {referenceTrack && (
                  <button
                    onClick={handleAutoPhaseAlignWithPartner}
                    className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-900/30"
                    title="Richtet die Phase von Deck B exakt am Taktgitter von Deck A aus"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-300" />
                    <span>Auto-Phase Lock mit Partner</span>
                  </button>
                )}
              </div>

              <span className="text-[10px] text-gray-500 font-mono">
                Tipp: Bei Phasenverschiebungen im Mix klicke auf Auto-Phase Lock.
              </span>
            </div>

            {/* COLUMN 3: BPM FINE-TUNING */}
            <div className="p-4 bg-[#161920] border border-[#242936] rounded-xl flex flex-col justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>BPM Feintuning</span>
                </span>
                <p className="text-[11px] text-gray-400 mt-1">
                  Justiere das Tempo, falls das Taktgitter mit der Zeit wegläuft:
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 my-1">
                <button
                  onClick={() => setBpm(b => Math.round((b - 0.1) * 10) / 10)}
                  className="px-2 py-1 bg-[#0D0E12] hover:bg-[#242936] text-gray-300 rounded font-mono font-bold text-xs border border-[#242936]"
                >
                  -0.1
                </button>
                <input
                  type="number"
                  step="0.1"
                  value={bpm}
                  onChange={(e) => setBpm(parseFloat(e.target.value) || bpm)}
                  className="w-24 bg-[#0D0E12] border border-[#242936] rounded px-2 py-1 text-center font-mono font-black text-cyan-300 text-sm focus:border-cyan-500 outline-none"
                />
                <button
                  onClick={() => setBpm(b => Math.round((b + 0.1) * 10) / 10)}
                  className="px-2 py-1 bg-[#0D0E12] hover:bg-[#242936] text-gray-300 rounded font-mono font-bold text-xs border border-[#242936]"
                >
                  +0.1
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setBpm(b => Math.round(b / 2 * 10) / 10)}
                  className="flex-1 py-1 bg-[#0D0E12] hover:bg-[#242936] text-gray-400 hover:text-white rounded text-[11px] font-mono border border-[#242936]"
                  title="Halbes Tempo (/2)"
                >
                  /2 (Halftime)
                </button>
                <button
                  onClick={() => setBpm(b => Math.round(b * 2 * 10) / 10)}
                  className="flex-1 py-1 bg-[#0D0E12] hover:bg-[#242936] text-gray-400 hover:text-white rounded text-[11px] font-mono border border-[#242936]"
                  title="Doppeltes Tempo (x2)"
                >
                  x2 (Double)
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-[#242936] bg-[#161920] flex items-center justify-between">
          <button
            onClick={togglePlay}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-md ${
              isPlaying 
                ? 'bg-amber-600 hover:bg-amber-500 text-white' 
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
            <span>{isPlaying ? 'PAUSE' : 'VORHÖREN'}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-gray-400 hover:text-white transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white text-xs font-mono font-bold shadow-lg shadow-purple-900/30 transition-all hover:scale-105 active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Taktgitter Speichern & Anwenden</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
