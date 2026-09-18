import React, { useState, useEffect } from 'react';
import { 
  Download, 
  FileText, 
  Bookmark, 
  Check, 
  X, 
  Music, 
  Share2, 
  Sparkles, 
  Upload, 
  Sliders, 
  Layers, 
  Clock 
} from 'lucide-react';
import { TrackDef, TransitionConfig } from '../types';
import { 
  downloadBlob, 
  audioBufferToWav, 
  audioBufferToMp3, 
  sanitizeFilename 
} from '../lib/audioExport';

interface SetExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: TrackDef[];
  transitions: TransitionConfig[];
  trackStartTimes?: Record<string, number>;
  onSaveAsPlaylist: (name: string) => void;
  onImportProject?: (tracks: TrackDef[], transitions: TransitionConfig[]) => void;
}

export default function SetExportModal({
  isOpen,
  onClose,
  tracks,
  transitions,
  trackStartTimes,
  onSaveAsPlaylist,
  onImportProject,
}: SetExportModalProps) {
  const [playlistName, setPlaylistName] = useState(
    () => `Techno Set - ${new Date().toLocaleDateString('de-DE')}`
  );
  const [isSavedPlaylist, setIsSavedPlaylist] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [exportFormat, setExportFormat] = useState<'mp3' | 'wav'>('mp3');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Resolve timeline start times for each track (either from timeline layout or transition cues)
  const getResolvedTrackStartTimes = (): number[] => {
    const resolved: number[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (trackStartTimes && trackStartTimes[t.id] !== undefined) {
        resolved.push(trackStartTimes[t.id]);
      } else if (i === 0) {
        resolved.push(0);
      } else {
        const prevTrack = tracks[i - 1];
        const prevStart = resolved[i - 1];
        const prevDur = prevTrack.duration || 180;
        const trans = transitions.find(
          tr => (tr.sourceTrackId === prevTrack.id && tr.targetTrackId === t.id) || tr.sourceTrackId === prevTrack.id
        );
        const bpmA = prevTrack.bpm || 130;
        const transDurSec = ((trans?.durationBeats ?? 32) * 60) / bpmA;
        const sourceTimeSec = trans?.sourceTimeSec !== undefined ? trans.sourceTimeSec : Math.max(0, prevDur - transDurSec);
        const targetTimeSec = trans?.targetTimeSec !== undefined ? trans.targetTimeSec : 0;
        const calculatedStart = Math.max(0, prevStart + sourceTimeSec - targetTimeSec);
        resolved.push(calculatedStart);
      }
    }
    return resolved;
  };

  const resolvedStartTimes = getResolvedTrackStartTimes();
  const totalDurationSec = tracks.reduce((acc, t) => acc + (t.duration || 180), 0);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. Save Set as Playlist in Left Sidebar
  const handleSavePlaylist = () => {
    if (!playlistName.trim()) return;
    onSaveAsPlaylist(playlistName.trim());
    setIsSavedPlaylist(true);
    setTimeout(() => setIsSavedPlaylist(false), 3000);
  };

  // 2. Export M3U8 Playlist
  const handleExportM3U = () => {
    if (tracks.length === 0) return;
    let content = '#EXTM3U\n';
    tracks.forEach((t) => {
      const dur = Math.round(t.duration || 0);
      content += `#EXTINF:${dur},${t.artist} - ${t.title}\n`;
      content += `${t.filePath || t.filename || `${t.title}.mp3`}\n`;
    });

    const blob = new Blob([content], { type: 'audio/x-mpegurl;charset=utf-8' });
    const safeName = sanitizeFilename(playlistName, 'DJ_Set');
    downloadBlob(blob, `${safeName}.m3u8`);
    triggerSuccessFeedback('m3u');
  };

  // 3. Export Formatted Tracklist (.txt)
  const handleExportTxt = () => {
    if (tracks.length === 0) return;

    let content = `=====================================================\n`;
    content += `MuLiMa Pro DJ Studio - Trackliste\n`;
    content += `Set: ${playlistName}\n`;
    content += `Datum: ${new Date().toLocaleDateString('de-DE')}\n`;
    content += `Tracks: ${tracks.length} | Gesamtdauer: ${formatTime(totalDurationSec)}\n`;
    content += `=====================================================\n\n`;

    tracks.forEach((track, idx) => {
      const currentStartSec = resolvedStartTimes[idx] ?? 0;
      const trackNum = (idx + 1).toString().padStart(2, '0');
      const startMin = Math.floor(currentStartSec / 60).toString().padStart(2, '0');
      const startSec = Math.floor(currentStartSec % 60).toString().padStart(2, '0');
      const timestamp = `[${startMin}:${startSec}]`;
      const bpmStr = track.bpm ? `${track.bpm} BPM` : '--- BPM';
      const keyStr = track.key ? `Key: ${track.key}` : '';
      const durStr = formatTime(track.duration || 0);

      content += `${trackNum}. ${timestamp} ${track.artist || 'Unknown'} - ${track.title} (${bpmStr}${keyStr ? ' | ' + keyStr : ''} | ${durStr})\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const safeName = sanitizeFilename(playlistName, 'DJ_Set');
    downloadBlob(blob, `${safeName}_Tracklist.txt`);
    triggerSuccessFeedback('txt');
  };

  // 3. Export CUE Sheet with calculated track start times
  const handleExportCue = () => {
    if (tracks.length === 0) return;

    let content = `REM Generated by MuLiMa Pro DJ Studio\n`;
    content += `PERFORMER "MuLiMa Pro DJ"\n`;
    content += `TITLE "${playlistName}"\n`;
    content += `FILE "DJ_Set.mp3" MP3\n`;

    tracks.forEach((track, idx) => {
      const currentStartSec = resolvedStartTimes[idx] ?? 0;
      const trackNum = (idx + 1).toString().padStart(2, '0');
      const startMin = Math.floor(currentStartSec / 60).toString().padStart(2, '0');
      const startSec = Math.floor(currentStartSec % 60).toString().padStart(2, '0');
      const startFrames = Math.floor((currentStartSec % 1) * 75).toString().padStart(2, '0');

      content += `  TRACK ${trackNum} AUDIO\n`;
      content += `    TITLE "${track.title}"\n`;
      content += `    PERFORMER "${track.artist}"\n`;
      content += `    INDEX 01 ${startMin}:${startSec}:${startFrames}\n`;
    });

    const blob = new Blob([content], { type: 'application/x-cue;charset=utf-8' });
    const safeName = sanitizeFilename(playlistName, 'DJ_Set');
    downloadBlob(blob, `${safeName}.cue`);
    triggerSuccessFeedback('cue');
  };

  // 4. Export JSON Project
  const handleExportJson = () => {
    const project = {
      name: playlistName,
      createdAt: new Date().toISOString(),
      generator: 'MuLiMa Pro DJ Studio',
      tracks,
      transitions,
    };
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const safeName = sanitizeFilename(playlistName, 'DJ_Set');
    downloadBlob(blob, `${safeName}.mulimaset.json`);
    triggerSuccessFeedback('json');
  };

  // Full Audio Mix Export using Web Audio OfflineAudioContext with 3-band EQ, Filters & Tempo Sync
  const handleExportAudio = async (format: 'mp3' | 'wav' = 'mp3') => {
    if (tracks.length === 0 || isExportingAudio) return;
    setIsExportingAudio(true);
    setExportFormat(format);
    setExportProgress(5);
    setExportStatusText('Timeline-Layout & Startzeiten werden initialisiert...');

    try {
      const resolvedStartTimes = getResolvedTrackStartTimes();

      // For each track, compute the playback offset (targetTimeSec from incoming transition)
      const trackPlayOffsets: number[] = tracks.map((track, i) => {
        if (i === 0) return 0;
        const prevTrack = tracks[i - 1];
        const inTrans = transitions.find(
          t => (t.sourceTrackId === prevTrack.id && t.targetTrackId === track.id) || t.sourceTrackId === prevTrack.id
        );
        return inTrans?.targetTimeSec ?? 0;
      });

      // Find overall set duration (accounting for targetTimeSec offsets)
      let maxEndSec = 0;
      for (let i = 0; i < tracks.length; i++) {
        const start = resolvedStartTimes[i] || 0;
        const dur = tracks[i].duration || 180;
        const offset = trackPlayOffsets[i] || 0;
        const effectiveDur = Math.max(1, dur - offset); // Track plays from offset to end
        if (start + effectiveDur > maxEndSec) {
          maxEndSec = start + effectiveDur;
        }
      }
      const totalMixSec = Math.max(10, Math.min(maxEndSec + 2, 14400));
      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(
        2,
        Math.round(sampleRate * totalMixSec),
        sampleRate
      );

      // Render tracks sequentially with Web Audio automation
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackStartSec = resolvedStartTimes[i];
        const dur = track.duration || 180;
        const bpmSelf = track.bpm || 130;
        const playOffset = trackPlayOffsets[i]; // Start playing from this point in the audio file
        const effectiveDur = dur - playOffset;  // How long this track actually plays

        const stepPct = Math.round(5 + (i / tracks.length) * 55);
        setExportProgress(stepPct);
        setExportStatusText(`Track ${i + 1}/${tracks.length} (${track.title || 'Audio'}) wird vorbereitet...`);

        // Find incoming and outgoing transitions
        const inTrans = i > 0
          ? transitions.find(t => (t.sourceTrackId === tracks[i - 1].id && t.targetTrackId === track.id) || t.sourceTrackId === tracks[i - 1].id)
          : undefined;

        const outTrans = i < tracks.length - 1
          ? transitions.find(t => (t.sourceTrackId === track.id && t.targetTrackId === tracks[i + 1].id) || t.sourceTrackId === track.id)
          : undefined;

        // Fetch / acquire AudioBuffer
        let buffer: AudioBuffer | null = track.deepAnalysis?.audioBuffer || null;
        if (!buffer && track.file) {
          try {
            const ab = await track.file.arrayBuffer();
            buffer = await offlineCtx.decodeAudioData(ab.slice(0));
          } catch (e) {
            console.warn('Track.file decode fallback:', track.title, e);
          }
        }

        if (!buffer) {
          const urlsToTry: string[] = [];
          if (track.filePath) {
            urlsToTry.push(`/api/tracks/audio?path=${encodeURIComponent(track.filePath)}`);
            urlsToTry.push(`/api/library/stream?file=${encodeURIComponent(track.filePath)}`);
          }
          if (track.url) {
            urlsToTry.push(track.url);
          }

          for (const u of urlsToTry) {
            try {
              const res = await fetch(u);
              if (res.ok) {
                const ab = await res.arrayBuffer();
                buffer = await offlineCtx.decodeAudioData(ab.slice(0));
                break;
              }
            } catch (err) {
              // try next
            }
          }
        }

        if (!buffer) {
          console.warn('No audio buffer could be decoded for track:', track.title);
          continue;
        }

        const srcNode = offlineCtx.createBufferSource();
        srcNode.buffer = buffer;

        // 3-band DJ EQ and Highpass filter
        const lowFilter = offlineCtx.createBiquadFilter();
        lowFilter.type = 'lowshelf';
        lowFilter.frequency.value = 250;
        lowFilter.gain.value = 0;

        const midFilter = offlineCtx.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000;
        midFilter.Q.value = 1.0;
        midFilter.gain.value = 0;

        const highFilter = offlineCtx.createBiquadFilter();
        highFilter.type = 'highshelf';
        highFilter.frequency.value = 2500;
        highFilter.gain.value = 0;

        const hpfFilter = offlineCtx.createBiquadFilter();
        hpfFilter.type = 'highpass';
        hpfFilter.frequency.value = 20;

        const gainNode = offlineCtx.createGain();

        // Connect chain: Source -> Low -> Mid -> High -> HPF -> Gain -> Destination
        srcNode.connect(lowFilter);
        lowFilter.connect(midFilter);
        midFilter.connect(highFilter);
        highFilter.connect(hpfFilter);
        hpfFilter.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        // Calculate transition timings (in absolute set-time)
        let tInStart = 0;
        let tInDur = 0;
        let tInEnd = 0;
        if (inTrans && i > 0) {
          const bpmPrev = tracks[i - 1].bpm || 130;
          tInDur = ((inTrans.durationBeats || 32) * 60) / bpmPrev;
          const sourceTimeSec = inTrans.sourceTimeSec !== undefined
            ? inTrans.sourceTimeSec
            : Math.max(0, (tracks[i - 1].duration || 180) - tInDur);
          tInStart = resolvedStartTimes[i - 1] + (sourceTimeSec - trackPlayOffsets[i - 1]);
          tInEnd = tInStart + tInDur;
        }

        let tOutStart = 0;
        let tOutDur = 0;
        let tOutEnd = 0;
        if (outTrans) {
          tOutDur = ((outTrans.durationBeats || 32) * 60) / bpmSelf;
          const sourceTimeSec = outTrans.sourceTimeSec !== undefined
            ? outTrans.sourceTimeSec
            : Math.max(0, dur - tOutDur);
          // sourceTimeSec is relative to track-local time; adjust for playOffset
          tOutStart = trackStartSec + (sourceTimeSec - playOffset);
          tOutEnd = tOutStart + tOutDur;
        }

        // Apply gain & EQ automation
        if (i === 0) {
          gainNode.gain.setValueAtTime(1.0, trackStartSec);
          lowFilter.gain.setValueAtTime(0, trackStartSec);
          midFilter.gain.setValueAtTime(0, trackStartSec);
          highFilter.gain.setValueAtTime(0, trackStartSec);
          hpfFilter.frequency.setValueAtTime(20, trackStartSec);
        } else {
          // Track B remains muted until incoming transition starts
          gainNode.gain.setValueAtTime(0.0001, trackStartSec);
          if (tInStart > trackStartSec) {
            gainNode.gain.setValueAtTime(0.0001, Math.max(trackStartSec, tInStart - 0.05));
          }

          // In incoming transition (Track is Track B):
          if (inTrans && inTrans.envelopes) {
            const envs = inTrans.envelopes;
            const beats = inTrans.durationBeats || 32;

            // Volume B envelope
            if (envs.volumeB && envs.volumeB.length > 0) {
              envs.volumeB.forEach(pt => {
                const t = tInStart + (pt.beat / beats) * tInDur;
                gainNode.gain.linearRampToValueAtTime(Math.max(0.0001, Math.min(1.0, pt.value)), t);
              });
            } else {
              gainNode.gain.setValueAtTime(0.0001, tInStart);
              gainNode.gain.linearRampToValueAtTime(1.0, tInEnd);
            }

            // Low B envelope (dB)
            if (envs.lowB && envs.lowB.length > 0) {
              envs.lowB.forEach(pt => {
                const t = tInStart + (pt.beat / beats) * tInDur;
                const db = pt.value <= 0.05 ? -48 : (pt.value >= 0.95 ? 0 : 20 * Math.log10(pt.value));
                lowFilter.gain.linearRampToValueAtTime(db, t);
              });
            }

            // Mid B envelope (dB)
            if (envs.midB && envs.midB.length > 0) {
              envs.midB.forEach(pt => {
                const t = tInStart + (pt.beat / beats) * tInDur;
                const db = pt.value <= 0.05 ? -36 : (pt.value >= 0.95 ? 0 : 20 * Math.log10(pt.value));
                midFilter.gain.linearRampToValueAtTime(db, t);
              });
            }

            // High B envelope (dB)
            if (envs.highB && envs.highB.length > 0) {
              envs.highB.forEach(pt => {
                const t = tInStart + (pt.beat / beats) * tInDur;
                const db = pt.value <= 0.05 ? -36 : (pt.value >= 0.95 ? 0 : 20 * Math.log10(pt.value));
                highFilter.gain.linearRampToValueAtTime(db, t);
              });
            }

            // Filter sweep on incoming track
            if (inTrans.preset === 'filter-sweep') {
              hpfFilter.frequency.setValueAtTime(1000, tInStart);
              hpfFilter.frequency.exponentialRampToValueAtTime(20, tInEnd);
            }
          } else {
            gainNode.gain.setValueAtTime(0.0001, tInStart);
            gainNode.gain.linearRampToValueAtTime(1.0, tInEnd);
          }

          // Neutralize after incoming transition
          gainNode.gain.setValueAtTime(1.0, tInEnd);
          lowFilter.gain.setValueAtTime(0, tInEnd);
          midFilter.gain.setValueAtTime(0, tInEnd);
          highFilter.gain.setValueAtTime(0, tInEnd);
          hpfFilter.frequency.setValueAtTime(20, tInEnd);
        }

        // In outgoing transition (Track is Track A):
        if (outTrans && outTrans.envelopes) {
          const envs = outTrans.envelopes;
          const beats = outTrans.durationBeats || 32;

          gainNode.gain.setValueAtTime(1.0, tOutStart);
          lowFilter.gain.setValueAtTime(0, tOutStart);
          midFilter.gain.setValueAtTime(0, tOutStart);
          highFilter.gain.setValueAtTime(0, tOutStart);

          // Volume A envelope
          if (envs.volumeA && envs.volumeA.length > 0) {
            envs.volumeA.forEach(pt => {
              const t = tOutStart + (pt.beat / beats) * tOutDur;
              gainNode.gain.linearRampToValueAtTime(Math.max(0.0001, Math.min(1.0, pt.value)), t);
            });
          } else {
            gainNode.gain.linearRampToValueAtTime(0.0001, tOutEnd);
          }

          // Low A envelope (dB)
          if (envs.lowA && envs.lowA.length > 0) {
            envs.lowA.forEach(pt => {
              const t = tOutStart + (pt.beat / beats) * tOutDur;
              const db = pt.value <= 0.05 ? -48 : (pt.value >= 0.95 ? 0 : 20 * Math.log10(pt.value));
              lowFilter.gain.linearRampToValueAtTime(db, t);
            });
          }

          // Mid A envelope (dB)
          if (envs.midA && envs.midA.length > 0) {
            envs.midA.forEach(pt => {
              const t = tOutStart + (pt.beat / beats) * tOutDur;
              const db = pt.value <= 0.05 ? -36 : (pt.value >= 0.95 ? 0 : 20 * Math.log10(pt.value));
              midFilter.gain.linearRampToValueAtTime(db, t);
            });
          }

          // High A envelope (dB)
          if (envs.highA && envs.highA.length > 0) {
            envs.highA.forEach(pt => {
              const t = tOutStart + (pt.beat / beats) * tOutDur;
              const db = pt.value <= 0.05 ? -36 : (pt.value >= 0.95 ? 0 : 20 * Math.log10(pt.value));
              highFilter.gain.linearRampToValueAtTime(db, t);
            });
          }

          // Filter sweep on outgoing track
          if (outTrans.preset === 'filter-sweep') {
            hpfFilter.frequency.setValueAtTime(20, tOutStart);
            hpfFilter.frequency.exponentialRampToValueAtTime(1200, tOutEnd);
          }

          gainNode.gain.setValueAtTime(0.0001, tOutEnd);
        } else if (i === tracks.length - 1) {
          // Final track smooth fadeout at the end
          const endT = trackStartSec + effectiveDur;
          gainNode.gain.setValueAtTime(1.0, Math.max(0, endT - 3));
          gainNode.gain.linearRampToValueAtTime(0.0001, endT);
        }

        // Tempo sync automation (playbackRate)
        srcNode.playbackRate.setValueAtTime(1.0, 0);

        if (inTrans && inTrans.tempoSync && i > 0) {
          const bpmPrev = tracks[i - 1].bpm || 130;
          const targetBpm = inTrans.targetBpm ?? ((bpmPrev + bpmSelf) / 2);
          const syncRate = targetBpm / bpmSelf;
          srcNode.playbackRate.setValueAtTime(syncRate, tInStart);
          srcNode.playbackRate.setValueAtTime(syncRate, tInEnd);
          // Ramp back to natural 1.0 tempo over 4 beats after transition
          const rampSec = 4 * (60 / bpmSelf);
          srcNode.playbackRate.linearRampToValueAtTime(1.0, tInEnd + rampSec);
        }

        if (outTrans && outTrans.tempoSync) {
          const bpmNext = tracks[i + 1].bpm || 130;
          const targetBpm = outTrans.targetBpm ?? ((bpmSelf + bpmNext) / 2);
          const syncRate = targetBpm / bpmSelf;
          // Ramp into target tempo 4 beats before transition
          const rampSec = 4 * (60 / bpmSelf);
          const tPreStart = Math.max(0, tOutStart - rampSec);
          srcNode.playbackRate.setValueAtTime(1.0, tPreStart);
          srcNode.playbackRate.linearRampToValueAtTime(syncRate, tOutStart);
          srcNode.playbackRate.setValueAtTime(syncRate, tOutEnd);
        }

        // Schedule playback from the calculated timeline start
        // playOffset = targetTimeSec: start reading the audio buffer from this point
        // effectiveDur = how long the track actually plays in the mix
        srcNode.start(trackStartSec, playOffset, effectiveDur);
        if (outTrans) {
          srcNode.stop(tOutEnd + 0.5);
        }
      }

      setExportProgress(65);
      setExportStatusText('Mixdown wird gerendert (EQ-Kurven & Übergänge)...');

      // Ticker to give lively visual progress feedback while Web Audio renders in background
      const renderTicker = setInterval(() => {
        setExportProgress(prev => (prev < 80 ? prev + 1 : prev));
      }, 400);

      let renderedBuffer: AudioBuffer;
      try {
        renderedBuffer = await offlineCtx.startRendering();
      } finally {
        clearInterval(renderTicker);
      }

      const safeName = sanitizeFilename(playlistName, 'DJ_Set');

      if (format === 'mp3') {
        setExportProgress(82);
        setExportStatusText('MP3-Encoding (320 kbps High Quality)...');

        const mp3Blob = await audioBufferToMp3(renderedBuffer, {
          bitrate: 320,
          onProgress: (pct) => {
            const scaled = Math.round(82 + (pct / 100) * 16);
            setExportProgress(scaled);
            setExportStatusText(`MP3-Encoding (320 kbps)... ${pct}%`);
          },
        });

        setExportProgress(100);
        setExportStatusText('Fertig! MP3-Download wird gestartet...');
        downloadBlob(mp3Blob, `${safeName}_Mix.mp3`);
        triggerSuccessFeedback('mp3');
      } else {
        setExportProgress(88);
        setExportStatusText('16-Bit Studio Master WAV wird generiert...');
        const wavBlob = audioBufferToWav(renderedBuffer);
        setExportProgress(100);
        setExportStatusText('Fertig! WAV-Download wird gestartet...');
        downloadBlob(wavBlob, `${safeName}_Mix.wav`);
        triggerSuccessFeedback('wav');
      }
    } catch (err) {
      console.error('Master Audio Mix export error:', err);
      setExportStatusText('Fehler beim Exportieren des Audio-Mixes.');
    } finally {
      setTimeout(() => {
        setIsExportingAudio(false);
        setExportProgress(0);
        setExportStatusText('');
      }, 2000);
    }
  };

  // 5. Import JSON Project
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.tracks && Array.isArray(data.tracks)) {
          onImportProject?.(data.tracks, data.transitions || []);
          if (data.name) setPlaylistName(data.name);
          onClose();
        }
      } catch (err) {
        console.error('Fehler beim Importieren des Set-Projekts:', err);
      }
    };
    reader.readAsText(file);
  };

  const triggerSuccessFeedback = (type: string) => {
    setDownloadSuccess(type);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-fadeIn"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#12141A] border border-[#242936] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-[#242936] bg-[#161920]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 id="export-modal-title" className="text-base font-bold text-white flex items-center gap-2">
                <span>DJ Set Export & Playliste Speichern</span>
              </h3>
              <p className="text-xs text-gray-400 font-mono">
                {tracks.length} Tracks • {transitions.length} Übergänge • Ca. {formatTime(totalDurationSec)} Gesamtlaufzeit
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            aria-label="Close export set modal"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 flex flex-col gap-6 max-h-[75vh] overflow-y-auto">
          
          {/* 1. SAVE IN APP AS PLAYLIST */}
          <div className="bg-[#161920]/80 border border-[#242936] rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Bookmark className="w-4 h-4 text-purple-400" />
                <span>Als Playliste in MuLiMa Pro speichern</span>
              </div>
              <span className="text-[10px] font-mono text-gray-400 bg-[#0D0E12] px-2 py-0.5 rounded border border-[#242936]">
                Erscheint in linker Seitenleiste
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="Name des DJ Sets..."
                className="flex-1 bg-[#0D0E12] border border-[#242936] rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none font-mono"
              />
              <button
                onClick={handleSavePlaylist}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-md ${
                  isSavedPlaylist
                    ? 'bg-emerald-600 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 text-white active:scale-95'
                }`}
              >
                {isSavedPlaylist ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                <span>{isSavedPlaylist ? 'Gespeichert!' : 'Speichern'}</span>
              </button>
            </div>
          </div>

          {/* ACTIVE AUDIO EXPORT PROGRESS BANNER */}
          {isExportingAudio && (
            <div className="bg-[#161920] border border-amber-500/40 rounded-xl p-4 flex flex-col gap-2.5 animate-fadeIn shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 text-amber-400 font-bold">
                  <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span>{exportStatusText || 'Audio-Export läuft...'}</span>
                </div>
                <span className="font-mono font-bold text-amber-300">{exportProgress}%</span>
              </div>
              <div className="w-full bg-[#0D0E12] rounded-full h-2 overflow-hidden border border-[#242936]">
                <div 
                  className="bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-400 h-full transition-all duration-300 ease-out"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* 2. EXPORT OPTIONS GRID (MP3, WAV, M3U8, TXT) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* Audio Mix Export (.mp3) */}
            <button
              onClick={() => handleExportAudio('mp3')}
              disabled={isExportingAudio}
              className="group flex flex-col items-start p-4 rounded-xl border border-[#242936] bg-[#161920]/60 hover:bg-[#1A1D26] hover:border-amber-500/50 transition-all text-left shadow-lg relative overflow-hidden disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full mb-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition-transform">
                  <Sliders className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-500/30 text-amber-300 font-bold">
                  320k MP3
                </span>
              </div>
              <span className="text-xs font-bold text-white mb-0.5">Audio Mix (.mp3)</span>
              <span className="text-[10px] text-gray-400 leading-relaxed">
                {isExportingAudio && exportFormat === 'mp3'
                  ? `Mixdown & MP3 (${exportProgress}%)...`
                  : 'Ganzes Set als fertige Master-MP3 mit EQ-Kurven & Übergängen.'}
              </span>
              {downloadSuccess === 'mp3' && (
                <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                  <Check className="w-3 h-3" /> Geladen
                </span>
              )}
            </button>

            {/* Studio Master Export (.wav) */}
            <button
              onClick={() => handleExportAudio('wav')}
              disabled={isExportingAudio}
              className="group flex flex-col items-start p-4 rounded-xl border border-[#242936] bg-[#161920]/60 hover:bg-[#1A1D26] hover:border-emerald-500/50 transition-all text-left shadow-lg relative overflow-hidden disabled:opacity-50"
            >
              <div className="flex items-center justify-between w-full mb-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition-transform">
                  <Layers className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 font-bold">
                  16-Bit WAV
                </span>
              </div>
              <span className="text-xs font-bold text-white mb-0.5">Studio Master (.wav)</span>
              <span className="text-[10px] text-gray-400 leading-relaxed">
                {isExportingAudio && exportFormat === 'wav'
                  ? `WAV rendert (${exportProgress}%)...`
                  : 'Verlustfreies 16-Bit / 44.1 kHz PCM Studio Master für höchste Audioqualität.'}
              </span>
              {downloadSuccess === 'wav' && (
                <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                  <Check className="w-3 h-3" /> Geladen
                </span>
              )}
            </button>

            {/* M3U8 Playlist Export */}
            <button
              onClick={handleExportM3U}
              className="group flex flex-col items-start p-4 rounded-xl border border-[#242936] bg-[#161920]/60 hover:bg-[#1A1D26] hover:border-purple-500/50 transition-all text-left shadow-lg relative overflow-hidden"
            >
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30 mb-2.5 group-hover:scale-110 transition-transform">
                <Music className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white mb-0.5">M3U-Playliste (.m3u8)</span>
              <span className="text-[10px] text-gray-400 leading-relaxed">
                Universelle Playliste für DJ USB-Sticks, Mediaplayer & Player.
              </span>
              {downloadSuccess === 'm3u' && (
                <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                  <Check className="w-3 h-3" /> Geladen
                </span>
              )}
            </button>

            {/* Text Tracklist Export (.txt) */}
            <button
              onClick={handleExportTxt}
              className="group flex flex-col items-start p-4 rounded-xl border border-[#242936] bg-[#161920]/60 hover:bg-[#1A1D26] hover:border-cyan-500/50 transition-all text-left shadow-lg relative overflow-hidden"
            >
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-2.5 group-hover:scale-110 transition-transform">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white mb-0.5">Trackliste (.txt)</span>
              <span className="text-[10px] text-gray-400 leading-relaxed">
                Formatierte Setliste mit Startzeiten [MM:SS], BPM & Tonarten.
              </span>
              {downloadSuccess === 'txt' && (
                <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                  <Check className="w-3 h-3" /> Geladen
                </span>
              )}
            </button>
          </div>

          {/* 3. RESTORE / IMPORT PROJECT */}
          {onImportProject && (
            <div className="pt-2 border-t border-[#242936] flex items-center justify-between">
              <span className="text-xs text-gray-400 font-mono">
                Ein vorher exportiertes Set-Projekt wiederherstellen:
              </span>
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E2330] hover:bg-[#2A3245] text-white rounded-lg text-xs font-mono font-bold cursor-pointer border border-[#242936] transition-colors">
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                <span>Projekt laden (.json)</span>
                <input
                  type="file"
                  accept=".json,.mulimaset.json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-[#242936] bg-[#161920] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-mono font-bold text-gray-400 hover:text-white hover:bg-[#242936] transition-colors"
          >
            Schließen
          </button>
        </div>

      </div>
    </div>
  );
}
