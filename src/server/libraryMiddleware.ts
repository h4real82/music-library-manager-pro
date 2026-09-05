import type { Connect } from 'vite';
import fs from 'fs';
import path from 'path';

export interface DjoidGroupData {
  id: string;
  name: string;
  mood?: string;
  style?: string;
  color?: string;
  createdAt?: number;
}

export interface LibraryMetaFile {
  groups: DjoidGroupData[];
  tracks: Record<string, any>;
}

const DEFAULT_GROUPS: DjoidGroupData[] = [
  { id: 'grp_warmup', name: 'Warmup', mood: 'Entspannt & Groovy', style: 'Deep House / Melodic', color: '#06B6D4', createdAt: Date.now() },
  { id: 'grp_peaktime', name: 'Peaktime', mood: 'Treibend & Euphorisch', style: 'Peaktime Techno', color: '#A855F7', createdAt: Date.now() },
  { id: 'grp_afterhour', name: 'Afterhour', mood: 'Hypnotisch & Minimal', style: 'Minimal / Deep Tech', color: '#F43F5E', createdAt: Date.now() },
  { id: 'grp_dark', name: 'Dark Techno', mood: 'Dunkel & Industriell', style: 'Hard / Industrial', color: '#22C55E', createdAt: Date.now() },
];

export function createLibraryMiddleware(rootDir: string): Connect.NextHandleFunction {
  const libraryDir = path.resolve(rootDir, 'LIBRARY');
  if (!fs.existsSync(libraryDir)) {
    fs.mkdirSync(libraryDir, { recursive: true });
  }

  const metaFilePath = path.join(libraryDir, '.djoid_library.json');

  function readMeta(): LibraryMetaFile {
    try {
      if (fs.existsSync(metaFilePath)) {
        const raw = fs.readFileSync(metaFilePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[LIBRARY] Error reading .djoid_library.json:', e);
    }
    const defaultMeta: LibraryMetaFile = {
      groups: DEFAULT_GROUPS,
      tracks: {}
    };
    saveMeta(defaultMeta);
    return defaultMeta;
  }

  function saveMeta(meta: LibraryMetaFile) {
    try {
      fs.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (e) {
      console.error('[LIBRARY] Error saving .djoid_library.json:', e);
    }
  }

  function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.mp3': return 'audio/mpeg';
      case '.wav': return 'audio/wav';
      case '.flac': return 'audio/flac';
      case '.ogg': return 'audio/ogg';
      case '.m4a':
      case '.aac': return 'audio/mp4';
      default: return 'application/octet-stream';
    }
  }

  function walkDirectory(dir: string, base: string = ''): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // ignore hidden files
      const fullPath = path.join(dir, entry.name);
      const relPath = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...walkDirectory(fullPath, relPath));
      } else if (entry.isFile()) {
        if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(entry.name)) {
          results.push(relPath);
        }
      }
    }
    return results;
  }

  return (req, res, next) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // 1. GET /api/library/tracks
    if (req.method === 'GET' && url.pathname === '/api/library/tracks') {
      try {
        const meta = readMeta();
        const files = walkDirectory(libraryDir);
        const tracks = files.map(relPath => {
          const fullPath = path.join(libraryDir, relPath);
          const stats = fs.statSync(fullPath);
          const savedData = meta.tracks[relPath] || {};
          const filename = path.basename(relPath);
          const ext = path.extname(filename);
          const cleanName = filename.replace(/\.[^/.]+$/, '');
          
          let artist = 'Unknown Artist';
          let title = cleanName;
          if (cleanName.includes(' - ')) {
            const parts = cleanName.split(' - ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
          }

          return {
            id: savedData.id || Buffer.from(relPath).toString('hex').slice(0, 12),
            filename,
            filePath: relPath,
            title: savedData.title || title,
            artist: savedData.artist || artist,
            bpm: savedData.bpm || Math.floor(Math.random() * 15 + 124),
            key: savedData.key || '8A',
            energy: savedData.energy || 7,
            mood: savedData.mood || '',
            style: savedData.style || '',
            groups: savedData.groups || [],
            fileSize: stats.size,
            format: ext.replace('.', '').toLowerCase(),
            url: `/api/library/stream?file=${encodeURIComponent(relPath)}`,
            coverArt: savedData.coverArt || undefined,
            gradient: savedData.gradient || `linear-gradient(${Math.floor(Math.random() * 360)}deg, #161920, #A855F7)`,
            segments: savedData.segments || undefined,
            duration: savedData.duration || undefined,
            hotCues: savedData.hotCues || undefined
          };
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          libraryPath: libraryDir,
          tracks,
          groups: meta.groups || DEFAULT_GROUPS
        }));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 2. GET /api/library/stream
    if (req.method === 'GET' && url.pathname === '/api/library/stream') {
      const fileParam = url.searchParams.get('file');
      if (!fileParam) {
        res.statusCode = 400;
        res.end('Missing file parameter');
        return;
      }

      const safePath = path.resolve(libraryDir, fileParam);
      if (!safePath.startsWith(libraryDir) || !fs.existsSync(safePath)) {
        res.statusCode = 404;
        res.end('File not found');
        return;
      }

      const stat = fs.statSync(safePath);
      const totalSize = stat.size;
      const mimeType = getMimeType(safePath);
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunkSize = end - start + 1;

        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunkSize);
        res.setHeader('Content-Type', mimeType);

        const stream = fs.createReadStream(safePath, { start, end });
        stream.pipe(res);
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Length', totalSize);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');

        fs.createReadStream(safePath).pipe(res);
      }
      return;
    }

    // 3. POST /api/library/upload (Upload & Copy into LIBRARY folder)
    if (req.method === 'POST' && url.pathname === '/api/library/upload') {
      const filename = url.searchParams.get('filename') || `track_${Date.now()}.mp3`;
      const subfolder = url.searchParams.get('subfolder') || '';
      const group = url.searchParams.get('group') || '';
      const mood = url.searchParams.get('mood') || '';
      const style = url.searchParams.get('style') || '';

      const cleanFilename = path.basename(filename).replace(/[<>:"/\\|?*]/g, '_');
      const targetSub = subfolder ? subfolder.replace(/[<>:"/\\|?*]/g, '_') : (group ? group.replace(/[<>:"/\\|?*]/g, '_') : '');
      const targetDir = targetSub ? path.join(libraryDir, targetSub) : libraryDir;

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const targetPath = path.join(targetDir, cleanFilename);
      const writeStream = fs.createWriteStream(targetPath);

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const relPath = path.relative(libraryDir, targetPath).replace(/\\/g, '/');
        const meta = readMeta();
        const existing = meta.tracks[relPath] || {};
        meta.tracks[relPath] = {
          ...existing,
          id: existing.id || Buffer.from(relPath).toString('hex').slice(0, 12),
          groups: group ? Array.from(new Set([...(existing.groups || []), group])) : (existing.groups || []),
          mood: mood || existing.mood || '',
          style: style || existing.style || ''
        };
        saveMeta(meta);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          filePath: relPath,
          url: `/api/library/stream?file=${encodeURIComponent(relPath)}`
        }));
      });

      writeStream.on('error', (err) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
      return;
    }

    // 4. DELETE /api/library/track (Delete track physically from LIBRARY)
    if (req.method === 'DELETE' && url.pathname === '/api/library/track') {
      const fileParam = url.searchParams.get('file');
      if (!fileParam) {
        res.statusCode = 400;
        res.end(JSON.stringify({ success: false, error: 'Missing file parameter' }));
        return;
      }

      const safePath = path.resolve(libraryDir, fileParam);
      if (!safePath.startsWith(libraryDir)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ success: false, error: 'Access denied' }));
        return;
      }

      try {
        if (fs.existsSync(safePath)) {
          fs.unlinkSync(safePath);
        }
        const relPath = path.relative(libraryDir, safePath).replace(/\\/g, '/');
        const meta = readMeta();
        delete meta.tracks[relPath];
        saveMeta(meta);

        // Optionally clean up empty directory
        const parent = path.dirname(safePath);
        if (parent !== libraryDir && fs.existsSync(parent)) {
          const files = fs.readdirSync(parent);
          if (files.length === 0) {
            fs.rmdirSync(parent);
          }
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, message: 'File deleted successfully' }));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 5. POST /api/library/organize (Physically sort and move tracks in LIBRARY)
    if (req.method === 'POST' && url.pathname === '/api/library/organize') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { scheme } = JSON.parse(body || '{}') as { scheme: 'group' | 'mood' | 'style' | 'artist' | 'flat' };
          const meta = readMeta();
          const files = walkDirectory(libraryDir);
          let movedCount = 0;
          const newTrackMeta: Record<string, any> = {};

          for (const relPath of files) {
            const fullPath = path.join(libraryDir, relPath);
            const filename = path.basename(relPath);
            const savedData = meta.tracks[relPath] || {};

            let targetFolder = '';
            if (scheme === 'group') {
              const grpId = savedData.groups && savedData.groups[0];
              const grp = meta.groups.find(g => g.id === grpId);
              targetFolder = grp ? grp.name : 'Unsorted';
            } else if (scheme === 'mood') {
              targetFolder = savedData.mood || 'Unsorted';
            } else if (scheme === 'style') {
              targetFolder = savedData.style || 'Unsorted';
            } else if (scheme === 'artist') {
              targetFolder = savedData.artist || 'Various Artists';
            } else if (scheme === 'flat') {
              targetFolder = '';
            }

            const cleanTargetFolder = targetFolder.replace(/[<>:"/\\|?*]/g, '_').trim();
            const targetDir = cleanTargetFolder ? path.join(libraryDir, cleanTargetFolder) : libraryDir;
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }

            const newFullPath = path.join(targetDir, filename);
            if (newFullPath !== fullPath) {
              fs.renameSync(fullPath, newFullPath);
              movedCount++;
            }

            const newRelPath = path.relative(libraryDir, newFullPath).replace(/\\/g, '/');
            newTrackMeta[newRelPath] = {
              ...savedData,
              filePath: newRelPath
            };
          }

          // Clean empty subfolders
          const subdirs = fs.readdirSync(libraryDir, { withFileTypes: true });
          for (const sub of subdirs) {
            if (sub.isDirectory() && !sub.name.startsWith('.')) {
              const p = path.join(libraryDir, sub.name);
              const remaining = fs.readdirSync(p);
              if (remaining.length === 0) {
                fs.rmdirSync(p);
              }
            }
          }

          meta.tracks = newTrackMeta;
          saveMeta(meta);

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, movedCount }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 6. POST /api/library/groups (Save groups)
    if (req.method === 'POST' && url.pathname === '/api/library/groups') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { groups } = JSON.parse(body || '{}');
          if (Array.isArray(groups)) {
            const meta = readMeta();
            meta.groups = groups;
            saveMeta(meta);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, groups: meta.groups }));
            return;
          }
          res.statusCode = 400;
          res.end(JSON.stringify({ success: false, error: 'Invalid groups array' }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 7. POST /api/library/update-track (Save track tags/bpm/key/cues)
    if (req.method === 'POST' && url.pathname === '/api/library/update-track') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { filePath, updates } = JSON.parse(body || '{}');
          if (!filePath || !updates) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, error: 'Missing filePath or updates' }));
            return;
          }
          const meta = readMeta();
          meta.tracks[filePath] = {
            ...(meta.tracks[filePath] || {}),
            ...updates
          };
          saveMeta(meta);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, track: meta.tracks[filePath] }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    next();
  };
}
