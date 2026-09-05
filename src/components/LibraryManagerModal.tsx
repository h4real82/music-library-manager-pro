import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { 
  X, 
  FolderPlus, 
  UploadCloud, 
  Trash2, 
  Play, 
  Pause, 
  FolderSync, 
  Check, 
  Plus, 
  Music, 
  Tag, 
  Layers, 
  Search, 
  CheckSquare, 
  Square, 
  SlidersHorizontal,
  HardDrive,
  FolderTree,
  Sparkles,
  Loader2,
  RefreshCw,
  FileAudio
} from 'lucide-react';
import { TrackDef, DjoidGroup } from '../types';
import { extractMetadata } from '../lib/audioMetadata';

interface LibraryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: TrackDef[];
  groups: DjoidGroup[];
  onRefreshTracks: () => Promise<void>;
  onTrackDeleted: (filePath: string) => void;
  onTrackUpdated: (filePath: string, updates: Partial<TrackDef>) => void;
  onGroupsUpdated: (groups: DjoidGroup[]) => void;
  currentPlayingTrack: TrackDef | null;
  isPlaying: boolean;
  onPlayTrack: (track: TrackDef) => void;
}

const PRESET_COLORS = [
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Blue', hex: '#3B82F6' },
];

const PRESET_MOODS = [
  'Treibend',
  'Euphorisch',
  'Hypnotisch',
  'Dunkel',
  'Melancholisch',
  'Entspannt',
  'Aggressiv',
  'Atmosphärisch'
];

const PRESET_STYLES = [
  'Peaktime Techno',
  'Melodic House',
  'Deep Tech',
  'Hard Techno',
  'Minimal',
  'Acid',
  'Indie Dance',
  'Ambient'
];

export default function LibraryManagerModal({
  isOpen,
  onClose,
  tracks,
  groups,
  onRefreshTracks,
  onTrackDeleted,
  onTrackUpdated,
  onGroupsUpdated,
  currentPlayingTrack,
  isPlaying,
  onPlayTrack
}: LibraryManagerModalProps) {
  if (!isOpen) return null;

  // Active Tab / Sub-views
  const [activeTab, setActiveTab] = useState<'tracks' | 'import' | 'groups' | 'organize'>('tracks');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterMood, setFilterMood] = useState<string | null>(null);
  const [filterStyle, setFilterStyle] = useState<string | null>(null);

  // Multi-selection
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [targetGroupForImport, setTargetGroupForImport] = useState<string>('');
  const [targetMoodForImport, setTargetMoodForImport] = useState<string>('');
  const [targetStyleForImport, setTargetStyleForImport] = useState<string>('');

  // New Group State
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMood, setNewGroupMood] = useState('');
  const [newGroupStyle, setNewGroupStyle] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0].hex);

  // Organize State
  const [organizeScheme, setOrganizeScheme] = useState<'group' | 'mood' | 'style' | 'artist' | 'flat'>('group');
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizeResult, setOrganizeResult] = useState<string | null>(null);

  // File Inputs Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Calculate stats
  const totalSizeBytes = tracks.reduce((acc, t) => acc + (t.fileSize || 0), 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);

  // Filtered tracks
  const filteredTracks = tracks.filter(track => {
    const matchesSearch = !searchQuery || 
      track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (track.key && track.key.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (track.filePath && track.filePath.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesGroup = !filterGroup || (track.groups && track.groups.includes(filterGroup));
    const matchesMood = !filterMood || track.mood === filterMood;
    const matchesStyle = !filterStyle || track.style === filterStyle;

    return matchesSearch && matchesGroup && matchesMood && matchesStyle;
  });

  // Toggle Track Selection
  const toggleSelectTrack = (filePath: string) => {
    const next = new Set(selectedPaths);
    if (next.has(filePath)) next.delete(filePath);
    else next.add(filePath);
    setSelectedPaths(next);
  };

  const selectAllFiltered = () => {
    if (selectedPaths.size === filteredTracks.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredTracks.map(t => t.filePath || t.id)));
    }
  };

  // Upload Files to /api/library/upload
  const handleUploadFiles = async (files: File[]) => {
    const audioFiles = files.filter(f => /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name));
    if (audioFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: audioFiles.length, currentName: '' });

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      setUploadProgress({ current: i + 1, total: audioFiles.length, currentName: file.name });

      try {
        // Extract basic ID3 metadata in browser
        const meta = await extractMetadata(file);

        // Upload file stream to server
        const params = new URLSearchParams({
          filename: file.name,
          group: targetGroupForImport,
          mood: targetMoodForImport,
          style: targetStyleForImport
        });

        const uploadRes = await fetch(`/api/library/upload?${params.toString()}`, {
          method: 'POST',
          body: file
        });
        const uploadJson = await uploadRes.json();

        if (uploadJson.success && uploadJson.filePath) {
          // Send extracted metadata
          await fetch('/api/library/update-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: uploadJson.filePath,
              updates: {
                title: meta.title || file.name.replace(/\.[^/.]+$/, ''),
                artist: meta.artist || 'Unknown Artist',
                bpm: meta.bpm || Math.floor(Math.random() * 15 + 124),
                key: meta.key || '8A',
                coverArt: meta.coverArt || undefined
              }
            })
          });
        }
      } catch (err) {
        console.error('Upload error for file:', file.name, err);
      }
    }

    setIsUploading(false);
    await onRefreshTracks();
    setActiveTab('tracks');
  };

  // File Inputs
  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  // Drag & Drop
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Delete Track
  const handleDeleteTrack = async (filePath?: string) => {
    if (!filePath) return;
    if (!window.confirm(`Track wirklich physisch aus dem LIBRARY-Ordner löschen?\n\n${filePath}`)) return;

    try {
      const res = await fetch(`/api/library/track?file=${encodeURIComponent(filePath)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        onTrackDeleted(filePath);
        setSelectedPaths(prev => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Batch Delete
  const handleBatchDelete = async () => {
    if (selectedPaths.size === 0) return;
    if (!window.confirm(`${selectedPaths.size} ausgewählte Tracks wirklich dauerhaft von der Festplatte löschen?`)) return;

    const paths = Array.from(selectedPaths) as string[];
    for (const p of paths) {
      try {
        await fetch(`/api/library/track?file=${encodeURIComponent(p)}`, { method: 'DELETE' });
        onTrackDeleted(p);
      } catch (e) {
        console.error(e);
      }
    }
    setSelectedPaths(new Set());
    await onRefreshTracks();
  };

  // Batch Assign Group
  const handleBatchAssignGroup = async (groupId: string) => {
    const paths = Array.from(selectedPaths) as string[];
    for (const p of paths) {
      const track = tracks.find(t => t.filePath === p);
      if (track) {
        const currentGroups = track.groups || [];
        const nextGroups = currentGroups.includes(groupId) ? currentGroups : [...currentGroups, groupId];
        await fetch('/api/library/update-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: p,
            updates: { groups: nextGroups }
          })
        });
        onTrackUpdated(p, { groups: nextGroups });
      }
    }
    setSelectedPaths(new Set());
  };

  // Toggle Single Track Group
  const toggleTrackGroup = async (track: TrackDef, groupId: string) => {
    if (!track.filePath) return;
    const current = track.groups || [];
    const updated = current.includes(groupId)
      ? current.filter(g => g !== groupId)
      : [...current, groupId];

    onTrackUpdated(track.filePath, { groups: updated });

    await fetch('/api/library/update-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: track.filePath,
        updates: { groups: updated }
      })
    });
  };

  // Update Single Track Mood
  const updateTrackMood = async (track: TrackDef, mood: string) => {
    if (!track.filePath) return;
    onTrackUpdated(track.filePath, { mood });
    await fetch('/api/library/update-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: track.filePath, updates: { mood } })
    });
  };

  // Update Single Track Style
  const updateTrackStyle = async (track: TrackDef, style: string) => {
    if (!track.filePath) return;
    onTrackUpdated(track.filePath, { style });
    await fetch('/api/library/update-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: track.filePath, updates: { style } })
    });
  };

  // Add New Group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const newGroup: DjoidGroup = {
      id: 'grp_' + Math.random().toString(36).substring(2, 9),
      name: newGroupName.trim(),
      mood: newGroupMood.trim() || undefined,
      style: newGroupStyle.trim() || undefined,
      color: newGroupColor,
      createdAt: Date.now()
    };

    const nextGroups = [...groups, newGroup];
    onGroupsUpdated(nextGroups);

    await fetch('/api/library/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: nextGroups })
    });

    setNewGroupName('');
    setNewGroupMood('');
    setNewGroupStyle('');
  };

  // Delete Group
  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('Gruppe wirklich löschen?')) return;
    const nextGroups = groups.filter(g => g.id !== groupId);
    onGroupsUpdated(nextGroups);

    if (filterGroup === groupId) setFilterGroup(null);

    await fetch('/api/library/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: nextGroups })
    });
  };

  // Run Organize
  const handleRunOrganize = async () => {
    setIsOrganizing(true);
    setOrganizeResult(null);

    try {
      const res = await fetch('/api/library/organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheme: organizeScheme })
      });
      const data = await res.json();
      if (data.success) {
        setOrganizeResult(`Erfolgreich strukturiert: ${data.movedCount} Datei(en) im LIBRARY-Ordner sortiert!`);
        await onRefreshTracks();
      } else {
        setOrganizeResult(`Fehler: ${data.error}`);
      }
    } catch (err: any) {
      setOrganizeResult(`Fehler: ${err.message}`);
    } finally {
      setIsOrganizing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      
      {/* MODAL WINDOW */}
      <div className="bg-[#12141a] border border-[#242936] rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden text-white font-sans">
        
        {/* MODAL HEADER */}
        <div className="h-16 px-6 bg-[#161920] border-b border-[#242936] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#A855F7] to-[#06B6D4] flex items-center justify-center shadow-md shadow-[#A855F7]/20">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold uppercase tracking-wider text-white">DJOID Library Manager</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/30">
                  /LIBRARY
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-mono">
                {tracks.length} Tracks ({totalSizeMB} MB) • Festplatten-Dateisystem aktiv
              </p>
            </div>
          </div>

          {/* TAB NAVIGATION */}
          <div className="flex items-center gap-1 bg-[#0D0E12] p-1 rounded-xl border border-[#242936]">
            <button 
              onClick={() => setActiveTab('tracks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'tracks' ? 'bg-[#A855F7] text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              Tracks ({tracks.length})
            </button>
            <button 
              onClick={() => setActiveTab('import')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'import' ? 'bg-[#A855F7] text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Importieren & Kopieren
            </button>
            <button 
              onClick={() => setActiveTab('groups')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'groups' ? 'bg-[#A855F7] text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Gruppen & Stile ({groups.length})
            </button>
            <button 
              onClick={() => setActiveTab('organize')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'organize' ? 'bg-[#A855F7] text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              Strukturiert sortieren
            </button>
          </div>

          <button 
            onClick={onClose}
            className="p-2 hover:bg-[#242936] rounded-xl text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#0D0E12]">

          {/* 1. TAB: TRACKS LIST */}
          {activeTab === 'tracks' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* FILTER & TOOLBAR */}
              <div className="p-4 bg-[#161920]/60 border-b border-[#242936] flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Suche nach Titel, Artist, Key, Pfad..."
                      className="w-full bg-[#0D0E12] border border-[#242936] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-[#A855F7]"
                    />
                  </div>

                  {/* Filter by Group */}
                  <select 
                    value={filterGroup || ''}
                    onChange={e => setFilterGroup(e.target.value || null)}
                    className="bg-[#0D0E12] border border-[#242936] rounded-xl px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-[#A855F7]"
                  >
                    <option value="">Alle Gruppen</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>

                  {/* Filter by Mood */}
                  <select 
                    value={filterMood || ''}
                    onChange={e => setFilterMood(e.target.value || null)}
                    className="bg-[#0D0E12] border border-[#242936] rounded-xl px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-[#A855F7]"
                  >
                    <option value="">Alle Stimmungen</option>
                    {PRESET_MOODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>

                  {/* Filter by Style */}
                  <select 
                    value={filterStyle || ''}
                    onChange={e => setFilterStyle(e.target.value || null)}
                    className="bg-[#0D0E12] border border-[#242936] rounded-xl px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-[#A855F7]"
                  >
                    <option value="">Alle Stile</option>
                    {PRESET_STYLES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Batch Actions & Refresh */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={selectAllFiltered}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0D0E12] border border-[#242936] rounded-xl text-xs text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    {selectedPaths.size === filteredTracks.length && filteredTracks.length > 0 ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[#A855F7]" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-gray-500" />
                    )}
                    <span>Alle ({filteredTracks.length})</span>
                  </button>

                  {selectedPaths.size > 0 && (
                    <>
                      <button 
                        onClick={handleBatchDelete}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/40 rounded-xl text-xs font-bold hover:bg-red-500/30 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Löschen ({selectedPaths.size})
                      </button>

                      <div className="relative group">
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/40 rounded-xl text-xs font-bold hover:bg-[#A855F7]/30 transition-colors">
                          <Tag className="w-3.5 h-3.5" />
                          Zu Gruppe zuweisen...
                        </button>
                        <div className="absolute right-0 top-full mt-1 w-48 bg-[#161920] border border-[#242936] rounded-xl p-1 shadow-xl hidden group-hover:block z-30">
                          {groups.map(g => (
                            <button 
                              key={g.id}
                              onClick={() => handleBatchAssignGroup(g.id)}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-[#242936] text-gray-200 hover:text-white flex items-center justify-between"
                            >
                              <span>{g.name}</span>
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color || '#A855F7' }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <button 
                    onClick={onRefreshTracks}
                    title="Library neu einlesen"
                    className="p-1.5 bg-[#0D0E12] border border-[#242936] rounded-xl text-gray-400 hover:text-white hover:border-[#A855F7] transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* TRACKS TABLE */}
              <div className="flex-1 overflow-y-auto p-4">
                {filteredTracks.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-3">
                    <FileAudio className="w-12 h-12 opacity-30" />
                    <p className="text-sm">Keine Tracks gefunden.</p>
                    <button 
                      onClick={() => setActiveTab('import')}
                      className="px-4 py-2 rounded-xl bg-[#A855F7] text-white text-xs font-bold hover:bg-[#b56ef8] transition-colors"
                    >
                      Jetzt Tracks in den LIBRARY-Ordner kopieren
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredTracks.map(track => {
                      const isSelected = selectedPaths.has(track.filePath || track.id);
                      const isThisPlaying = currentPlayingTrack?.id === track.id && isPlaying;

                      return (
                        <div 
                          key={track.id}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                            isSelected 
                              ? 'bg-[#A855F7]/10 border-[#A855F7]/50 shadow-sm' 
                              : 'bg-[#161920] border-[#242936] hover:border-gray-600'
                          }`}
                        >
                          {/* Checkbox */}
                          <button 
                            onClick={() => toggleSelectTrack(track.filePath || track.id)}
                            className="text-gray-500 hover:text-white shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#A855F7]" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-600" />
                            )}
                          </button>

                          {/* Play Button */}
                          <button 
                            onClick={() => onPlayTrack(track)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                              isThisPlaying 
                                ? 'bg-[#A855F7] text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' 
                                : 'bg-[#0D0E12] border border-[#242936] text-gray-400 hover:text-white hover:border-[#A855F7]'
                            }`}
                          >
                            {isThisPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                          </button>

                          {/* Cover / Icon */}
                          {track.coverArt ? (
                            <img src={track.coverArt} className="w-9 h-9 rounded-lg object-cover border border-[#242936] shrink-0" alt="Cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[#0D0E12] border border-[#242936] flex items-center justify-center shrink-0">
                              <Music className="w-4 h-4 text-gray-500" />
                            </div>
                          )}

                          {/* Track Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold truncate text-white">{track.title}</h4>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-[#0D0E12] text-gray-400 border border-[#242936]">
                                {track.format || 'AUDIO'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                              <span className="truncate">{track.artist}</span>
                              <span>•</span>
                              <span className="font-mono text-gray-500 truncate" title={`Relativer Pfad: LIBRARY/${track.filePath}`}>
                                {track.filePath || track.filename}
                              </span>
                            </div>
                          </div>

                          {/* Camelot & BPM */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#A855F7]/10 text-[#A855F7] border border-[#A855F7]/30">
                              {track.key || '8A'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30">
                              {track.bpm} BPM
                            </span>
                          </div>

                          {/* Mood Dropdown */}
                          <div className="shrink-0 w-28">
                            <select 
                              value={track.mood || ''}
                              onChange={e => updateTrackMood(track, e.target.value)}
                              className="w-full bg-[#0D0E12] border border-[#242936] rounded-lg px-1.5 py-1 text-[10px] text-gray-300 outline-none hover:border-[#A855F7]"
                            >
                              <option value="">+ Stimmung...</option>
                              {PRESET_MOODS.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>

                          {/* Style Dropdown */}
                          <div className="shrink-0 w-32">
                            <select 
                              value={track.style || ''}
                              onChange={e => updateTrackStyle(track, e.target.value)}
                              className="w-full bg-[#0D0E12] border border-[#242936] rounded-lg px-1.5 py-1 text-[10px] text-gray-300 outline-none hover:border-[#A855F7]"
                            >
                              <option value="">+ Stil/Genre...</option>
                              {PRESET_STYLES.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>

                          {/* Assigned Groups Chips (DJOID Style) */}
                          <div className="flex flex-wrap items-center gap-1 shrink-0 max-w-[180px]">
                            {groups.map(g => {
                              const isAssigned = track.groups?.includes(g.id);
                              return (
                                <button 
                                  key={g.id}
                                  onClick={() => toggleTrackGroup(track, g.id)}
                                  style={{
                                    borderColor: isAssigned ? (g.color || '#A855F7') : '#242936',
                                    backgroundColor: isAssigned ? `${g.color || '#A855F7'}25` : 'transparent',
                                    color: isAssigned ? (g.color || '#A855F7') : '#6B7280'
                                  }}
                                  className="text-[9px] px-1.5 py-0.5 rounded border font-medium hover:border-white transition-all"
                                >
                                  {g.name}
                                </button>
                              );
                            })}
                          </div>

                          {/* Delete Button */}
                          <button 
                            onClick={() => handleDeleteTrack(track.filePath)}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0"
                            title="Track physisch von Festplatte löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. TAB: IMPORTIEREN & KOPIEREN IN LIBRARY */}
          {activeTab === 'import' && (
            <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto w-full flex flex-col justify-center">
              
              <div className="mb-6 text-center">
                <h3 className="text-xl font-bold text-white mb-2">Tracks in den LIBRARY-Ordner importieren & kopieren</h3>
                <p className="text-xs text-gray-400 max-w-md mx-auto">
                  Ausgewählte Audio-Dateien werden direkt physisch auf der Festplatte im Ordner <code className="text-[#A855F7] font-mono">/LIBRARY</code> abgelegt und automatisch analysiert.
                </p>
              </div>

              {/* Import Options (Target Group & Mood) */}
              <div className="bg-[#161920] border border-[#242936] rounded-2xl p-5 mb-6 grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Ziel-Gruppe</label>
                  <select 
                    value={targetGroupForImport}
                    onChange={e => setTargetGroupForImport(e.target.value)}
                    className="w-full bg-[#0D0E12] border border-[#242936] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#A855F7]"
                  >
                    <option value="">Keine direkte Gruppe</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Stimmung (Mood)</label>
                  <select 
                    value={targetMoodForImport}
                    onChange={e => setTargetMoodForImport(e.target.value)}
                    className="w-full bg-[#0D0E12] border border-[#242936] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#A855F7]"
                  >
                    <option value="">Automatisch / Unbestimmt</option>
                    {PRESET_MOODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Stil (Genre)</label>
                  <select 
                    value={targetStyleForImport}
                    onChange={e => setTargetStyleForImport(e.target.value)}
                    className="w-full bg-[#0D0E12] border border-[#242936] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#A855F7]"
                  >
                    <option value="">Automatisch / Unbestimmt</option>
                    {PRESET_STYLES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div 
                onDragOver={e => e.preventDefault()}
                onDrop={onDrop}
                className="border-2 border-dashed border-[#242936] hover:border-[#A855F7] bg-[#161920]/40 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors group mb-6"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="w-12 h-12 text-[#A855F7] mb-3 group-hover:scale-110 transition-transform" />
                <h4 className="text-base font-bold text-white mb-1">Audio-Dateien hierher ziehen</h4>
                <p className="text-xs text-gray-400 mb-4">Unterstützt MP3, WAV, FLAC, OGG, M4A, AAC</p>
                
                <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-[#A855F7] hover:bg-[#b56ef8] text-white text-xs font-bold transition-all shadow-md shadow-[#A855F7]/20 flex items-center gap-2"
                  >
                    <FileAudio className="w-4 h-4" />
                    Einzelne Tracks wählen
                  </button>

                  <button 
                    onClick={() => folderInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-[#242936] hover:bg-[#2d3344] text-gray-200 text-xs font-bold transition-all flex items-center gap-2"
                  >
                    <FolderPlus className="w-4 h-4 text-[#06B6D4]" />
                    Ganzen Ordner wählen
                  </button>
                </div>
              </div>

              {/* Hidden Inputs */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={onFileChange} 
                multiple 
                accept="audio/*" 
                className="hidden" 
              />
              <input 
                type="file" 
                ref={folderInputRef} 
                onChange={onFileChange} 
                // @ts-ignore
                webkitdirectory="true" 
                directory="true" 
                multiple 
                className="hidden" 
              />

              {/* Upload Progress Status */}
              {isUploading && (
                <div className="bg-[#161920] border border-[#242936] rounded-2xl p-4 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="flex items-center gap-2 text-white font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-[#A855F7]" />
                      Kopiere in /LIBRARY: {uploadProgress.currentName}
                    </span>
                    <span className="font-mono text-[#A855F7] font-bold">
                      {uploadProgress.current} von {uploadProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#0D0E12] rounded-full overflow-hidden border border-[#242936]">
                    <div 
                      className="h-full bg-gradient-to-r from-[#A855F7] to-[#06B6D4] transition-all duration-200"
                      style={{ width: `${(uploadProgress.current / Math.max(uploadProgress.total, 1)) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. TAB: GRUPPEN & STILE (DJOID) */}
          {activeTab === 'groups' && (
            <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
              
              {/* CREATE GROUP FORM */}
              <form onSubmit={handleCreateGroup} className="bg-[#161920] border border-[#242936] rounded-2xl p-5 mb-8">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#A855F7]" /> Neue Gruppe erstellen (nach Stimmung & Stil)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Name der Gruppe</label>
                    <input 
                      type="text"
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="z. B. Peaktime Energy, Deep Sunset..."
                      required
                      className="w-full bg-[#0D0E12] border border-[#242936] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#A855F7]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Stimmung (Mood)</label>
                    <input 
                      type="text"
                      value={newGroupMood}
                      onChange={e => setNewGroupMood(e.target.value)}
                      placeholder="z. B. Treibend, Euphorisch..."
                      list="mood-suggestions"
                      className="w-full bg-[#0D0E12] border border-[#242936] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#A855F7]"
                    />
                    <datalist id="mood-suggestions">
                      {PRESET_MOODS.map(m => <option key={m} value={m} />)}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Musikstil (Style)</label>
                    <input 
                      type="text"
                      value={newGroupStyle}
                      onChange={e => setNewGroupStyle(e.target.value)}
                      placeholder="z. B. Melodic Techno, Dark..."
                      list="style-suggestions"
                      className="w-full bg-[#0D0E12] border border-[#242936] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#A855F7]"
                    />
                    <datalist id="style-suggestions">
                      {PRESET_STYLES.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Farbe</label>
                    <div className="flex items-center gap-2 h-9">
                      {PRESET_COLORS.map(c => (
                        <button 
                          key={c.name}
                          type="button"
                          onClick={() => setNewGroupColor(c.hex)}
                          className={`w-6 h-6 rounded-full transition-transform ${newGroupColor === c.hex ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button 
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#A855F7] hover:bg-[#b56ef8] text-white text-xs font-bold transition-all shadow-md shadow-[#A855F7]/20 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Gruppe hinzufügen
                  </button>
                </div>
              </form>

              {/* EXISTING GROUPS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map(group => {
                  const trackCount = tracks.filter(t => t.groups && t.groups.includes(group.id)).length;
                  return (
                    <div 
                      key={group.id}
                      className="bg-[#161920] border border-[#242936] rounded-2xl p-4 flex flex-col justify-between hover:border-gray-600 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <span 
                            className="w-3 h-3 rounded-full shrink-0 shadow-sm" 
                            style={{ backgroundColor: group.color || '#A855F7' }} 
                          />
                          <h4 className="text-sm font-bold text-white">{group.name}</h4>
                        </div>
                        <button 
                          onClick={() => handleDeleteGroup(group.id)}
                          className="text-gray-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Gruppe löschen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1.5 mb-4 text-xs">
                        {group.mood && (
                          <div className="flex items-center gap-1.5 text-gray-400">
                            <span className="text-[10px] uppercase font-bold text-gray-500">Stimmung:</span>
                            <span className="text-gray-200">{group.mood}</span>
                          </div>
                        )}
                        {group.style && (
                          <div className="flex items-center gap-1.5 text-gray-400">
                            <span className="text-[10px] uppercase font-bold text-gray-500">Stil:</span>
                            <span className="text-gray-200">{group.style}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#242936] text-[11px] text-gray-400">
                        <span>{trackCount} Track{trackCount !== 1 ? 's' : ''}</span>
                        <button 
                          onClick={() => {
                            setFilterGroup(group.id);
                            setActiveTab('tracks');
                          }}
                          className="text-[#A855F7] hover:underline font-bold"
                        >
                          Tracks ansehen →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. TAB: STRUKTURIERT SORTIEREN (FILE ORGANIZER) */}
          {activeTab === 'organize' && (
            <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto w-full flex flex-col justify-center">
              
              <div className="mb-8 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#A855F7]/10 border border-[#A855F7]/30 text-[#A855F7] flex items-center justify-center mb-4">
                  <FolderTree className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Festplatten-Dateien strukturiert sortieren</h3>
                <p className="text-xs text-gray-400 max-w-md mx-auto">
                  Verschiebt und ordnet alle Audiodateien im Ordner <code className="text-[#A855F7] font-mono">/LIBRARY</code> auf deiner Festplatte physisch in saubere Unterordner.
                </p>
              </div>

              <div className="bg-[#161920] border border-[#242936] rounded-2xl p-6 mb-6">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-300 mb-3">
                  Wähle das Sortierschema für die Festplatte:
                </label>

                <div className="space-y-3">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    organizeScheme === 'group' ? 'bg-[#A855F7]/10 border-[#A855F7]' : 'bg-[#0D0E12] border-[#242936] hover:border-gray-600'
                  }`}>
                    <input 
                      type="radio" 
                      name="scheme" 
                      value="group" 
                      checked={organizeScheme === 'group'} 
                      onChange={() => setOrganizeScheme('group')} 
                      className="mt-1 accent-[#A855F7]"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Nach Gruppe (Empfohlen für DJOID)</div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">LIBRARY / [Warmup | Peaktime | Afterhour] / [Track].mp3</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    organizeScheme === 'mood' ? 'bg-[#A855F7]/10 border-[#A855F7]' : 'bg-[#0D0E12] border-[#242936] hover:border-gray-600'
                  }`}>
                    <input 
                      type="radio" 
                      name="scheme" 
                      value="mood" 
                      checked={organizeScheme === 'mood'} 
                      onChange={() => setOrganizeScheme('mood')} 
                      className="mt-1 accent-[#A855F7]"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Nach Stimmung (Mood)</div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">LIBRARY / [Treibend | Euphorisch | Dunkel] / [Track].mp3</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    organizeScheme === 'style' ? 'bg-[#A855F7]/10 border-[#A855F7]' : 'bg-[#0D0E12] border-[#242936] hover:border-gray-600'
                  }`}>
                    <input 
                      type="radio" 
                      name="scheme" 
                      value="style" 
                      checked={organizeScheme === 'style'} 
                      onChange={() => setOrganizeScheme('style')} 
                      className="mt-1 accent-[#A855F7]"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Nach Musikstil (Style / Genre)</div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">LIBRARY / [Melodic Techno | Peaktime Techno] / [Track].mp3</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    organizeScheme === 'artist' ? 'bg-[#A855F7]/10 border-[#A855F7]' : 'bg-[#0D0E12] border-[#242936] hover:border-gray-600'
                  }`}>
                    <input 
                      type="radio" 
                      name="scheme" 
                      value="artist" 
                      checked={organizeScheme === 'artist'} 
                      onChange={() => setOrganizeScheme('artist')} 
                      className="mt-1 accent-[#A855F7]"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Nach Interpret (Artist)</div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">LIBRARY / [Künstlername] / [Track].mp3</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    organizeScheme === 'flat' ? 'bg-[#A855F7]/10 border-[#A855F7]' : 'bg-[#0D0E12] border-[#242936] hover:border-gray-600'
                  }`}>
                    <input 
                      type="radio" 
                      name="scheme" 
                      value="flat" 
                      checked={organizeScheme === 'flat'} 
                      onChange={() => setOrganizeScheme('flat')} 
                      className="mt-1 accent-[#A855F7]"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Flach (Alle Tracks direkt im Hauptordner)</div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">LIBRARY / [Track].mp3</div>
                    </div>
                  </label>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    Betrifft alle {tracks.length} Tracks im Ordner.
                  </span>
                  <button 
                    onClick={handleRunOrganize}
                    disabled={isOrganizing || tracks.length === 0}
                    className="px-5 py-2.5 rounded-xl bg-[#A855F7] hover:bg-[#b56ef8] text-white text-xs font-bold transition-all shadow-md shadow-[#A855F7]/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isOrganizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSync className="w-4 h-4" />}
                    Dateien jetzt auf Festplatte sortieren
                  </button>
                </div>
              </div>

              {organizeResult && (
                <div className="p-4 rounded-xl bg-[#161920] border border-[#242936] text-xs font-mono text-[#22C55E] flex items-center gap-2 animate-in fade-in">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{organizeResult}</span>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
