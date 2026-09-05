import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { FolderPlus, Play, Pause, Volume2, Plus, GripVertical, ListVideo, SlidersHorizontal, Activity, Music, Loader2, Database, Trash2, AlertTriangle, Unlock, Edit2, Copy, Check, X, HardDrive } from 'lucide-react';
import { extractMetadata } from './lib/audioMetadata';
import { getDB, saveTrack, getAllTracks, clearTracks, savePlaylist, getAllPlaylists, deletePlaylist, saveGroup, getAllGroups, deleteGroup } from './lib/db';
import ScatterMap from './components/ScatterMap';
import GraphMap from './components/GraphMap';
import AnalyzerPanel from './components/AnalyzerPanel';
import PlaylistGroups from './components/PlaylistGroups';
import LibraryManagerModal from './components/LibraryManagerModal';
import { analyzeTrackSegments, TrackSegment } from './lib/audioAnalysis';
import { TrackDef, DjoidGroup, HotCue, PlaylistDef } from './types';

export type { HotCue };

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
};

export type Track = TrackDef;


const camelotKeys = [
  '1A','2A','3A','4A','5A','6A','7A','8A','9A','10A','11A','12A',
  '1B','2B','3B','4B','5B','6B','7B','8B','9B','10B','11B','12B'
];

const globalDJOIDEngine = typeof window !== 'undefined' ? new Audio() : (null as any);
if (globalDJOIDEngine) { globalDJOIDEngine.volume = 1.0; }

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isLibraryManagerOpen, setIsLibraryManagerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'scatter' | 'graph'>('grid');
  
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [groups, setGroups] = useState<DjoidGroup[]>([]);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bpmRange, setBpmRange] = useState<[number, number]>([60, 200]);
  const [energyRange, setEnergyRange] = useState<[number, number]>([0, 10]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [jumpToTime, setJumpToTime] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.75);

  const [activeTrackForAnalysis, setActiveTrackForAnalysis] = useState<Track | null>(null);
  const [hotCues, setHotCues] = useState<Record<string, HotCue[]>>({});

  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(globalDJOIDEngine);

  // Load from /LIBRARY on disk, with IndexedDB fallback
  const loadLibraryFromDisk = async () => {
    try {
      const res = await fetch('/api/library/tracks');
      const data = await res.json();
      if (data.success && data.tracks && data.tracks.length > 0) {
        setTracks(data.tracks);
        if (data.groups && data.groups.length > 0) {
          setGroups(data.groups);
        }
      } else {
        // Fallback to IndexedDB if disk library is empty
        const savedTracks = await getAllTracks();
        if (savedTracks.length > 0) setTracks(savedTracks);
        const savedGroups = await getAllGroups();
        if (savedGroups.length > 0) setGroups(savedGroups);
      }
      const savedPlaylists = await getAllPlaylists();
      if (savedPlaylists.length > 0) setPlaylists(savedPlaylists);
    } catch (err) {
      console.error("Error loading library:", err);
      const [savedTracks, savedPlaylists, savedGroups] = await Promise.all([
        getAllTracks(),
        getAllPlaylists(),
        getAllGroups()
      ]);
      if (savedTracks.length > 0) setTracks(savedTracks);
      if (savedPlaylists.length > 0) setPlaylists(savedPlaylists);
      if (savedGroups.length > 0) setGroups(savedGroups);
    }
  };

  useEffect(() => {
    loadLibraryFromDisk();
  }, []);

  // Audio setup
  useEffect(() => {
    const audio = globalDJOIDEngine;
    audio.volume = volume;
    
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Update Track Helper (syncs with IndexedDB and /api/library/update-track)
  const updateTrack = (id: string, updates: Partial<Track>) => {
    setTracks(prev => prev.map(t => {
      if (t.id === id || t.filePath === id) {
        const updated = { ...t, ...updates };
        saveTrack(updated);
        if (updated.filePath) {
          fetch('/api/library/update-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: updated.filePath, updates })
          }).catch(console.error);
        }
        if (currentTrack?.id === id || currentTrack?.filePath === id) setCurrentTrack(updated);
        if (activeTrackForAnalysis?.id === id || activeTrackForAnalysis?.filePath === id) setActiveTrackForAnalysis(updated);
        return updated;
      }
      return t;
    }));
    setPlaylist(prev => prev.map(t => (t.id === id || t.filePath === id) ? { ...t, ...updates } : t));
  };

  // Volume
  useEffect(() => {
    if (globalDJOIDEngine) globalDJOIDEngine.volume = volume;
  }, [volume]);

  // Autoplay and Seek
  useEffect(() => {
    if (currentTrack && globalDJOIDEngine) {
      const audio = globalDJOIDEngine;
      
      if (currentTrack.url) {
        if (audio.src !== currentTrack.url) {
          audio.pause();
          audio.src = currentTrack.url;
          audio.load();
        }
        
        if (jumpToTime !== null) {
          audio.currentTime = jumpToTime;
          setJumpToTime(null);
        }
        
        audio.play().then(() => {
          setIsPlaying(true);
        }).catch((e: any) => {
          if (e.name !== 'AbortError') {
            setIsPlaying(false);
            console.error('Playback error:', e);
          }
        });
      }
    }
  }, [currentTrack, jumpToTime]);

  const togglePlay = () => {
    if (globalDJOIDEngine) {
      if (isPlaying) {
        globalDJOIDEngine.pause();
        setIsPlaying(false);
      } else {
        if (!globalDJOIDEngine.src) return;
        globalDJOIDEngine.play().catch((e: any) => {
          if (e.name !== 'AbortError') setIsPlaying(false);
        });
        setIsPlaying(true);
      }
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!globalDJOIDEngine || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    globalDJOIDEngine.currentTime = pos * duration;
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // File loading logic with smart Re-Sync (merges with existing tracks so cues/tags/keys/ratings are kept!)
  const processFiles = (items: {file: File, handle?: any}[]) => {
    const audioItems = items.filter(i => /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(i.file.name));
    if (audioItems.length === 0) return;

    setTracks(prev => {
      const existingMap = new Map<string, Track>();
      // index by filename and clean title
      prev.forEach(t => {
        if (t.filename) existingMap.set(t.filename.toLowerCase(), t);
        if (t.title) existingMap.set(t.title.toLowerCase(), t);
      });

      const updatedList: Track[] = [...prev];
      const newlyCreated: Track[] = [];

      audioItems.forEach(item => {
        const cleanTitle = item.file.name.replace(/\.[^/.]+$/, "");
        const existing = existingMap.get(item.file.name.toLowerCase()) || existingMap.get(cleanTitle.toLowerCase());
        const objectUrl = URL.createObjectURL(item.file);

        if (existing) {
          // Re-sync existing track
          const idx = updatedList.findIndex(t => t.id === existing.id);
          const updatedTrack: Track = {
            ...existing,
            file: item.file,
            fileHandle: item.handle || existing.fileHandle,
            url: objectUrl,
          };
          if (idx !== -1) {
            updatedList[idx] = updatedTrack;
          }
          saveTrack(updatedTrack);
        } else {
          // Brand new track
          const newTrack: Track = {
            id: Math.random().toString(36).substring(2, 9),
            filename: item.file.name,
            title: cleanTitle,
            artist: 'Unknown Artist',
            bpm: Math.floor(Math.random() * 20 + 120),
            key: `${Math.floor(Math.random() * 12 + 1)}${Math.random() > 0.5 ? 'A' : 'B'}`,
            energy: Math.floor(Math.random() * 6 + 4),
            file: item.file,
            fileHandle: item.handle,
            url: objectUrl,
            coverArt: undefined,
            gradient: `linear-gradient(${Math.floor(Math.random()*360)}deg, #161920, #A855F7)`
          };
          updatedList.push(newTrack);
          newlyCreated.push(newTrack);
          saveTrack(newTrack);
        }
      });

      // Async load metadata and segments for newly created tracks
      newlyCreated.forEach(async (t) => {
        try {
          const [meta, segments] = await Promise.all([
            extractMetadata(t.file!),
            analyzeTrackSegments(t.url!, t.key, t.energy)
          ]);
          setTracks(curr => curr.map(track => {
            if (track.id === t.id) {
              const updated = {
                ...track,
                title: meta.title || track.title,
                artist: meta.artist || track.artist,
                bpm: meta.bpm || track.bpm,
                key: meta.key || track.key,
                coverArt: meta.coverArt || track.coverArt,
                segments,
                duration: segments.length ? segments[segments.length - 1].endSec : 0
              };
              saveTrack(updated);
              return updated;
            }
            return track;
          }));
        } catch (e) {
          // Ignore extraction errors
        }
      });

      return updatedList;
    });

    setIsLocked(false);
  };

  async function* getFilesRecursively(entry: any): AsyncGenerator<{file: File, handle: any}> {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)) {
        yield { file, handle: entry };
      }
    } else if (entry.kind === 'directory') {
      for await (const handle of entry.values()) {
        yield* getFilesRecursively(handle);
      }
    }
  }

  const handleDirectorySelect = async () => {
    const isIframe = window.self !== window.top;
    if ('showDirectoryPicker' in window && !isIframe) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        setIsScanning(true);
        const items = [];
        for await (const item of getFilesRecursively(dirHandle)) {
          items.push(item);
        }
        processFiles(items);
        setIsLocked(false);
      } catch (err: any) {
        if (err.name === 'SecurityError' || err.message?.includes('Cross origin')) {
          fallbackInputRef.current?.click();
        } else if (err.name !== 'AbortError') {
          fallbackInputRef.current?.click();
        }
      } finally {
        setIsScanning(false);
      }
    } else {
      fallbackInputRef.current?.click();
    }
  };

  const handleFallbackChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsScanning(true);
    const files = Array.from(e.target.files) as File[];
    const items = files.map(file => ({ file }));
    processFiles(items);
    setIsScanning(false);
    if (fallbackInputRef.current) fallbackInputRef.current.value = '';
  };

  // Reaktiviert die Berechtigungen für alle Tracks oder öffnet den Picker zur Re-Synchronisation
  const unlockLibrary = async () => {
    if (!tracks || tracks.length === 0) {
      handleDirectorySelect();
      return;
    }
    
    setIsScanning(true);

    try {
      // Suche ersten Track mit FileSystemFileHandle
      const trackWithHandle = tracks.find(t => t.fileHandle || (t as any).handle);
      
      if (trackWithHandle) {
        const handle = trackWithHandle.fileHandle || (trackWithHandle as any).handle;
        let permission = 'prompt';
        
        try {
          if (handle.queryPermission) {
            permission = await handle.queryPermission({ mode: 'read' });
          }
          if (permission !== 'granted' && handle.requestPermission) {
            permission = await handle.requestPermission({ mode: 'read' });
          }
        } catch (permErr) {
          console.warn("Direct handle permission request not supported, falling back to folder picker:", permErr);
          permission = 'denied';
        }

        if (permission === 'granted') {
          const updatedTracks = await Promise.all(tracks.map(async (track: any) => {
            const tHandle = track.fileHandle || track.handle;
            if (tHandle) {
              try {
                const file = await tHandle.getFile();
                return { ...track, file, url: URL.createObjectURL(file) };
              } catch (e) {
                return track;
              }
            }
            return track;
          }));
          
          setTracks(updatedTracks);
          setIsLocked(false);

          if (currentTrack) {
            const fresh = updatedTracks.find(t => t.id === currentTrack.id);
            if (fresh && fresh.url) setCurrentTrack(fresh);
          }
          if (activeTrackForAnalysis) {
            const fresh = updatedTracks.find(t => t.id === activeTrackForAnalysis.id);
            if (fresh && fresh.url) setActiveTrackForAnalysis(fresh);
          }
          setIsScanning(false);
          return;
        }
      }

      // Falls keine Handles verfügbar sind oder Permission im iframe geblockt ist: Folder Picker öffnen
      setIsScanning(false);
      handleDirectorySelect();
    } catch (error) {
      console.error("Fehler beim Entsperren der Library:", error);
      setIsScanning(false);
      handleDirectorySelect();
    }
  };

  const handleUnlock = unlockLibrary;

  const handleClearLibrary = async () => {
    await clearTracks();
    setTracks([]);
    setPlaylist([]);
    setCurrentTrack(null);
    setIsLocked(false);
  };

  // Playlists CRUD
  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    const newPlaylist = {
      id: Math.random().toString(36).substring(2, 9),
      name: newPlaylistName,
      trackIds: playlist.map(t => t.id) // save current Chapter as starting point if wanted, or empty
    };
    newPlaylist.trackIds = []; // Empty playlist by default
    savePlaylist(newPlaylist);
    setPlaylists(prev => [...prev, newPlaylist]);
    setIsCreatingPlaylist(false);
    setNewPlaylistName('');
  };

  const handleDeletePlaylist = (id: string) => {
    deletePlaylist(id);
    setPlaylists(prev => prev.filter(p => p.id !== id));
  };

  const handleDuplicatePlaylist = (p: Playlist) => {
    const newPlaylist = {
      id: Math.random().toString(36).substring(2, 9),
      name: `${p.name} (Copy)`,
      trackIds: [...p.trackIds]
    };
    savePlaylist(newPlaylist);
    setPlaylists(prev => [...prev, newPlaylist]);
  };

  const handleSaveEditPlaylist = (id: string) => {
    if (!newPlaylistName.trim()) {
      setEditingPlaylistId(null);
      return;
    }
    const updated = playlists.map(p => {
      if (p.id === id) {
        const modified = { ...p, name: newPlaylistName };
        savePlaylist(modified);
        return modified;
      }
      return p;
    });
    setPlaylists(updated);
    setEditingPlaylistId(null);
    setNewPlaylistName('');
  };

  const loadPlaylist = (p: Playlist) => {
    const loadedTracks = p.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[];
    setPlaylist(loadedTracks);
  };

  const addToPlaylist = (track: Track) => {
    setPlaylist(prev => [...prev, track]);
  };

  const addMultipleToPlaylist = (tracksToAdd: Track[]) => {
    setPlaylist(prev => [...prev, ...tracksToAdd]);
  };

  // Groups CRUD
  const handleCreateGroup = (group: { id: string; name: string; color?: string }) => {
    saveGroup(group);
    setGroups(prev => [...prev, group]);
  };

  const handleDeleteGroup = (id: string) => {
    deleteGroup(id);
    setGroups(prev => prev.filter(p => p.id !== id));
    if (selectedGroup === id) setSelectedGroup(null);
  };

  const handleUpdateGroup = (id: string, updates: { name?: string; color?: string }) => {
    const updated = groups.map(g => {
      if (g.id === id) {
        const modified = { ...g, ...updates };
        saveGroup(modified);
        return modified;
      }
      return g;
    });
    setGroups(updated);
  };

  const avgBpm = playlist.length ? Math.round(playlist.reduce((acc, t) => acc + t.bpm, 0) / playlist.length) : 0;
  const avgEnergy = playlist.length ? playlist.reduce((acc, t) => acc + t.energy, 0) / playlist.length : 0;

  const filteredTracks = tracks.filter(track => {
    const matchesKey = !selectedKey || track.key === selectedKey;
    const matchesBPM = track.bpm >= bpmRange[0] && track.bpm <= bpmRange[1];
    const matchesEnergy = track.energy >= energyRange[0] && track.energy <= energyRange[1];
    const matchesGroup = !selectedGroup || (track.groups && track.groups.includes(selectedGroup));
    return matchesKey && matchesBPM && matchesEnergy && matchesGroup;
  });

  return (
    <div className="flex flex-col h-screen bg-[#0D0E12] text-white font-sans overflow-hidden pb-20 selection:bg-[#A855F7]/30">
      
      <div className="flex flex-1 overflow-hidden relative">
        <input 
          type="file" 
          ref={fallbackInputRef} 
          onChange={handleFallbackChange} 
          className="hidden" 
          webkitdirectory="true" 
          // @ts-ignore
          directory="true" 
          multiple 
        />

        {/* LEFT SIDEBAR */}
        <div className="w-64 bg-[#161920] border-r border-[#242936] flex flex-col z-10 shrink-0">
          <div className="p-4 border-b border-[#242936]">
            {/* Primary Library Manager Button */}
            <button 
              id="btn-sidebar-library-manager"
              onClick={() => setIsLibraryManagerOpen(true)}
              className="w-full bg-gradient-to-r from-[#A855F7] to-[#06B6D4] hover:from-[#b56ef8] hover:to-[#22d3ee] text-white rounded-xl py-2.5 px-3 text-xs font-bold transition-all mb-2 flex items-center justify-center gap-2 shadow-md shadow-[#A855F7]/20 active:scale-[0.98]"
              title="DJOID Library Manager öffnen"
            >
              <HardDrive className="w-4 h-4 text-white" />
              <span>Library Manager</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/40 border border-white/20">
                {tracks.length}
              </span>
            </button>

            <button 
              onClick={() => setIsLibraryManagerOpen(true)}
              className="w-full bg-[#0D0E12] hover:bg-[#242936] border border-[#242936] hover:border-[#A855F7]/50 text-gray-300 hover:text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#A855F7]" />
              + Tracks in /LIBRARY
            </button>
            
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono bg-[#0D0E12] border border-[#242936] p-2 rounded-lg">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-[#22C55E]" />
                  <span>/LIBRARY Ordner:</span>
                </div>
                <span className="text-white font-bold">{tracks.length} Tracks</span>
              </div>
              {tracks.length > 0 && (
                <button onClick={handleClearLibrary} className="w-full flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest font-bold text-gray-500 hover:text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/30 p-1.5 rounded-lg transition-colors">
                  <Trash2 className="w-3 h-3" /> Library leeren
                </button>
              )}
            </div>
          </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <ListVideo className="w-3 h-3" /> Playlists
              </h3>
              <button 
                onClick={() => setIsCreatingPlaylist(true)}
                className="p-1 hover:bg-[#242936] rounded text-gray-400 hover:text-white transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            
            <div className="space-y-1">
              {isCreatingPlaylist && (
                <div className="flex items-center gap-2 p-2 bg-[#0D0E12] border border-[#242936] rounded">
                  <input
                    autoFocus
                    type="text"
                    value={newPlaylistName}
                    onChange={e => setNewPlaylistName(e.target.value)}
                    placeholder="Name..."
                    className="flex-1 bg-transparent text-xs text-white outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
                  />
                  <button onClick={handleCreatePlaylist} className="text-[#22C55E]"><Check className="w-3 h-3" /></button>
                  <button onClick={() => { setIsCreatingPlaylist(false); setNewPlaylistName(''); }} className="text-red-400"><X className="w-3 h-3" /></button>
                </div>
              )}
              {playlists.map(p => (
                <div key={p.id} className="group flex items-center justify-between p-2 hover:bg-[#242936] rounded transition-colors cursor-pointer" onClick={() => loadPlaylist(p)}>
                  {editingPlaylistId === p.id ? (
                    <div className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        type="text"
                        value={newPlaylistName}
                        onChange={e => setNewPlaylistName(e.target.value)}
                        className="flex-1 bg-[#0D0E12] border border-[#242936] rounded px-1 text-xs text-white outline-none"
                        onKeyDown={e => e.key === 'Enter' && handleSaveEditPlaylist(p.id)}
                      />
                      <button onClick={() => handleSaveEditPlaylist(p.id)} className="text-[#22C55E]"><Check className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-medium text-gray-300 group-hover:text-white">{p.name}</span>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditingPlaylistId(p.id); setNewPlaylistName(p.name); }} className="text-gray-500 hover:text-white"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={() => handleDuplicatePlaylist(p)} className="text-gray-500 hover:text-white"><Copy className="w-3 h-3" /></button>
                        <button onClick={() => handleDeletePlaylist(p.id)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <PlaylistGroups 
              groups={groups}
              selectedGroup={selectedGroup}
              onSelectGroup={setSelectedGroup}
              onCreateGroup={handleCreateGroup}
              onDeleteGroup={handleDeleteGroup}
              onUpdateGroup={handleUpdateGroup}
              tracks={tracks}
            />
          </div>

          <div className="mb-8">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity className="w-3 h-3" /> Camelot Keys
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              {camelotKeys.map(k => (
                <button 
                  key={k} 
                  onClick={() => setSelectedKey(selectedKey === k ? null : k)}
                  className={`text-[9px] font-mono py-1.5 rounded transition-all ${
                    selectedKey === k 
                      ? 'bg-[#A855F7]/20 border border-[#A855F7] text-[#A855F7] shadow-[0_0_10px_rgba(168,85,247,0.3)]' 
                      : 'bg-[#0D0E12] border border-[#242936] text-gray-500 hover:text-white hover:border-gray-500'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <SlidersHorizontal className="w-3 h-3" /> Filters
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 font-mono mb-1">
                  <span>BPM Range</span>
                  <span className="text-[#A855F7]">{bpmRange[0]} - {bpmRange[1]}</span>
                </div>
                <input 
                  type="range" 
                  min="60" 
                  max="200" 
                  value={bpmRange[1]}
                  onChange={e => setBpmRange([bpmRange[0], parseInt(e.target.value)])}
                  className="w-full accent-[#A855F7] h-1 bg-[#0D0E12] rounded-lg appearance-none cursor-pointer" 
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 font-mono mb-1">
                  <span>Energy Level</span>
                  <span className="text-[#A855F7]">{energyRange[0]} - {energyRange[1]}</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="10" 
                  value={energyRange[1]}
                  onChange={e => setEnergyRange([energyRange[0], parseInt(e.target.value)])}
                  className="w-full accent-[#A855F7] h-1 bg-[#0D0E12] rounded-lg appearance-none cursor-pointer" 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0D0E12] relative border-r border-[#242936]">
        <div className="h-16 px-6 border-b border-[#242936] flex items-center justify-between shrink-0 bg-[#161920] z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2 text-white">
              <Activity className="w-4 h-4 text-[#A855F7]" /> Visual Library
            </h2>

            <button 
              id="btn-header-library-manager"
              onClick={() => setIsLibraryManagerOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#A855F7] to-[#06B6D4] hover:from-[#b56ef8] hover:to-[#22d3ee] text-white text-xs font-bold transition-all shadow-md shadow-[#A855F7]/25 hover:scale-[1.02] active:scale-[0.98]"
              title="DJOID Library Manager öffnen"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Library Manager</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/40 border border-white/20">
                {tracks.length}
              </span>
            </button>
          </div>
          
          <div className="flex bg-[#0D0E12] p-1 border border-[#242936] rounded-lg">
            <button 
              onClick={() => setViewMode('grid')} 
              className={`px-4 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors ${viewMode === 'grid' ? 'bg-[#242936] text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Grid
            </button>
            <button 
              onClick={() => setViewMode('scatter')} 
              className={`px-4 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors ${viewMode === 'scatter' ? 'bg-[#242936] text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Scatter Map
            </button>
            <button 
              onClick={() => setViewMode('graph')} 
              className={`px-4 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors ${viewMode === 'graph' ? 'bg-[#242936] text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Graph Map
            </button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col bg-[#0D0E12]">
          {viewMode === 'grid' ? (
            <div className="flex-1 p-6 overflow-y-auto relative">
              {tracks.length === 0 && !isScanning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                  <FolderPlus className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Library is empty. Import a folder to start.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {filteredTracks.map((track) => (
                    <div 
                      key={track.id}
                      className="relative aspect-square rounded-xl overflow-hidden group border border-[#242936] bg-[#161920] cursor-pointer shadow-sm hover:shadow-[#A855F7]/10 hover:border-[#A855F7]/50 transition-all"
                      onClick={() => setCurrentTrack(track)}
                    >
                      {track.coverArt ? (
                        <img src={track.coverArt} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="Cover" />
                      ) : (
                        <div className="absolute inset-0 w-full h-full transition-transform duration-500 group-hover:scale-110" style={{ background: track.gradient || 'linear-gradient(to bottom right, #374151, #161920)' }} />
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40 opacity-90 transition-opacity group-hover:opacity-100" />
      
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-[#0D0E12]/80 text-[#A855F7] border border-[#A855F7]/30 backdrop-blur-sm shadow-sm">
                        {track.key}
                      </div>
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-[#0D0E12]/80 text-[#22C55E] border border-[#22C55E]/30 backdrop-blur-sm shadow-sm">
                        {track.bpm}
                      </div>

                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveTrackForAnalysis(track); }}
                        className="absolute top-10 right-2 p-1.5 rounded-full bg-[#0D0E12]/80 hover:bg-[#A855F7] text-white opacity-0 group-hover:opacity-100 transition-all z-10 border border-[#242936] hover:border-[#A855F7] backdrop-blur-sm shadow-sm"
                        title="Analyze Track & Set Cues"
                      >
                        <Activity className="w-3 h-3" />
                      </button>
      
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="w-12 h-12 rounded-full bg-[#A855F7] flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.6)] text-white">
                          <Play className="w-5 h-5 ml-1" />
                        </div>
                      </div>
      
                      <div className="absolute bottom-0 left-0 right-0 p-3 pb-5">
                        <h3 className="text-xs font-bold text-white truncate drop-shadow-md">{track.title}</h3>
                        <p className="text-[10px] text-gray-400 truncate drop-shadow-md">{track.artist}</p>
                      </div>

                      {track.segments && (
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 flex bg-[#0D0E12]">
                          {track.segments.map(seg => (
                            <div key={seg.id} style={{ width: `${(seg.duration / (track.duration || 1)) * 100}%`, backgroundColor: seg.color }} title={`${seg.name} (${seg.key})`} />
                          ))}
                        </div>
                      )}
                      
                      <button 
                        onClick={(e) => { e.stopPropagation(); addToPlaylist(track); }}
                        className="absolute bottom-5 right-3 p-1.5 rounded-full bg-[#0D0E12]/80 hover:bg-[#22C55E] text-white opacity-0 group-hover:opacity-100 transition-all z-10 border border-[#242936] hover:border-[#22C55E] backdrop-blur-sm"
                        title="Add to Chapter"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : viewMode === 'scatter' ? (
            <ScatterMap tracks={tracks} onPlay={setCurrentTrack} onAddMultiple={addMultipleToPlaylist} />
          ) : (
            <GraphMap 
              tracks={playlist} 
              libraryTracks={tracks}
              onAddSuggested={addMultipleToPlaylist}
              onPlaySegment={(t, startSec) => {
                setCurrentTrack(t);
                setJumpToTime(startSec);
              }} 
              onAnalyze={(t) => setActiveTrackForAnalysis(t)}
            />
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="w-80 bg-[#161920] border-l border-[#242936] flex flex-col z-10 shrink-0">
        <div className="p-4 border-b border-[#242936]">
          <h2 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2"><ListVideo className="w-4 h-4 text-[#A855F7]" /> Set Chapter</h2>
          
          <div className="mt-6 flex items-center justify-between text-[11px] text-gray-400 font-mono">
            <span>Avg BPM: <span className="text-[#22C55E] font-bold">{avgBpm}</span></span>
            <span>Avg Energy: <span className="text-[#A855F7] font-bold">{avgEnergy.toFixed(1)}</span></span>
          </div>
          
          <div className="mt-3 h-10 flex items-end gap-[1px]">
            {playlist.length > 0 ? playlist.map((t, i) => (
              <div key={i} className="flex-1 bg-[#A855F7]/20 rounded-t-sm transition-all hover:bg-[#A855F7]/40 relative group" style={{ height: `${(t.energy / 10) * 100}%` }}>
                <div className="w-full bg-[#A855F7] rounded-t-sm" style={{ height: '2px' }} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-[#0D0E12] border border-[#242936] rounded text-[9px] font-mono opacity-0 group-hover:opacity-100 whitespace-nowrap z-50">
                  {t.energy}/10
                </div>
              </div>
            )) : (
              <div className="w-full h-full border border-dashed border-[#242936] rounded flex items-center justify-center text-[10px] text-gray-600">
                Empty Curve
              </div>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {playlist.length === 0 && (
            <div className="p-4 text-center text-xs text-gray-500">
              Click the <Plus className="w-3 h-3 inline mx-1" /> icon on a track to add it here.
            </div>
          )}
          {playlist.map((track, i) => (
            <div key={i} className="flex items-center gap-3 p-2 hover:bg-[#242936] rounded-lg group cursor-pointer transition-colors border border-transparent hover:border-[#242936]">
              <GripVertical className="w-4 h-4 text-gray-600 cursor-grab shrink-0" />
              {track.coverArt ? (
                <img src={track.coverArt} className="w-8 h-8 rounded object-cover" />
              ) : (
                <div className="w-8 h-8 rounded bg-[#0D0E12] flex items-center justify-center"><Music className="w-3 h-3 text-gray-600"/></div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate text-gray-200">{track.title}</p>
                <p className="text-[9px] text-gray-500 truncate">{track.artist}</p>
              </div>
              <div className="text-[9px] font-mono text-right shrink-0">
                <div className="text-[#22C55E]">{track.key}</div>
                <div className="text-gray-500">{track.bpm}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      </div>

      {activeTrackForAnalysis && (
        <AnalyzerPanel 
          track={activeTrackForAnalysis}
          onClose={() => setActiveTrackForAnalysis(null)}
          audioRef={audioRef as React.RefObject<HTMLAudioElement>}
          duration={duration}
          currentTime={currentTime}
          onUpdateTrack={updateTrack}
        />
      )}

      {/* DJOID LIBRARY MANAGER MODAL */}
      <LibraryManagerModal 
        isOpen={isLibraryManagerOpen}
        onClose={() => setIsLibraryManagerOpen(false)}
        tracks={tracks}
        groups={groups}
        onRefreshTracks={loadLibraryFromDisk}
        onTrackDeleted={(filePath) => {
          setTracks(prev => prev.filter(t => (t.filePath || t.id) !== filePath && t.id !== filePath));
          setPlaylist(prev => prev.filter(t => (t.filePath || t.id) !== filePath && t.id !== filePath));
          if (currentTrack && (currentTrack.filePath === filePath || currentTrack.id === filePath)) {
            setCurrentTrack(null);
          }
        }}
        onTrackUpdated={(filePath, updates) => {
          setTracks(prev => prev.map(t => {
            if (t.filePath === filePath || t.id === filePath) {
              return { ...t, ...updates };
            }
            return t;
          }));
          if (currentTrack && (currentTrack.filePath === filePath || currentTrack.id === filePath)) {
            setCurrentTrack(curr => curr ? { ...curr, ...updates } : null);
          }
        }}
        onGroupsUpdated={(newGroups) => {
          setGroups(newGroups);
        }}
        currentPlayingTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayTrack={(track) => {
          setCurrentTrack(track);
        }}
      />

      {/* BOTTOM PLAYER */}
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-[#161920] border-t border-[#242936] px-6 flex items-center justify-between z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        
        <div className="flex items-center gap-4 w-1/4">
          {currentTrack ? (
            <div 
              className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity" 
              onClick={() => setActiveTrackForAnalysis(currentTrack)}
              title="Open Analyzer"
            >
              {currentTrack.coverArt ? (
                <img src={currentTrack.coverArt} className="w-12 h-12 rounded object-cover border border-[#242936]" />
              ) : (
                <div className="w-12 h-12 rounded bg-[#0D0E12] flex items-center justify-center border border-[#242936]">
                  <Music className="w-5 h-5 text-gray-600"/>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate text-white">{currentTrack.title}</p>
                <p className="text-[10px] text-gray-400 truncate">{currentTrack.artist}</p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600 font-medium">Ready to play</div>
          )}
        </div>

        <div className="flex flex-col items-center flex-1 max-w-xl">
          <div className="flex items-center gap-6 mb-1.5">
            <button className="text-gray-500 hover:text-white transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2"></line></svg>
            </button>
            <button 
              onClick={togglePlay} 
              disabled={!currentTrack}
              className="w-9 h-9 rounded-full bg-[#A855F7] flex items-center justify-center text-white hover:scale-105 hover:bg-[#b56ef8] transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <button className="text-gray-500 hover:text-white transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2"></line></svg>
            </button>
          </div>
          <div className="flex items-center gap-3 w-full">
            <span className="text-[10px] font-mono text-gray-500 w-8 text-right">{formatTime(currentTime)}</span>
            <div 
              className="flex-1 flex flex-col gap-1.5 cursor-pointer group py-1"
              onClick={() => {
                if (currentTrack) setActiveTrackForAnalysis(currentTrack);
              }}
              title="Open Analyzer"
            >
              {/* Main Progress Bar */}
              <div className="w-full h-1.5 bg-[#0D0E12] border border-[#242936] rounded-full relative">
                <div className="absolute top-0 left-0 h-full bg-[#A855F7] rounded-full shadow-[0_0_8px_rgba(168,85,247,0.8)]" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} />
                {/* Playhead thumb visible on hover */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md pointer-events-none" 
                  style={{ left: `calc(${(currentTime / (duration || 1)) * 100}% - 6px)` }}
                />
              </div>
              
              {/* Segments Waveform */}
              {currentTrack?.segments && (
                <div className="w-full h-2 flex rounded overflow-hidden opacity-70 group-hover:opacity-100 transition-opacity">
                  {currentTrack.segments.map(seg => (
                    <div 
                      key={seg.id} 
                      className="h-full border-r border-[#0D0E12]/80 last:border-0 hover:brightness-125 transition-all"
                      style={{ 
                        width: `${(seg.duration / (currentTrack.duration || duration || 1)) * 100}%`, 
                        backgroundColor: seg.color 
                      }} 
                      title={`${seg.name} (${seg.key})`} 
                    />
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] font-mono text-gray-500 w-8">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-6 w-1/4">
          {currentTrack && (
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30">{currentTrack.key}</span>
              <span className="px-1.5 py-0.5 rounded bg-[#0D0E12] border border-[#242936] text-gray-400">{currentTrack.bpm}</span>
            </div>
          )}
          <div className="flex items-center gap-2 group">
            <Volume2 className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
            <div className="w-20 h-1.5 bg-[#0D0E12] border border-[#242936] rounded-full overflow-hidden relative">
              <input 
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="h-full bg-gray-300 rounded-full" style={{ width: `${volume * 100}%` }} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
