/** Local-first group materials. IndexedDB + in-memory fallback. */

const DB_NAME = 'learnchain-group-materials'
const STORE = 'files'
const DB_VERSION = 1

export type LocalGroupMaterial = {
  id: string
  groupId: number
  fileName: string
  contentType: string
  size: number
  createdAt: number
  blob: Blob
}

/** Survives within the tab if IndexedDB is blocked. */
const memoryByGroup = new Map<number, Map<string, LocalGroupMaterial>>()

function memEnsure(groupId: number) {
  let m = memoryByGroup.get(groupId)
  if (!m) {
    m = new Map()
    memoryByGroup.set(groupId, m)
  }
  return m
}

function memPut(row: LocalGroupMaterial) {
  memEnsure(row.groupId).set(row.id, row)
}

function memList(groupId: number): LocalGroupMaterial[] {
  return Array.from(memEnsure(groupId).values()).sort((a, b) => b.createdAt - a.createdAt)
}

function memRename(id: string, fileName: string): boolean {
  for (const map of memoryByGroup.values()) {
    const row = map.get(id)
    if (row) {
      row.fileName = fileName
      return true
    }
  }
  return false
}

function memDelete(id: string): boolean {
  for (const map of memoryByGroup.values()) {
    if (map.delete(id)) return true
  }
  return false
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('byGroup', 'groupId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB blocked (close other tabs?)'))
  })
}

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function localPutGroupFile(
  groupId: number,
  file: File,
  onStage?: (stage: string) => void,
): Promise<LocalGroupMaterial> {
  const row: LocalGroupMaterial = {
    id: newLocalId(),
    groupId,
    fileName: file.name || 'upload.bin',
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now(),
    blob: file,
  }

  // Always keep memory copy first so UI never loses the file.
  memPut(row)
  onStage?.('memory:ok')

  try {
    onStage?.('idb:open')
    const db = await openDb()
    onStage?.('idb:write')
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const putReq = tx.objectStore(STORE).put(row)
      putReq.onerror = () => reject(putReq.error ?? new Error('IDB put failed'))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'))
    })
    onStage?.('idb:ok')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    onStage?.(`idb:fail:${msg}`)
    // Memory copy already saved — still success for the user.
    console.warn('[group-materials] IndexedDB save failed, using memory only:', e)
  }

  return row
}

export async function localListGroupFiles(groupId: number): Promise<LocalGroupMaterial[]> {
  const fromMem = memList(groupId)
  try {
    const db = await openDb()
    const fromIdb: LocalGroupMaterial[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const idx = tx.objectStore(STORE).index('byGroup')
      const req = idx.getAll(IDBKeyRange.only(groupId))
      req.onsuccess = () => resolve((req.result ?? []) as LocalGroupMaterial[])
      req.onerror = () => reject(req.error ?? new Error('IDB list failed'))
    })
    // Merge: memory wins on id collision (newer session edits)
    const map = new Map<string, LocalGroupMaterial>()
    for (const r of fromIdb) map.set(r.id, r)
    for (const r of fromMem) map.set(r.id, r)
    // Also hydrate memory from IDB for later
    for (const r of fromIdb) {
      if (!memEnsure(groupId).has(r.id)) memPut(r)
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt)
  } catch (e) {
    console.warn('[group-materials] IndexedDB list failed, using memory:', e)
    return fromMem
  }
}

export async function localRenameGroupFile(id: string, fileName: string): Promise<void> {
  memRename(id, fileName)
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const row = getReq.result as LocalGroupMaterial | undefined
        if (!row) {
          resolve()
          return
        }
        row.fileName = fileName
        store.put(row)
      }
      getReq.onerror = () => reject(getReq.error ?? new Error('IDB get failed'))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IDB rename failed'))
    })
  } catch (e) {
    console.warn('[group-materials] IndexedDB rename failed:', e)
  }
}

export async function localDeleteGroupFile(id: string): Promise<void> {
  memDelete(id)
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IDB delete failed'))
    })
  } catch (e) {
    console.warn('[group-materials] IndexedDB delete failed:', e)
  }
}

export async function localCountGroupFiles(groupId: number): Promise<number> {
  const list = await localListGroupFiles(groupId)
  return list.length
}

export async function localGetBlob(id: string): Promise<Blob | null> {
  for (const map of memoryByGroup.values()) {
    const row = map.get(id)
    if (row) return row.blob
  }
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const row = req.result as LocalGroupMaterial | undefined
        resolve(row?.blob ?? null)
      }
      req.onerror = () => reject(req.error ?? new Error('IDB read failed'))
    })
  } catch {
    return null
  }
}
