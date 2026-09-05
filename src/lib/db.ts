import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface DjoidDB extends DBSchema {
  tracks: {
    key: string;
    value: any;
  };
  playlists: {
    key: string;
    value: any;
  };
  groups: {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBPDatabase<DjoidDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<DjoidDB>('DjoidLocalLibrary', 3, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('tracks')) {
          db.createObjectStore('tracks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('groups')) {
          db.createObjectStore('groups', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveTrack(track: any) {
  const db = await getDB();
  const cloned = { ...track };
  delete cloned.url;
  delete cloned.file;
  await db.put('tracks', cloned);
}

export async function getAllTracks() {
  const db = await getDB();
  return await db.getAll('tracks');
}

export async function clearTracks() {
  const db = await getDB();
  await db.clear('tracks');
}

export async function savePlaylist(playlist: any) {
  const db = await getDB();
  await db.put('playlists', playlist);
}

export async function getAllPlaylists() {
  const db = await getDB();
  return await db.getAll('playlists');
}

export async function deletePlaylist(id: string) {
  const db = await getDB();
  await db.delete('playlists', id);
}

export async function saveGroup(group: any) {
  const db = await getDB();
  await db.put('groups', group);
}

export async function getAllGroups() {
  const db = await getDB();
  return await db.getAll('groups');
}

export async function deleteGroup(id: string) {
  const db = await getDB();
  await db.delete('groups', id);
}
