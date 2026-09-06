import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { FolderPlus, Play, Pause, Volume2, Plus, GripVertical, ListVideo, SlidersHorizontal, Activity, Music, Loader2, Database, Trash2, AlertTriangle, Unlock, Edit2, Copy, Check, X, HardDrive, LayoutGrid, List } from 'lucide-react';
import { extractMetadata } from './lib/audioMetadata';
import { getDB, saveTrack, getAllTracks, clearTracks, savePlaylist, getAllPlaylists, deletePlaylist, saveGroup, getAllGroups, deleteGroup } from './lib/db';
import ScatterMap from './components/ScatterMap';
import GraphMap from './components/GraphMap';
import AnalyzerPanel from './components/AnalyzerPanel';
import TrackAnalysisView from './components/TrackAnalysisView';
import PlaylistGroups from './components/PlaylistGroups';
import LibraryManagerModal from './components/LibraryManagerModal';
import CamelotWheel from './components/CamelotWheel';
import DjFilters from './components/DjFilters';
import SetPlaylistDrawer from './components/SetPlaylistDrawer';
import DjSetPlayer from './components/DjSetPlayer';
import { globalDjSetEngine } from './lib/djSetAudioEngine';
import { analyzeTrackSegments, TrackSegment } from './lib/audioAnalysis';
import { TrackDef, MulimaGroup, HotCue, PlaylistDef, TransitionConfig } from './types';

export type { HotCue };

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
};

export type Track = TrackDef;

export interface ListColumnsConfig {
  cover: boolean;
  title: boolean;
  album: boolean;
  bpm: boolean;
  key: boolean;
  energy: boolean;
  genre: boolean;
  duration: boolean;
  actions: boolean;
}

export const DEFAULT_LIST_COLUMNS: ListColumnsConfig = {
  cover: true,
  title: true,
  album: true,
  bpm: true,
  key: true,
  energy: true,
  genre: true,
  duration: true,
  actions: true,
};


const camelotKeys = [
  '1A','2A','3A','4A','5A','6A','7A','8A','9A','10A','11A','12A',
  '1B','2B','3B','4B','5B','6B','7B','8B','9B','10B','11B','12B'
];

const globalMulimaEngine = typeof window !== 'undefined' ? new Audio() : (null as any);
if (globalMulimaEngine) { globalMulimaEngine.volume = 1.0; }

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isLibraryManagerOpen, setIsLibraryManagerOpen] = useState(false);
  const [managerInitialTab, setManagerInitialTab] = useState<'tracks' | 'import' | 'groups' | 'organize'>('tracks');
  const [isSetPlaylistOpen, setIsSetPlaylistOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'scatter' | 'graph'>('grid');
  
  // DJ Set Transitions State
  const [setTransitions, setSetTransitions] = useState<TransitionConfig[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('mulima_set_transitions');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [activeTransitionId, setActiveTransitionId] = useState<string | undefined>(undefined);

  const handleTransitionsChange = (newTransitions: TransitionConfig[]) => {
    setSetTransitions(newTransitions);
    try {
      localStorage.setItem('mulima_set_transitions', JSON.stringify(newTransitions));
    } catch {}
  };
  
  // List View Column Customizer State
  const [listColumns, setListColumns] = useState<ListColumnsConfig>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('mulima_list_columns');
        if (saved) return { ...DEFAULT_LIST_COLUMNS, ...JSON.parse(saved) };
      } catch {}
    }
    return DEFAULT_LIST_COLUMNS;
  });
  const [showColumnConfigModal, setShowColumnConfigModal] = useState(false);

  const toggleListColumn = (key: keyof ListColumnsConfig) => {
    setListColumns(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('mulima_list_columns', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const resetListColumns = () => {
    setListColumns(DEFAULT_LIST_COLUMNS);
    try {
      localStorage.setItem('mulima_list_columns', JSON.stringify(DEFAULT_LIST_COLUMNS));
    } catch {}
  };

  const selectAllListColumns = () => {
    const all: ListColumnsConfig = {
      cover: true, title: true, album: true, bpm: true, key: true, energy: true, genre: true, duration: true, actions: true
    };
    setListColumns(all);
    try {
      localStorage.setItem('mulima_list_columns', JSON.stringify(all));
    } catch {}
  };
  
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [groups, setGroups] = useState<MulimaGroup[]>([]);
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
  const audioRef = useRef<HTMLAudioElement>(globalMulimaEngine);

  // Deduplicate tracks helper so no redundant copies appear in the UI
  const deduplicateTracks = (rawTracks: Track[]): Track[] => {
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();
    const seenSignatures = new Set<string>();
    const unique: Track[] = [];

    for (const t of rawTracks) {
      const idKey = t.id ? t.id.toLowerCase() : '';
      const pathKey = t.filePath ? t.filePath.toLowerCase().replace(/\\/g, '/') : '';
      const normArtist = (t.artist || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const normTitle = (t.title || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const sigKey = (normArtist && normTitle) ? `${normArtist}___${normTitle}` : '';

      if (idKey && seenIds.has(idKey)) continue;
      if (pathKey && seenPaths.has(pathKey)) continue;
      if (sigKey && seenSignatures.has(sigKey)) continue;

      if (idKey) seenIds.add(idKey);
      if (pathKey) seenPaths.add(pathKey);
      if (sigKey) seenSignatures.add(sigKey);

      unique.push(t);
    }
    return unique;
  };

  // Load from /LIBRARY on disk, with IndexedDB fallback
  const loadLibraryFromDisk = async () => {
    try {
      const res = await fetch('/api/library/tracks');
      const data = await res.json();
      if (data.success && data.tracks && data.tracks.length > 0) {
        const uniqueDiskTracks = deduplicateTracks(data.tracks);
        setTracks(uniqueDiskTracks);
        // Sync disk tracks to IndexedDB
        uniqueDiskTracks.forEach((t: Track) => {
          saveTrack(t).catch(() => {});
        });
        if (data.groups && data.groups.length > 0) {
          setGroups(data.groups);
          data.groups.forEach((g: MulimaGroup) => {
            saveGroup(g).catch(() => {});
          });
        }
      } else {
        // Fallback to IndexedDB if disk library is empty
        const savedTracks = await getAllTracks();
        if (savedTracks.length > 0) setTracks(deduplicateTracks(savedTracks));
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
      if (savedTracks.length > 0) setTracks(deduplicateTracks(savedTracks));
      if (savedPlaylists.length > 0) setPlaylists(savedPlaylists);
      if (savedGroups.length > 0) setGroups(savedGroups);
    }
  };

  useEffect(() => {
    loadLibraryFromDisk();
  }, []);

  // Audio setup
  useEffect(() => {
    const audio = globalMulimaEngine;
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
    if (globalMulimaEngine) globalMulimaEngine.volume = volume;
  }, [volume]);

  // Autoplay and Seek
  useEffect(() => {
    if (currentTrack && globalMulimaEngine) {
      const audio = globalMulimaEngine;
      
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
    if (globalMulimaEngine) {
      if (isPlaying) {
        globalMulimaEngine.pause();
        setIsPlaying(false);
      } else {
        if (!globalMulimaEngine.src) return;
        globalMulimaEngine.play().catch((e: any) => {
          if (e.name !== 'AbortError') setIsPlaying(false);
        });
        setIsPlaying(true);
      }
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!globalMulimaEngine || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    globalMulimaEngine.currentTime = pos * duration;
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
    setIsSetPlaylistOpen(true);
  };

  const addMultipleToPlaylist = (tracksToAdd: Track[]) => {
    setPlaylist(prev => [...prev, ...tracksToAdd]);
    setIsSetPlaylistOpen(true);
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

  const activeTransition = setTransitions.find(t => t.id === activeTransitionId) || setTransitions[0] || null;
  const graphDisplayTracks = playlist.length > 0 ? playlist : tracks.slice(0, 8);
  const deckATrack = activeTransition 
    ? (tracks.find(t => t.id === activeTransition.sourceTrackId) || null) 
    : (graphDisplayTracks[0] || null);
  const deckBTrack = activeTransition 
    ? (tracks.find(t => t.id === activeTransition.targetTrackId) || null) 
    : (graphDisplayTracks[1] || null);

  // Multi-track DJ Set Playback State & Synchronizer
  const [setPlaybackTime, setSetPlaybackTime] = useState(0);
  const [isSetPlaying, setIsSetPlaying] = useState(false);

  useEffect(() => {
    const unsub = globalDjSetEngine.onSetTimeUpdate((evt) => {
      setSetPlaybackTime(evt.setTimeSec);
      setIsSetPlaying(evt.isPlaying);
    });
    return unsub;
  }, []);

  // Pause DJ set playback if solo preview player starts
  useEffect(() => {
    if (isPlaying && isSetPlaying) {
      globalDjSetEngine.pause();
      setIsSetPlaying(false);
    }
  }, [isPlaying]);

  const handleSetSeek = (timeSec: number) => {
    globalDjSetEngine.seekSet(timeSec);
  };

  const handleSetTogglePlay = () => {
    if (isSetPlaying) {
      globalDjSetEngine.pause();
      setIsSetPlaying(false);
    } else {
      if (globalMulimaEngine && !globalMulimaEngine.paused) {
        globalMulimaEngine.pause();
        setIsPlaying(false);
      }
      globalDjSetEngine.playSet(graphDisplayTracks, setTransitions, setPlaybackTime);
      setIsSetPlaying(true);
    }
  };

  const handleAutomix = (orderedTracks: Track[], newTransitions: TransitionConfig[]) => {
    setPlaylist(orderedTracks);
    setSetTransitions(newTransitions);
    try {
      localStorage.setItem('mulima_set_transitions', JSON.stringify(newTransitions));
    } catch {}
  };

  return (
    <div className={`flex flex-col h-screen bg-[#0D0E12] text-white font-sans overflow-hidden ${viewMode === 'graph' ? 'pb-32' : 'pb-20'} selection:bg-[#A855F7]/30`}>
      
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
              title="MuLiMa Pro Library Manager öffnen"
            >
              <HardDrive className="w-4 h-4 text-white" />
              <span>Library Manager</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/40 border border-white/20">
                {tracks.length}
              </span>
            </button>
          </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-6">
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
              onOpenManager={(tab) => {
                setManagerInitialTab((tab as any) || 'groups');
                setIsLibraryManagerOpen(true);
              }}
              tracks={tracks}
            />
          </div>

          <div className="mb-6">
            <CamelotWheel 
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              tracks={tracks}
            />
          </div>

          <div className="mb-6">
            <DjFilters 
              bpmRange={bpmRange}
              onBpmRangeChange={setBpmRange}
              energyRange={energyRange}
              onEnergyRangeChange={setEnergyRange}
            />
          </div>
        </div>
      </div>

      {/* MIDDLE WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0D0E12] relative border-r border-[#242936]">
        <div className="h-16 px-6 border-b border-[#242936] flex items-center justify-between shrink-0 bg-[#161920] z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2 text-white">
              {viewMode === 'list' ? (
                <>
                  <List className="w-4 h-4 text-cyan-400" /> List View
                </>
              ) : viewMode === 'scatter' ? (
                <>
                  <Activity className="w-4 h-4 text-[#06B6D4]" /> Scatter Map
                </>
              ) : viewMode === 'graph' ? (
                <>
                  <Activity className="w-4 h-4 text-[#22C55E]" /> Graph Map
                </>
              ) : (
                <>
                  <LayoutGrid className="w-4 h-4 text-[#A855F7]" /> Cover View
                </>
              )}
            </h2>
            <span className="text-xs font-mono text-gray-500">
              ({filteredTracks.length} {filteredTracks.length === 1 ? 'Track' : 'Tracks'})
            </span>
          </div>
          
          <div className="flex bg-[#0D0E12] p-1 border border-[#242936] rounded-xl gap-1">
            <button 
              id="btn-view-cover"
              onClick={() => setViewMode('grid')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${viewMode === 'grid' ? 'bg-[#242936] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              title="Cover View (Große Album-Cover Raster-Ansicht)"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#A855F7]" />
              <span>Cover View</span>
            </button>
            <button 
              id="btn-view-list"
              onClick={() => setViewMode('list')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-[#242936] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              title="List View (Kompakte Tabellen-Ansicht mit Thumbnail)"
            >
              <List className="w-3.5 h-3.5 text-cyan-400" />
              <span>List View</span>
            </button>
            <button 
              onClick={() => setViewMode('scatter')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'scatter' ? 'bg-[#242936] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              title="Scatter Map (2D Harmonische BPM/Energy-Karte)"
            >
              Scatter
            </button>
            <button 
              id="btn-view-graph"
              onClick={() => setViewMode('graph')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'graph' ? 'bg-[#242936] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
              title="Graph Map (Strukturierte Track-Relationen)"
            >
              Graph
            </button>

            {/* List View Column Customizer Trigger */}
            {viewMode === 'list' && (
              <div className="relative ml-2">
                <button
                  id="btn-list-columns-config"
                  onClick={() => setShowColumnConfigModal(!showColumnConfigModal)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                    showColumnConfigModal 
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm' 
                      : 'bg-[#1E2330] text-gray-300 hover:text-white border-[#2F3646]'
                  }`}
                  title="Spalten ein- und ausblenden"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Spalten</span>
                </button>

                {showColumnConfigModal && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-[#161920] border border-[#2F3646] rounded-xl shadow-2xl z-50 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-[#242936] pb-2">
                      <span className="font-bold text-xs uppercase tracking-wider text-white">Spalten anpassen</span>
                      <button onClick={() => setShowColumnConfigModal(false)} className="text-gray-400 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto py-1 text-xs">
                      {[
                        { key: 'cover' as const, label: 'Cover-Thumbnail' },
                        { key: 'title' as const, label: 'Titel & Interpret' },
                        { key: 'album' as const, label: 'Album & Jahr' },
                        { key: 'bpm' as const, label: 'BPM (Tempo)' },
                        { key: 'key' as const, label: 'Tonart (Key)' },
                        { key: 'energy' as const, label: 'Energy-Level' },
                        { key: 'genre' as const, label: 'Genre & Mood' },
                        { key: 'duration' as const, label: 'Laufzeit / Dauer' },
                        { key: 'actions' as const, label: 'Aktionen (Studio, +)' },
                      ].map(col => (
                        <label key={col.key} className="flex items-center gap-2.5 px-2 py-1 rounded hover:bg-[#1E2330] cursor-pointer text-gray-300 hover:text-white select-none">
                          <input
                            type="checkbox"
                            checked={listColumns[col.key]}
                            onChange={() => toggleListColumn(col.key)}
                            className="accent-cyan-400 rounded cursor-pointer"
                          />
                          <span className="text-xs font-mono">{col.label}</span>
                        </label>
                      ))}
                    </div>

                    <div className="flex items-center justify-between border-t border-[#242936] pt-2 text-[10px] font-mono">
                      <button onClick={selectAllListColumns} className="text-cyan-400 hover:underline">Alle an</button>
                      <button onClick={resetListColumns} className="text-gray-400 hover:underline">Standard</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col bg-[#0D0E12]">
          {viewMode === 'list' ? (
            <div className="flex-1 p-5 overflow-y-auto relative">
              {tracks.length === 0 && !isScanning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                  <FolderPlus className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Library is empty. Import a folder to start.</p>
                </div>
              ) : (
                <div className="bg-[#12141A] rounded-xl border border-[#242936] overflow-hidden shadow-xl">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#242936] bg-[#161920] text-gray-400 font-mono text-[11px] uppercase tracking-wider select-none">
                        {listColumns.cover && <th className="py-3 px-3 w-14 text-center">Cover</th>}
                        {listColumns.title && <th className="py-3 px-4">Titel & Interpret</th>}
                        {listColumns.album && <th className="py-3 px-4">Album & Jahr</th>}
                        {listColumns.bpm && <th className="py-3 px-3 text-center">BPM</th>}
                        {listColumns.key && <th className="py-3 px-3 text-center">Key</th>}
                        {listColumns.energy && <th className="py-3 px-3 text-center">Energy</th>}
                        {listColumns.genre && <th className="py-3 px-4">Genre / Mood</th>}
                        {listColumns.duration && <th className="py-3 px-3 text-right">Dauer</th>}
                        {listColumns.actions && <th className="py-3 px-4 text-right">Aktionen</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2330]">
                      {filteredTracks.map((track) => {
                        const isThisTrackPlaying = isPlaying && currentTrack?.id === track.id;
                        const durationFormatted = track.duration
                          ? `${Math.floor(track.duration / 60)}:${Math.floor(track.duration % 60).toString().padStart(2, '0')}`
                          : '--:--';

                        return (
                          <tr
                            key={track.id}
                            onClick={() => setCurrentTrack(track)}
                            className={`group hover:bg-[#1A1E29] transition-colors cursor-pointer ${
                              currentTrack?.id === track.id ? 'bg-[#181C26]' : ''
                            }`}
                          >
                            {/* Artwork Thumbnail */}
                            {listColumns.cover && (
                              <td className="py-2.5 px-3 text-center">
                                <div className="w-11 h-11 rounded-lg bg-[#0A0C10] border border-[#242936] overflow-hidden relative mx-auto shrink-0 shadow-sm">
                                  {track.coverArt ? (
                                    <img src={track.coverArt} alt={track.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <div
                                      className="w-full h-full flex items-center justify-center"
                                      style={{ background: track.gradient || 'linear-gradient(to bottom right, #374151, #161920)' }}
                                    >
                                      <Music className="w-5 h-5 text-gray-400" />
                                    </div>
                                  )}
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (currentTrack?.id === track.id) {
                                        setIsPlaying(!isPlaying);
                                        if (audioRef.current) {
                                          if (isPlaying) audioRef.current.pause();
                                          else audioRef.current.play();
                                        }
                                      } else {
                                        setCurrentTrack(track);
                                      }
                                    }}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                    title={isThisTrackPlaying ? 'Pause' : 'Abspielen'}
                                  >
                                    {isThisTrackPlaying ? (
                                      <Pause className="w-4 h-4 text-lime-400" />
                                    ) : (
                                      <Play className="w-4 h-4 text-white ml-0.5" />
                                    )}
                                  </div>
                                </div>
                              </td>
                            )}

                            {/* Title & Artist */}
                            {listColumns.title && (
                              <td className="py-2.5 px-4 min-w-[200px]">
                                <div className="font-bold text-white text-xs truncate max-w-xs group-hover:text-cyan-300 transition-colors">
                                  {track.title}
                                </div>
                                <div className="text-gray-400 text-[11px] truncate max-w-xs">
                                  {track.artist || 'Unbekannter Künstler'}
                                </div>
                              </td>
                            )}

                            {/* Album & Year */}
                            {listColumns.album && (
                              <td className="py-2.5 px-4 text-gray-300 font-mono text-[11px] min-w-[150px]">
                                <div className="truncate max-w-xs">{track.album || '—'}</div>
                                <div className="text-gray-500 text-[10px]">{track.year || ''}</div>
                              </td>
                            )}

                            {/* BPM */}
                            {listColumns.bpm && (
                              <td className="py-2.5 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[11px] bg-[#06B6D4]/15 text-[#06B6D4] border border-[#06B6D4]/30">
                                  {track.bpm}
                                </span>
                              </td>
                            )}

                            {/* Camelot Key */}
                            {listColumns.key && (
                              <td className="py-2.5 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[11px] bg-[#A855F7]/15 text-[#A855F7] border border-[#A855F7]/30">
                                  {track.key}
                                </span>
                              </td>
                            )}

                            {/* Energy Level */}
                            {listColumns.energy && (
                              <td className="py-2.5 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[10px] bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30">
                                  ⚡ {track.energy}/10
                                </span>
                              </td>
                            )}

                            {/* Genre / Mood */}
                            {listColumns.genre && (
                              <td className="py-2.5 px-4 text-gray-400 text-[11px]">
                                <div className="truncate max-w-[140px] font-medium text-gray-300">
                                  {track.genre || track.style || 'Electronic'}
                                </div>
                                {track.mood && (
                                  <div className="text-gray-500 text-[10px] truncate max-w-[140px]">
                                    {track.mood}
                                  </div>
                                )}
                              </td>
                            )}

                            {/* Duration */}
                            {listColumns.duration && (
                              <td className="py-2.5 px-3 text-right font-mono text-gray-400 text-xs">
                                {durationFormatted}
                              </td>
                            )}

                            {/* Action Buttons */}
                            {listColumns.actions && (
                              <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => setActiveTrackForAnalysis(track)}
                                    className="px-2 py-1 rounded-lg bg-[#1E2330] hover:bg-[#2A3245] text-cyan-400 hover:text-white border border-[#2F3646] font-mono text-[10px] font-bold flex items-center gap-1 transition-all"
                                    title="Studio Deep Analysis & Precision Waveform öffnen"
                                  >
                                    <Activity className="w-3.5 h-3.5" />
                                    <span>Studio</span>
                                  </button>
                                  <button
                                    onClick={() => addToPlaylist(track)}
                                    className="p-1.5 rounded-lg bg-[#1E2330] hover:bg-[#22C55E] text-gray-300 hover:text-black border border-[#2F3646] transition-all"
                                    title="Zu Set Playlist hinzufügen"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="flex-1 p-6 overflow-y-auto relative">
              {tracks.length === 0 && !isScanning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                  <FolderPlus className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Library is empty. Import a folder to start.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-4">
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
                        title="Add to Set Playlist"
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
              tracks={graphDisplayTracks} 
              libraryTracks={tracks}
              onAddSuggested={addMultipleToPlaylist}
              transitions={setTransitions}
              activeTransitionId={activeTransitionId}
              onTransitionsChange={handleTransitionsChange}
              onSelectTransition={(t) => setActiveTransitionId(t.id)}
              onPlaySegment={(t, startSec) => {
                setCurrentTrack(t);
                setJumpToTime(startSec);
              }} 
              onAnalyze={(t) => setActiveTrackForAnalysis(t)}
              currentTime={setPlaybackTime}
              isPlaying={isSetPlaying}
              onSeek={handleSetSeek}
              onTogglePlay={handleSetTogglePlay}
              onAutomix={handleAutomix}
              onTrackUpdated={(updated) => updateTrack(updated.id, updated)}
            />
          )}
        </div>
      </div>

      {/* SET PLAYLIST COLLAPSIBLE DRAWER */}
      <SetPlaylistDrawer 
        playlist={playlist}
        onSetPlaylist={setPlaylist}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayTrack={setCurrentTrack}
        isOpen={isSetPlaylistOpen}
        onToggleOpen={setIsSetPlaylistOpen}
      />

      </div>

      {activeTrackForAnalysis && (
        <TrackAnalysisView 
          track={activeTrackForAnalysis}
          onClose={() => setActiveTrackForAnalysis(null)}
          onUpdateTrack={updateTrack}
          currentPlayingTrack={currentTrack}
          isPlayingGlobal={isPlaying}
        />
      )}

      {/* MuLiMa Pro LIBRARY MANAGER MODAL */}
      <LibraryManagerModal 
        isOpen={isLibraryManagerOpen}
        onClose={() => setIsLibraryManagerOpen(false)}
        tracks={tracks}
        groups={groups}
        onRefreshTracks={loadLibraryFromDisk}
        onClearLibrary={handleClearLibrary}
        onOpenAnalysisTrack={(track) => setActiveTrackForAnalysis(track)}
        initialTab={managerInitialTab}
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
      {viewMode === 'graph' ? (
        <DjSetPlayer 
          deckATrack={deckATrack}
          deckBTrack={deckBTrack}
          activeTransition={activeTransition}
          transitions={setTransitions}
          onSelectTransition={(t) => setActiveTransitionId(t.id)}
          onOpenTrackAnalysis={(t) => setActiveTrackForAnalysis(t)}
          onTrackUpdated={(updated) => updateTrack(updated.id, updated)}
        />
      ) : (
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
      )}
    </div>
  );
}
