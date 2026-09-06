import React, { useState, useEffect, useRef } from 'react';
import { 
  ListVideo, 
  ChevronRight, 
  ChevronLeft, 
  Play, 
  Pause, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  Copy, 
  Check, 
  Music, 
  Clock, 
  Activity, 
  Sparkles,
  AlertCircle,
  Bookmark
} from 'lucide-react';
import { TrackDef } from '../types';

interface SetPlaylistDrawerProps {
  playlist: TrackDef[];
  onSetPlaylist: (tracks: TrackDef[]) => void;
  currentTrack: TrackDef | null;
  isPlaying: boolean;
  onPlayTrack: (track: TrackDef) => void;
  isOpen?: boolean;
  onToggleOpen?: (isOpen: boolean) => void;
  className?: string;
  onOpenSetExport?: () => void;
  onSaveAsPlaylist?: (name: string) => void;
}

// Camelot harmonic relationship evaluation
function getHarmonicRelationship(keyA?: string, keyB?: string): {
  label: string;
  type: 'perfect' | 'compatible' | 'mood' | 'energy' | 'clash';
  color: string;
} {
  if (!keyA || !keyB) return { label: 'Unknown Key', type: 'clash', color: '#6B7280' };
  
  const parseCamelot = (k: string) => {
    const num = parseInt(k.replace(/[^0-9]/g, ''), 10);
    const letter = k.replace(/[0-9]/g, '').toUpperCase();
    return { num, letter };
  };

  const a = parseCamelot(keyA);
  const b = parseCamelot(keyB);

  if (!a.num || !b.num || !a.letter || !b.letter) {
    return { label: 'Custom Key', type: 'compatible', color: '#6B7280' };
  }

  // Exact Match
  if (a.num === b.num && a.letter === b.letter) {
    return { label: 'Exact Match', type: 'perfect', color: '#22C55E' };
  }

  // Same number, different letter (Relative Major / Minor)
  if (a.num === b.num && a.letter !== b.letter) {
    return { label: 'Mood Shift', type: 'mood', color: '#A855F7' };
  }

  // Adjacent numbers (+1 or -1) on same letter
  if (a.letter === b.letter) {
    const diff = (b.num - a.num + 12) % 12;
    if (diff === 1) {
      return { label: '+1 Energy Up', type: 'compatible', color: '#06B6D4' };
    }
    if (diff === 11) {
      return { label: '-1 Energy Down', type: 'compatible', color: '#3B82F6' };
    }
    if (diff === 2) {
      return { label: '+2 Boost', type: 'energy', color: '#F59E0B' };
    }
  }

  // Energy modulation (+7)
  const diff = (b.num - a.num + 12) % 12;
  if (diff === 7) {
    return { label: 'Dominant Boost', type: 'energy', color: '#F59E0B' };
  }

  return { label: 'Key Clash', type: 'clash', color: '#F43F5E' };
}

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function SetPlaylistDrawer({
  playlist,
  onSetPlaylist,
  currentTrack,
  isPlaying,
  onPlayTrack,
  isOpen: controlledIsOpen,
  onToggleOpen,
  className = '',
  onOpenSetExport,
  onSaveAsPlaylist,
}: SetPlaylistDrawerProps) {
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(false);
  const [copiedTracklist, setCopiedTracklist] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setOpen = (val: boolean) => {
    if (onToggleOpen) {
      onToggleOpen(val);
    } else {
      setInternalIsOpen(val);
    }
  };

  // Auto-expand drawer when a track is added!
  const prevCountRef = useRef(playlist.length);
  useEffect(() => {
    if (playlist.length > prevCountRef.current) {
      setOpen(true);
    }
    prevCountRef.current = playlist.length;
  }, [playlist.length]);

  // Statistics
  const totalDurationSec = playlist.reduce((acc, t) => acc + (t.duration || 0), 0);
  const avgBpm = playlist.length ? Math.round(playlist.reduce((acc, t) => acc + (t.bpm || 120), 0) / playlist.length) : 0;
  const avgEnergy = playlist.length ? playlist.reduce((acc, t) => acc + (t.energy || 5), 0) / playlist.length : 0;

  // Track manipulation
  const moveTrack = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= playlist.length) return;
    const next = [...playlist];
    const item = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = item;
    onSetPlaylist(next);
  };

  const removeTrack = (index: number) => {
    const next = playlist.filter((_, i) => i !== index);
    onSetPlaylist(next);
  };

  const handleClearPlaylist = () => {
    onSetPlaylist([]);
    setShowClearConfirm(false);
  };

  // Export M3U
  const handleExportM3U = () => {
    if (playlist.length === 0) return;
    let content = '#EXTM3U\n';
    playlist.forEach(t => {
      const dur = Math.round(t.duration || 0);
      content += `#EXTINF:${dur},${t.artist} - ${t.title}\n`;
      content += `${t.filePath || t.filename || t.title + '.mp3'}\n`;
    });

    const blob = new Blob([content], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mulima_pro_set_playlist_${Date.now()}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy Tracklist to clipboard
  const handleCopyTracklist = () => {
    if (playlist.length === 0) return;
    const text = playlist.map((t, i) => 
      `${(i + 1).toString().padStart(2, '0')}. ${t.artist} - ${t.title} [${t.bpm} BPM | ${t.key || '?'}]`
    ).join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopiedTracklist(true);
      setTimeout(() => setCopiedTracklist(false), 2500);
    });
  };

  // COLLAPSED BAR
  if (!isOpen) {
    return (
      <div className={`fixed right-0 top-16 bottom-20 z-40 flex items-center pointer-events-none ${className}`}>
        <button
          id="btn-open-set-playlist"
          onClick={() => setOpen(true)}
          className="pointer-events-auto bg-[#161920] hover:bg-[#242936] text-white border-l border-y border-[#242936] hover:border-[#A855F7]/50 rounded-l-2xl py-4 px-2.5 flex flex-col items-center gap-3 shadow-2xl transition-all hover:translate-x-[-2px] group"
          title="Set Playlist öffnen"
        >
          <div className="p-1.5 rounded-lg bg-[#A855F7]/20 text-[#A855F7] group-hover:scale-110 transition-transform">
            <ChevronLeft className="w-4 h-4" />
          </div>

          <div className="writing-mode-vertical font-bold text-xs uppercase tracking-widest text-gray-300 group-hover:text-white flex items-center gap-2">
            <ListVideo className="w-3.5 h-3.5 text-[#A855F7]" />
            <span>Set Playlist</span>
          </div>

          {/* Counters */}
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <span className="w-6 h-6 rounded-full bg-[#A855F7] text-white text-[10px] font-mono font-bold flex items-center justify-center shadow-sm">
              {playlist.length}
            </span>
            {totalDurationSec > 0 && (
              <span className="text-[9px] font-mono text-gray-400">
                {formatDuration(totalDurationSec)}
              </span>
            )}
          </div>
        </button>
      </div>
    );
  }

  // EXPANDED DRAWER
  return (
    <div className={`w-84 md:w-96 bg-[#161920] border-l border-[#242936] flex flex-col z-40 shrink-0 shadow-2xl h-full ${className}`}>
      {/* DRAWER HEADER */}
      <div className="p-4 border-b border-[#242936] bg-[#12141a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#A855F7]/15 text-[#A855F7] border border-[#A855F7]/30 shadow-sm">
              <ListVideo className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-xs uppercase tracking-widest text-white flex items-center gap-2">
                Set Playlist
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#A855F7] text-white font-bold">
                  {playlist.length}
                </span>
              </h2>
              <p className="text-[10px] text-gray-500 font-mono">MuLiMa Pro Live Sequence & Transition Flow</p>
            </div>
          </div>

          {/* Close/Collapse Button */}
          <button
            id="btn-close-set-playlist"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936] transition-colors"
            title="Set Playlist einklappen"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Set Metrics (Duration, Avg BPM, Avg Energy) */}
        <div className="mt-4 grid grid-cols-3 gap-2 bg-[#0D0E12] p-2.5 rounded-xl border border-[#242936]">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-[#06B6D4]" /> Dauer
            </span>
            <span className="font-mono text-xs font-bold text-white mt-0.5">
              {formatDuration(totalDurationSec)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
              <Activity className="w-2.5 h-2.5 text-[#22C55E]" /> Avg BPM
            </span>
            <span className="font-mono text-xs font-bold text-[#22C55E] mt-0.5">
              {avgBpm || '--'}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-[#A855F7]" /> Avg Energy
            </span>
            <span className="font-mono text-xs font-bold text-[#A855F7] mt-0.5">
              {avgEnergy ? avgEnergy.toFixed(1) : '--'}/10
            </span>
          </div>
        </div>

        {/* Energy Flow Timeline Curve */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[9px] font-mono text-gray-500 mb-1">
            <span>Set Energy Progression</span>
            <span>{playlist.length} Tracks</span>
          </div>
          <div className="h-7 bg-[#0D0E12] border border-[#242936] rounded-lg p-1 flex items-end gap-1">
            {playlist.length > 0 ? (
              playlist.map((t, i) => {
                const energyPct = Math.max(10, ((t.energy || 5) / 10) * 100);
                return (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-[#A855F7]/30 to-[#A855F7] hover:to-[#06B6D4] rounded-t-sm transition-all relative group cursor-pointer"
                    style={{ height: `${energyPct}%` }}
                    onClick={() => onPlayTrack(t)}
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-black/90 border border-[#242936] rounded text-[8px] font-mono text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                      #{i + 1} {t.title} ({t.energy || 5}/10)
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-600 font-mono">
                Keine Tracks in Playlist
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons: Export & Copy & Clear */}
        <div className="mt-3 pt-2.5 border-t border-[#242936] flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportM3U}
              disabled={playlist.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#0D0E12] hover:bg-[#242936] text-gray-300 hover:text-white border border-[#242936] disabled:opacity-40 transition-colors"
              title="Playlist als M3U-Datei herunterladen"
            >
              <Download className="w-3 h-3 text-[#06B6D4]" />
              <span>M3U</span>
            </button>

            {onOpenSetExport && (
              <button
                id="btn-drawer-open-export"
                onClick={onOpenSetExport}
                disabled={playlist.length === 0}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#0D0E12] hover:bg-[#242936] text-cyan-300 hover:text-white border border-cyan-500/40 disabled:opacity-40 transition-colors"
                title="CUE Sheet, M3U8 und Projekt-Export öffnen"
              >
                <Download className="w-3 h-3 text-cyan-400" />
                <span>Export</span>
              </button>
            )}

            {onSaveAsPlaylist && (
              <button
                id="btn-drawer-save-playlist"
                onClick={() => onSaveAsPlaylist(`DJ Set Playlist ${new Date().toLocaleDateString('de-DE')}`)}
                disabled={playlist.length === 0}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#0D0E12] hover:bg-[#242936] text-purple-300 hover:text-white border border-purple-500/40 disabled:opacity-40 transition-colors"
                title="In linker Sidebar als Playlist ablegen"
              >
                <Bookmark className="w-3 h-3 text-purple-400" />
                <span>Speichern</span>
              </button>
            )}

            <button
              onClick={handleCopyTracklist}
              disabled={playlist.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#0D0E12] hover:bg-[#242936] text-gray-300 hover:text-white border border-[#242936] disabled:opacity-40 transition-colors"
              title="Trackliste in Zwischenablage kopieren"
            >
              {copiedTracklist ? <Check className="w-3 h-3 text-[#22C55E]" /> : <Copy className="w-3 h-3 text-[#A855F7]" />}
              <span>{copiedTracklist ? 'Kopiert!' : 'Kopieren'}</span>
            </button>
          </div>

          {/* Clear Playlist with inline confirmation */}
          {playlist.length > 0 && (
            showClearConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleClearPlaylist}
                  className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold transition-colors"
                >
                  Ja, leeren
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-1.5 py-0.5 rounded text-gray-400 hover:text-white text-[9px]"
                >
                  Nein
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors"
                title="Set Playlist leeren"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* TRACKS LIST WITH TRANSITION BADGES */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {playlist.length === 0 ? (
          <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center">
            <Sparkles className="w-10 h-10 text-[#A855F7]/30 mb-3" />
            <p className="text-xs font-medium text-gray-300">Set Playlist ist leer</p>
            <p className="text-[10px] text-gray-600 mt-1 max-w-[220px]">
              Klicke in der Library beim Track auf das Plus-Symbol (+), um Tracks zu deinem DJ-Set hinzuzufügen.
            </p>
          </div>
        ) : (
          playlist.map((track, i) => {
            const isPlayingThis = isPlaying && currentTrack && (currentTrack.filePath === track.filePath || currentTrack.id === track.id);
            const nextTrack = playlist[i + 1];
            const transition = nextTrack ? getHarmonicRelationship(track.key, nextTrack.key) : null;
            const bpmDiff = nextTrack && track.bpm && nextTrack.bpm ? nextTrack.bpm - track.bpm : null;

            return (
              <React.Fragment key={`${track.filePath || track.id}-${i}`}>
                {/* Track Card */}
                <div 
                  className={`p-2.5 rounded-xl border transition-all relative group flex items-center gap-2.5 ${
                    isPlayingThis 
                      ? 'bg-[#242936] border-[#A855F7] shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                      : 'bg-[#0D0E12]/80 hover:bg-[#242936]/60 border-[#242936]'
                  }`}
                >
                  {/* Track Index Badge */}
                  <span className="text-[10px] font-mono text-gray-500 w-4 text-center shrink-0">
                    {i + 1}
                  </span>

                  {/* Play Button / Cover Art */}
                  <div 
                    className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 cursor-pointer bg-[#161920] flex items-center justify-center"
                    onClick={() => onPlayTrack(track)}
                  >
                    {track.coverArt ? (
                      <img src={track.coverArt} className="w-full h-full object-cover" alt="Cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: track.gradient || '#161920' }}>
                        <Music className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                      {isPlayingThis ? (
                        <Pause className="w-3.5 h-3.5 text-[#22C55E] drop-shadow" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-white drop-shadow ml-0.5 opacity-80 group-hover:opacity-100" />
                      )}
                    </div>
                  </div>

                  {/* Track Details */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs truncate ${isPlayingThis ? 'font-bold text-[#A855F7]' : 'font-medium text-gray-200'}`}>
                      {track.title}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {track.artist}
                    </p>
                  </div>

                  {/* Key & BPM Badges */}
                  <div className="flex flex-col items-end shrink-0 font-mono text-right">
                    <span className="text-[10px] font-bold text-[#A855F7] bg-[#161920] px-1.5 py-0.2 rounded border border-[#242936]">
                      {track.key || '?'}
                    </span>
                    <span className="text-[9px] text-[#22C55E] mt-0.5 font-bold">
                      {track.bpm || '--'} <span className="text-gray-500 font-normal">BPM</span>
                    </span>
                  </div>

                  {/* Reorder / Remove Controls (Hover) */}
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                    <button
                      onClick={() => moveTrack(i, 'up')}
                      disabled={i === 0}
                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#161920] disabled:opacity-20 disabled:hover:text-gray-400 transition-colors"
                      title="Nach oben"
                    >
                      <ArrowUp className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => moveTrack(i, 'down')}
                      disabled={i === playlist.length - 1}
                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#161920] disabled:opacity-20 disabled:hover:text-gray-400 transition-colors"
                      title="Nach unten"
                    >
                      <ArrowDown className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => removeTrack(i)}
                      className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Aus Playlist entfernen"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {/* Transition Bridge Indicator to next track */}
                {transition && (
                  <div className="flex items-center justify-between px-4 py-1 text-[9px] font-mono text-gray-500 bg-[#0D0E12]/50 rounded-lg border border-[#242936]/40 mx-2">
                    <div className="flex items-center gap-1.5">
                      <span 
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: transition.color }}
                      />
                      <span style={{ color: transition.color }} className="font-bold">
                        {transition.label}
                      </span>
                    </div>

                    {bpmDiff !== null && (
                      <span className={bpmDiff === 0 ? 'text-[#22C55E]' : Math.abs(bpmDiff) <= 4 ? 'text-gray-400' : 'text-[#F59E0B]'}>
                        {bpmDiff > 0 ? `+${bpmDiff}` : bpmDiff} BPM
                      </span>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
