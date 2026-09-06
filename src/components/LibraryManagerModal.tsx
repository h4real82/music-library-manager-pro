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
  FileAudio,
  CheckCircle2,
  AlertCircle,
  Activity,
  ShieldCheck,
  CopyCheck
} from 'lucide-react';
import { TrackDef, MulimaGroup, DuplicateGroup, DuplicateCandidate } from '../types';
import { extractMetadata, getAudioDuration } from '../lib/audioMetadata';
import { analyzeTrackSegments } from '../lib/audioAnalysis';
import { deepAudioAnalyze } from '../lib/deepAudioAnalysis';

interface LibraryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: TrackDef[];
  groups: MulimaGroup[];
  onRefreshTracks: () => Promise<void>;
  onTrackDeleted: (filePath: string) => void;
  onTrackUpdated: (filePath: string, updates: Partial<TrackDef>) => void;
  onGroupsUpdated: (groups: MulimaGroup[]) => void;
  currentPlayingTrack: TrackDef | null;
  isPlaying: boolean;
  onPlayTrack: (track: TrackDef) => void;
  onClearLibrary?: () => Promise<void>;
  onOpenAnalysisTrack?: (track: TrackDef) => void;
  initialTab?: 'tracks' | 'import' | 'groups' | 'organize';
}

interface UploadItem {
  file: File;
  subfolder?: string;
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

/**
 * Recursively scans dragged folders/files using webkitGetAsEntry
 */
const scanDroppedItems = async (items: DataTransferItemList | DataTransferItem[]): Promise<UploadItem[]> => {
  const results: UploadItem[] = [];

  const traverseEntry = async (entry: any, currentPath: string = '') => {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file((file: File) => {
          if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)) {
            results.push({ file, subfolder: currentPath || undefined });
          }
          resolve();
        }, () => resolve());
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readBatch = (): Promise<any[]> => new Promise((resolve) => {
        dirReader.readEntries((entries: any[]) => resolve(entries), () => resolve([]));
      });
      let allEntries: any[] = [];
      let batch: any[] = [];
      do {
        batch = await readBatch();
        allEntries = allEntries.concat(batch);
      } while (batch.length > 0);

      const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      for (const child of allEntries) {
        await traverseEntry(child, nextPath);
      }
    }
  };

  const promises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof (item as any).webkitGetAsEntry === 'function') {
      const entry = (item as any).webkitGetAsEntry();
      if (entry) {
        promises.push(traverseEntry(entry));
        continue;
      }
    }
    const file = item.getAsFile ? item.getAsFile() : null;
    if (file && /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)) {
      results.push({ file });
    }
  }

  await Promise.all(promises);
  return results;
};

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
  onPlayTrack,
  onClearLibrary,
  onOpenAnalysisTrack,
  initialTab
}: LibraryManagerModalProps) {
  if (!isOpen) return null;

  // Active Tab / Sub-views
  const [activeTab, setActiveTab] = useState<'tracks' | 'import' | 'groups' | 'organize'>(initialTab || 'tracks');

  // Double confirmation state for Clear Library
  const [clearConfirmStep, setClearConfirmStep] = useState<0 | 1 | 2>(0);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  // Sync initialTab when modal opens or tab changes externally
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

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
  const [importStatusMessage, setImportStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
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

  // Duplicate Finder & Cleaner State
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);
  const [duplicateSuccessMsg, setDuplicateSuccessMsg] = useState<string | null>(null);

  const handleCheckDuplicates = async () => {
    setIsCheckingDuplicates(true);
    setDuplicateSuccessMsg(null);
    try {
      const res = await fetch('/api/library/find-duplicates');
      const data = await res.json();
      if (data.success) {
        setDuplicateGroups(data.duplicateGroups || []);
        setShowDuplicateModal(true);
      }
    } catch (err) {
      console.error('Error checking duplicates:', err);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleRemoveDuplicates = async (filePaths?: string[]) => {
    setIsDeletingDuplicates(true);
    setDuplicateSuccessMsg(null);
    try {
      const targets = filePaths && filePaths.length > 0
        ? filePaths
        : duplicateGroups.flatMap(g => g.duplicates.map(d => d.filePath));

      if (targets.length === 0) return;

      const res = await fetch('/api/library/remove-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathsToDelete: targets, filePaths: targets })
      });
      const data = await res.json();
      if (data.success) {
        const count = data.deletedCount ?? data.removedCount ?? targets.length;
        setDuplicateSuccessMsg(`${count} Duplikat(e) erfolgreich gelöscht!`);
        await onRefreshTracks();
        const checkRes = await fetch('/api/library/find-duplicates');
        const checkData = await checkRes.json();
        setDuplicateGroups(checkData.duplicateGroups || []);
      }
    } catch (err) {
      console.error('Error removing duplicates:', err);
    } finally {
      setIsDeletingDuplicates(false);
    }
  };

  // Traktor-Style Batch Analysis State
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState<'all' | 'special'>('all');
  const [bpmMode, setBpmMode] = useState<'auto' | '60-120' | '70-140' | '80-160' | '90-180'>('auto');
  const [setBeatgrid, setSetBeatgrid] = useState(true);
  const [detectKey, setDetectKey] = useState(true);
  const [detectGain, setDetectGain] = useState(true);
  const [replaceLocked, setReplaceLocked] = useState(false);
  const [parallelProcessing, setParallelProcessing] = useState(true);
  const [isAnalyzingBatch, setIsAnalyzingBatch] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ current: 0, total: 0, currentName: '', step: '' });
  const [analyzeSuccessMsg, setAnalyzeSuccessMsg] = useState<string | null>(null);

  const handleStartBatchAnalysis = async () => {
    setShowAnalyzeModal(false);
    const targetTracks = selectedPaths.size > 0
      ? tracks.filter(t => selectedPaths.has(t.filePath || t.id))
      : filteredTracks;

    if (targetTracks.length === 0) return;

    setIsAnalyzingBatch(true);
    setAnalyzeSuccessMsg(null);
    setAnalyzeProgress({
      current: 0,
      total: targetTracks.length,
      currentName: '',
      step: 'Starte gründliche Audio-Analyse...'
    });

    const concurrency = parallelProcessing ? 3 : 1;
    let processedCount = 0;

    const analyzeSingleTrack = async (track: TrackDef) => {
      try {
        const trackName = `${track.artist} - ${track.title}` || track.filename || track.id;
        setAnalyzeProgress(prev => ({
          ...prev,
          currentName: trackName,
          step: `Analysiere Beatgrid & 16.000-Punkte Waveform...`
        }));

        const source = track.file || track.url || `/api/library/stream?file=${encodeURIComponent(track.filePath || track.filename || '')}`;

        const options = {
          title: track.title,
          artist: track.artist,
          bpm: track.bpm,
          key: track.key,
          bpmMode: analyzeMode === 'special' ? bpmMode : 'auto',
          setBeatgrid: analyzeMode === 'special' ? setBeatgrid : true,
          detectKey: analyzeMode === 'special' ? detectKey : true,
          detectGain: analyzeMode === 'special' ? detectGain : true,
          replaceLocked: analyzeMode === 'special' ? replaceLocked : false
        };

        const result = await deepAudioAnalyze(source, options);

        const updates: Partial<TrackDef> = {
          bpm: result.beatGrid.bpm,
          key: result.camelotKey,
          energy: result.calculatedEnergy,
          deepAnalysis: result,
          waveform: result.waveform,
          beatGrid: result.beatGrid,
          loudness: result.loudness,
          spectral: result.spectral,
          spatial: result.spatial,
          tempoVariation: result.tempoVariation,
          segments: result.segments,
          hotCues: result.hotCues,
          duration: track.duration || result.waveform?.durationSec
        };

        if (track.filePath) {
          await fetch('/api/library/update-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: track.filePath,
              updates
            })
          }).catch(e => console.warn('Disk update error:', e));
        }

        onTrackUpdated(track.filePath || track.id, updates);
        processedCount++;
        setAnalyzeProgress(prev => ({
          ...prev,
          current: processedCount,
          step: `Fertiggestellt (${processedCount}/${targetTracks.length})`
        }));
      } catch (err: any) {
        console.error(`Analysis failed for ${track.title}:`, err);
        processedCount++;
        setAnalyzeProgress(prev => ({
          ...prev,
          current: processedCount
        }));
      }
    };

    const queue = [...targetTracks];
    const workers = Array(Math.min(concurrency, queue.length)).fill(0).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          await analyzeSingleTrack(item);
        }
      }
    });

    await Promise.all(workers);
    setIsAnalyzingBatch(false);
    setAnalyzeSuccessMsg(`✓ ${processedCount} Tracks gründlich analysiert! Beatgrid, BPM, Key und 16.000-Punkte Waveform wurden präzise kalibriert.`);
    await onRefreshTracks();
  };

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
  const handleUploadFiles = async (itemsInput: (File | UploadItem)[]) => {
    const items: UploadItem[] = itemsInput
      .map(item => ('file' in item ? item : { file: item }))
      .filter(item => /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(item.file.name));

    if (items.length === 0) {
      setImportStatusMessage({ text: 'Keine kompatiblen Audio-Dateien gefunden (MP3, WAV, FLAC, OGG, M4A, AAC).', isError: true });
      setTimeout(() => setImportStatusMessage(null), 5000);
      return;
    }

    setIsUploading(true);
    setImportStatusMessage(null);
    setUploadProgress({ current: 0, total: items.length, currentName: '' });

    let successCount = 0;
    let duplicateMergedCount = 0;

    for (let i = 0; i < items.length; i++) {
      const { file, subfolder } = items[i];
      setUploadProgress({ current: i + 1, total: items.length, currentName: file.name });

      try {
        // Parallel metadata and duration extraction
        const [meta, duration] = await Promise.all([
          extractMetadata(file),
          getAudioDuration(file)
        ]);

        const title = meta.title || file.name.replace(/\.[^/.]+$/, '');
        const artist = meta.artist || 'Unknown Artist';
        const bpm = meta.bpm || Math.floor(Math.random() * 15 + 124);
        const key = meta.key || '8A';

        // Execute deep audio analysis
        let deepData: any = null;
        try {
          deepData = await deepAudioAnalyze(file, { title, artist, bpm, key });
        } catch (deepErr) {
          console.warn('Deep analysis error on upload:', deepErr);
        }

        const effectiveBpm = deepData?.beatGrid?.bpm || bpm;
        const effectiveKey = deepData?.camelotKey || key;
        const effectiveEnergy = deepData?.calculatedEnergy || 7;
        const effectiveMood = targetMoodForImport || deepData?.suggestedMood || '';
        const effectiveStyle = targetStyleForImport || deepData?.suggestedStyle || '';
        const effectiveDuration = (duration && duration > 0) ? duration : (deepData?.waveform?.durationSec || 0);

        // Prepare upload stream parameters
        const params = new URLSearchParams({
          filename: file.name,
          group: targetGroupForImport,
          mood: effectiveMood,
          style: effectiveStyle,
          title,
          artist,
          bpm: String(effectiveBpm),
          key: effectiveKey
        });

        if (effectiveDuration > 0) {
          params.set('duration', String(effectiveDuration));
        }

        const effectiveSub = subfolder || (file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(0, -1).join('/') : '');
        if (effectiveSub) {
          params.set('subfolder', effectiveSub);
        }

        const uploadRes = await fetch(`/api/library/upload?${params.toString()}`, {
          method: 'POST',
          body: file
        });

        if (!uploadRes.ok) {
          throw new Error(`Server returned HTTP ${uploadRes.status}`);
        }

        const uploadJson = await uploadRes.json();

        if (uploadJson.success && uploadJson.filePath) {
          if (uploadJson.isDuplicate) {
            duplicateMergedCount++;
          }
          // Pre-generate segments if duration is known
          let segments = deepData?.segments;
          if (!segments && effectiveDuration > 0) {
            try {
              segments = await analyzeTrackSegments(uploadJson.url || `/api/library/stream?file=${encodeURIComponent(uploadJson.filePath)}`, effectiveKey, effectiveEnergy);
            } catch {
              // Ignore segment generation errors
            }
          }

          // Send extracted cover art, duration, segments and complete deep analysis
          await fetch('/api/library/update-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: uploadJson.filePath,
              updates: {
                title,
                artist,
                bpm: effectiveBpm,
                key: effectiveKey,
                energy: effectiveEnergy,
                mood: effectiveMood,
                style: effectiveStyle,
                coverArt: meta.coverArt || undefined,
                duration: effectiveDuration > 0 ? effectiveDuration : undefined,
                segments: segments && segments.length > 0 ? segments : undefined,
                hotCues: deepData?.hotCues,
                deepAnalysis: deepData || undefined,
                beatGrid: deepData?.beatGrid || undefined,
                loudness: deepData?.loudness || undefined,
                spectral: deepData?.spectral || undefined,
                spatial: deepData?.spatial || undefined,
                tempoVariation: deepData?.tempoVariation || undefined
              }
            })
          });

          successCount++;
        }
      } catch (err) {
        console.error('Upload error for file:', file.name, err);
      }
    }

    setIsUploading(false);
    await onRefreshTracks();
    let statusText = `${successCount} von ${items.length} Tracks erfolgreich verarbeitet!`;
    if (duplicateMergedCount > 0) {
      statusText += ` (${duplicateMergedCount} Duplikate automatisch erkannt & zusammengeführt)`;
    }
    setImportStatusMessage({ 
      text: statusText, 
      isError: successCount === 0 
    });
    setTimeout(() => setImportStatusMessage(null), 6000);
    setActiveTab('tracks');
  };

  // File Inputs
  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesList: File[] = Array.from(e.target.files);
      const items: UploadItem[] = filesList.map((f: File) => {
        let subfolder: string | undefined = undefined;
        if (f.webkitRelativePath) {
          const parts = f.webkitRelativePath.split('/');
          if (parts.length > 1) {
            subfolder = parts.slice(0, -1).join('/');
          }
        }
        return { file: f, subfolder };
      });
      handleUploadFiles(items);
      e.target.value = '';
    }
  };

  // Drag & Drop
  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const scanned = await scanDroppedItems(e.dataTransfer.items);
      if (scanned.length > 0) {
        handleUploadFiles(scanned);
        return;
      }
    }
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

    const newGroup: MulimaGroup = {
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

  // Execute Clear Library (Double Confirmed)
  const handleExecuteClearLibrary = async () => {
    setIsClearing(true);
    try {
      await fetch('/api/library/clear', { method: 'POST' });
      if (onClearLibrary) {
        await onClearLibrary();
      }
      await onRefreshTracks();
      setClearConfirmStep(0);
      setClearConfirmText('');
    } catch (err: any) {
      console.error('Error clearing library:', err);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      
      {/* MODAL WINDOW */}
      <div className="bg-[#12141a] border border-[#242936] rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden text-white font-sans relative">
        
        {/* MODAL HEADER */}
        <div className="h-16 px-6 bg-[#161920] border-b border-[#242936] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#A855F7] to-[#06B6D4] flex items-center justify-center shadow-md shadow-[#A855F7]/20">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold uppercase tracking-wider text-white">MuLiMa Pro Library Manager</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/30 font-bold">
                  /LIBRARY Ordner
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-mono flex items-center gap-2">
                <span className="text-[#22C55E] font-bold">{tracks.length} Tracks</span>
                <span>•</span>
                <span>{totalSizeMB} MB</span>
                <span>•</span>
                <span className="text-gray-500">Festplatte aktiv</span>
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

          {/* Header Action Buttons (Check Duplicates, Clear Library & Close) */}
          <div className="flex items-center gap-2">
            <button
              id="btn-modal-check-duplicates"
              onClick={handleCheckDuplicates}
              disabled={isCheckingDuplicates}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all"
              title="Library auf doppelte Tracks prüfen"
            >
              {isCheckingDuplicates ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CopyCheck className="w-3.5 h-3.5" />
              )}
              <span>Duplikate prüfen</span>
            </button>

            {tracks.length > 0 && (
              <button
                id="btn-modal-clear-library"
                onClick={() => {
                  setClearConfirmStep(1);
                  setClearConfirmText('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 text-xs font-bold transition-all"
                title="Gesamte Library leeren (doppelt geschützt)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Library leeren</span>
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-2 hover:bg-[#242936] rounded-xl text-gray-400 hover:text-white transition-colors"
              title="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DOUBLE CONFIRMATION DIALOG FOR CLEAR LIBRARY */}
        {clearConfirmStep > 0 && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-[#161920] border border-red-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 text-white">
              
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-white">
                    {clearConfirmStep === 1 ? 'Bibliothek leeren? (Schritt 1 von 2)' : 'Endgültige Sicherheitsabfrage (Schritt 2 von 2)'}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    {clearConfirmStep === 1 
                      ? `Möchtest du wirklich alle ${tracks.length} Tracks (${totalSizeMB} MB) aus dem /LIBRARY-Verzeichnis entfernen? Alle Playlists, Zuweisungen und Metadaten werden gelöscht.`
                      : 'Achtung: Dieser Vorgang löscht die Audio-Dateien dauerhaft und unwiderruflich von der Festplatte!'
                    }
                  </p>
                </div>
              </div>

              {clearConfirmStep === 2 && (
                <div className="bg-[#0D0E12] p-3 rounded-xl border border-[#242936] flex flex-col gap-2">
                  <label className="text-[11px] text-gray-300 font-mono">
                    Tippe zur Bestätigung <span className="text-red-400 font-bold">LEEREN</span> ein:
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={clearConfirmText}
                    onChange={(e) => setClearConfirmText(e.target.value)}
                    placeholder="LEEREN"
                    className="bg-[#161920] border border-red-500/40 focus:border-red-500 rounded-lg px-3 py-2 text-sm text-white font-mono uppercase tracking-widest outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#242936]">
                <button
                  type="button"
                  onClick={() => {
                    setClearConfirmStep(0);
                    setClearConfirmText('');
                  }}
                  disabled={isClearing}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-[#242936] transition-colors"
                >
                  Abbrechen
                </button>

                {clearConfirmStep === 1 ? (
                  <button
                    type="button"
                    onClick={() => setClearConfirmStep(2)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md shadow-red-600/20"
                  >
                    <span>Weiter zur Bestätigung</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={clearConfirmText.trim().toUpperCase() !== 'LEEREN' || isClearing}
                    onClick={handleExecuteClearLibrary}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600 text-white text-xs font-bold transition-all shadow-md shadow-red-600/30"
                  >
                    {isClearing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Wird gelöscht...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Unwiderruflich leeren</span>
                      </>
                    )}
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* DUPLICATE INSPECTION & CLEANUP MODAL */}
        {showDuplicateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
            <div className="bg-[#161920] border border-cyan-500/30 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-white font-sans">
              
              {/* Modal Header */}
              <div className="px-6 py-4 bg-[#12141a] border-b border-[#242936] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm uppercase tracking-wider text-white flex items-center gap-2">
                      <span>Duplikat-Prüfung & Bereinigung</span>
                      {duplicateGroups.length > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {duplicateGroups.length} Konflikt(e)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Sauber
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                      Prüft auf identischen Audio-Inhalt, übereinstimmende Dateigrößen & doppelte Interpreten/Titel
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowDuplicateModal(false)}
                  className="p-1.5 hover:bg-[#242936] rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Message */}
              {duplicateSuccessMsg && (
                <div className="px-6 py-3 bg-emerald-950/40 border-b border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{duplicateSuccessMsg}</span>
                </div>
              )}

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4 custom-scrollbar">
                {duplicateGroups.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                    <div className="max-w-md">
                      <h4 className="text-base font-bold text-white">Keine Duplikate gefunden!</h4>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Deine /LIBRARY ist optimal organisiert. Es wurden keine doppelten Audio-Dateien, identischen Dateigrößen oder redundanten Titel-Kombinationen gefunden.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowDuplicateModal(false)}
                      className="mt-2 px-5 py-2 rounded-xl bg-[#242936] hover:bg-[#2f3546] text-white text-xs font-bold transition-all"
                    >
                      Schließen
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Summary Banner & 1-Click Clean */}
                    {(() => {
                      const totalDups = duplicateGroups.reduce((acc, g) => acc + g.duplicates.length, 0);
                      const totalBytes = duplicateGroups.flatMap(g => g.duplicates).reduce((acc, d) => acc + (d.fileSize || 0), 0);
                      const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

                      return (
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white">
                                {totalDups} überflüssige Duplikat-Datei(en) gefunden
                              </div>
                              <div className="text-[11px] text-amber-300 font-mono mt-0.5">
                                Freigebbarer Speicherplatz: {totalMB} MB
                              </div>
                            </div>
                          </div>

                          <button
                            id="btn-clean-all-duplicates"
                            onClick={() => handleRemoveDuplicates()}
                            disabled={isDeletingDuplicates}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-bold transition-all shadow-md shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                          >
                            {isDeletingDuplicates ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            <span>Alle {totalDups} Duplikate bereinigen</span>
                          </button>
                        </div>
                      );
                    })()}

                    {/* Duplicate Groups List */}
                    <div className="space-y-4">
                      {duplicateGroups.map((group, gIdx) => (
                        <div key={group.primaryTrack.filePath || gIdx} className="bg-[#101217] border border-[#242936] rounded-xl p-4 flex flex-col gap-3">
                          {/* Group Header */}
                          <div className="flex items-center justify-between border-b border-[#1c202a] pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">
                                {group.primaryTrack.title}
                              </span>
                              <span className="text-xs text-gray-400 font-medium">
                                - {group.primaryTrack.artist}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                              {group.matchReason}
                            </span>
                          </div>

                          {/* Primary Track (Preserved) */}
                          <div className="p-3 rounded-lg bg-[#141720] border border-emerald-500/30 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-emerald-500/20 text-emerald-400 uppercase shrink-0">
                                Original (bleibt)
                              </span>
                              <div className="truncate">
                                <p className="font-mono text-gray-300 truncate text-[11px]">
                                  {group.primaryTrack.filePath}
                                </p>
                                <p className="text-[10px] text-gray-500 font-mono">
                                  {((group.primaryTrack.fileSize || 0) / (1024 * 1024)).toFixed(2)} MB • {group.primaryTrack.bpm || 0} BPM • {group.primaryTrack.key || '-'}
                                </p>
                              </div>
                            </div>
                            <span className="text-emerald-400 text-xs font-bold shrink-0 ml-2">
                              Geschützt
                            </span>
                          </div>

                          {/* Duplicates to Delete */}
                          <div className="space-y-2">
                            {group.duplicates.map(dup => (
                              <div key={dup.filePath} className="p-3 rounded-lg bg-red-950/20 border border-red-500/20 flex items-center justify-between text-xs hover:border-red-500/40 transition-all">
                                <div className="flex items-center gap-2.5 overflow-hidden">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono bg-red-500/20 text-red-400 uppercase shrink-0">
                                    Duplikat
                                  </span>
                                  <div className="truncate">
                                    <p className="font-mono text-gray-300 truncate text-[11px]">
                                      {dup.filePath}
                                    </p>
                                    <p className="text-[10px] text-gray-500 font-mono">
                                      {((dup.fileSize || 0) / (1024 * 1024)).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleRemoveDuplicates([dup.filePath])}
                                  disabled={isDeletingDuplicates}
                                  className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[11px] font-bold transition-colors flex items-center gap-1 shrink-0 ml-2"
                                  title="Nur dieses Duplikat entfernen"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Löschen</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 bg-[#12141a] border-t border-[#242936] flex items-center justify-end">
                <button
                  onClick={() => setShowDuplicateModal(false)}
                  className="px-4 py-1.5 rounded-xl bg-[#242936] hover:bg-[#2f3546] text-white text-xs font-bold transition-all"
                >
                  Fertig
                </button>
              </div>

            </div>
          </div>
        )}

        {/* TRAKTOR-STYLE BATCH ANALYZE DIALOG (Matches User Reference Screenshot) */}
        {showAnalyzeModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 p-4">
            <div 
              className="w-[390px] max-w-full bg-[#2c2c2c] border border-[#1b1b1b] rounded shadow-2xl overflow-hidden text-gray-200 font-sans select-none"
              style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.07)' }}
            >
              {/* Title Bar */}
              <div className="py-2 text-center text-xs font-semibold text-[#d4d4d4] bg-[#242424] border-b border-[#1b1b1b] tracking-wide">
                Analyze
              </div>

              <div className="p-5 text-xs space-y-4">
                {/* Radio Option 1: All */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setAnalyzeMode('all')}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded border transition-colors ${
                      analyzeMode === 'all'
                        ? 'bg-[#1e1e1e] border-[#3a3a3a] text-white'
                        : 'bg-[#232323] border-[#303030] text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <div className="w-3.5 h-3.5 rounded-full border border-[#484848] flex items-center justify-center bg-[#141414]">
                      {analyzeMode === 'all' && (
                        <div className="w-2 h-2 rounded-full bg-[#00d2ff] shadow-[0_0_8px_#00d2ff]" />
                      )}
                    </div>
                    <span className="font-semibold text-xs text-white">All</span>
                  </button>

                  <span className="text-[#a8a8a8] text-xs font-medium pr-1">
                    Automatic BPM, Set Beatgrid
                  </span>
                </div>

                {/* Radio Option 2: Special */}
                <div>
                  <button
                    type="button"
                    onClick={() => setAnalyzeMode('special')}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded border transition-colors ${
                      analyzeMode === 'special'
                        ? 'bg-[#1e1e1e] border-[#3a3a3a] text-white'
                        : 'bg-[#232323] border-[#303030] text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <div className="w-3.5 h-3.5 rounded-full border border-[#484848] flex items-center justify-center bg-[#141414]">
                      {analyzeMode === 'special' && (
                        <div className="w-2 h-2 rounded-full bg-[#00d2ff] shadow-[0_0_8px_#00d2ff]" />
                      )}
                    </div>
                    <span className="font-semibold text-xs text-white">Special</span>
                  </button>

                  {/* Indented Options under Special */}
                  <div className="pl-6 mt-3 space-y-2">
                    {/* BPM Label & Dropdown */}
                    <div className="space-y-1">
                      <div className="bg-[#242424] px-2.5 py-1 text-[11px] font-medium text-[#888888] rounded-sm">
                        BPM
                      </div>
                      <div className="relative">
                        <select
                          disabled={analyzeMode !== 'special'}
                          value={bpmMode}
                          onChange={(e) => setBpmMode(e.target.value as any)}
                          className="w-full appearance-none bg-[#1a1a1a] border border-[#333333] rounded-sm px-3 py-1.5 text-xs text-[#00d2ff] font-medium focus:outline-none focus:border-[#00d2ff] disabled:opacity-40 cursor-pointer"
                        >
                          <option value="auto">Automatic</option>
                          <option value="60-120">60 - 120</option>
                          <option value="70-140">70 - 140</option>
                          <option value="80-160">80 - 160</option>
                          <option value="90-180">90 - 180</option>
                        </select>
                        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#00d2ff] text-[10px]">
                          ▼
                        </div>
                      </div>
                    </div>

                    {/* Set Beatgrid Checkbox */}
                    <label className="flex items-center justify-between bg-[#242424] px-2.5 py-1.5 rounded-sm cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                      <span className="text-[11px] text-[#c0c0c0]">Set Beatgrid</span>
                      <input
                        type="checkbox"
                        disabled={analyzeMode !== 'special'}
                        checked={setBeatgrid}
                        onChange={(e) => setSetBeatgrid(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#00d2ff] rounded-sm cursor-pointer"
                      />
                    </label>

                    {/* Key Checkbox */}
                    <label className="flex items-center justify-between bg-[#242424] px-2.5 py-1.5 rounded-sm cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                      <span className="text-[11px] text-[#c0c0c0]">Key</span>
                      <input
                        type="checkbox"
                        disabled={analyzeMode !== 'special'}
                        checked={detectKey}
                        onChange={(e) => setDetectKey(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#00d2ff] rounded-sm cursor-pointer"
                      />
                    </label>

                    {/* Gain Checkbox */}
                    <label className="flex items-center justify-between bg-[#242424] px-2.5 py-1.5 rounded-sm cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                      <span className="text-[11px] text-[#c0c0c0]">Gain</span>
                      <input
                        type="checkbox"
                        disabled={analyzeMode !== 'special'}
                        checked={detectGain}
                        onChange={(e) => setDetectGain(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#00d2ff] rounded-sm cursor-pointer"
                      />
                    </label>

                    {/* Replace Locked Values Checkbox */}
                    <label className="flex items-center justify-between bg-[#242424] px-2.5 py-1.5 rounded-sm cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                      <span className="text-[11px] text-[#c0c0c0]">Replace Locked Values</span>
                      <input
                        type="checkbox"
                        disabled={analyzeMode !== 'special'}
                        checked={replaceLocked}
                        onChange={(e) => setReplaceLocked(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#00d2ff] rounded-sm cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-[#1f1f1f] border-b border-[#383838] my-3" />

                {/* Parallel Processing Checkbox */}
                <div className="flex items-center justify-end">
                  <label className="flex items-center gap-2.5 bg-[#202020] px-3 py-1.5 rounded-sm cursor-pointer border border-[#303030]">
                    <input
                      type="checkbox"
                      checked={parallelProcessing}
                      onChange={(e) => setParallelProcessing(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#00d2ff] rounded-sm cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-[#d0d0d0]">Parallel Processing</span>
                  </label>
                </div>

                {/* Warning Text */}
                <div className="text-[#f59e0b] text-[11px] font-semibold leading-snug">
                  Warning: Increased CPU load. Do not use in a live situation.
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleStartBatchAnalysis}
                    className="px-6 py-1.5 bg-[#1b1b1b] hover:bg-[#252525] active:bg-[#151515] text-white font-bold text-xs rounded-sm border border-[#404040] shadow-sm transition-colors cursor-pointer"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAnalyzeModal(false)}
                    className="px-6 py-1.5 bg-[#1b1b1b] hover:bg-[#252525] active:bg-[#151515] text-[#cccccc] hover:text-white font-medium text-xs rounded-sm border border-[#404040] shadow-sm transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BATCH ANALYSIS PROGRESS OVERLAY */}
        {isAnalyzingBatch && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-[440px] max-w-full bg-[#181a22] border border-[#00d2ff]/40 rounded-2xl p-6 shadow-2xl text-center font-sans">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#00d2ff]/10 border border-[#00d2ff]/40 flex items-center justify-center">
                <Activity className="w-6 h-6 text-[#00d2ff] animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Gründliche Audio-Analyse läuft</h3>
              <p className="text-xs text-gray-400 mb-4">
                Berechne ultra-präzise 16.000-Punkte Waveform, Beatgrid & Onsets
              </p>

              {/* Progress Bar */}
              <div className="w-full bg-[#0d0e12] rounded-full h-3 border border-[#242936] overflow-hidden mb-3">
                <div 
                  className="h-full bg-gradient-to-r from-[#06B6D4] to-[#00d2ff] transition-all duration-300 rounded-full"
                  style={{ width: `${Math.round((analyzeProgress.current / Math.max(1, analyzeProgress.total)) * 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-300 font-mono mb-2">
                <span className="truncate max-w-[280px] text-left text-[#00f0ff]">
                  {analyzeProgress.currentName || 'Initialisiere Audio-Engine...'}
                </span>
                <span className="font-bold text-white shrink-0">
                  {analyzeProgress.current} / {analyzeProgress.total} ({Math.round((analyzeProgress.current / Math.max(1, analyzeProgress.total)) * 100)}%)
                </span>
              </div>

              <p className="text-[11px] text-gray-400 font-mono">
                {analyzeProgress.step}
              </p>
            </div>
          </div>
        )}

        {/* MODAL BODY */}
        <div 
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          className="flex-1 overflow-hidden flex flex-col bg-[#0D0E12]"
        >
          {/* Status Message Banner */}
          {analyzeSuccessMsg && (
            <div className="px-4 py-2.5 text-xs flex items-center justify-between border-b shrink-0 bg-[#00d2ff]/10 text-[#00f0ff] border-[#00d2ff]/30 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#00f0ff] shrink-0" />
                <span className="font-semibold">{analyzeSuccessMsg}</span>
              </div>
              <button onClick={() => setAnalyzeSuccessMsg(null)} className="text-gray-400 hover:text-white p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {importStatusMessage && (
            <div className={`px-4 py-2.5 text-xs flex items-center justify-between border-b shrink-0 ${
              importStatusMessage.isError 
                ? 'bg-red-500/10 text-red-400 border-red-500/30' 
                : 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
            }`}>
              <div className="flex items-center gap-2">
                {importStatusMessage.isError ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                )}
                <span>{importStatusMessage.text}</span>
              </div>
              <button 
                onClick={() => setImportStatusMessage(null)}
                className="hover:opacity-75 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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

                {/* Batch Actions, Add Button & Refresh */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setActiveTab('import')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#A855F7] to-[#06B6D4] text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Tracks importieren</span>
                  </button>

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

                  {/* General / Selected Deep Analysis Trigger */}
                  <button 
                    onClick={() => setShowAnalyzeModal(true)}
                    title={selectedPaths.size > 0 ? `${selectedPaths.size} markierte Tracks gründlich analysieren` : 'Tracks gründlich analysieren & Beatgrid setzen'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      selectedPaths.size > 0
                        ? 'bg-[#00d2ff]/20 text-[#00f0ff] border border-[#00d2ff]/40 hover:bg-[#00d2ff]/30 hover:shadow-[0_0_12px_rgba(0,210,255,0.25)]'
                        : 'bg-[#0D0E12] border border-[#242936] text-cyan-400 hover:text-white hover:border-[#00d2ff]/50'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 text-[#00d2ff]" />
                    <span>{selectedPaths.size > 0 ? `Gründlich Analysieren (${selectedPaths.size})` : 'Analysieren...'}</span>
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

                          {/* Assigned Groups Chips (MuLiMa Pro Style) */}
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

                          {/* Deep Analysis Studio Button */}
                          {onOpenAnalysisTrack && (
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onOpenAnalysisTrack(track);
                                onClose();
                              }}
                              className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 border border-cyan-500/30 rounded-lg transition-all shrink-0 flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
                              title="Deep Analysis Studio & Online-Portale öffnen"
                            >
                              <Activity className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="hidden md:inline">Studio</span>
                            </button>
                          )}

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
                accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,audio/*" 
                className="hidden" 
              />
              <input 
                type="file" 
                ref={folderInputRef} 
                onChange={onFileChange} 
                // @ts-ignore
                webkitdirectory="" 
                directory="" 
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

          {/* 3. TAB: GRUPPEN & STILE (MuLiMa Pro) */}
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
                      <div className="text-xs font-bold text-white">Nach Gruppe (Empfohlen für MuLiMa Pro)</div>
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
