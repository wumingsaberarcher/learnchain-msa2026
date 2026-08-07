/** Local-first group materials (IndexedDB). Upload appears instantly; cloud sync is optional. */

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
  /** negative local id for UI; remote uses positive server ids */
  blob: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
  })
}

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function localPutGroupFile(groupId: number, file: File): Promise<LocalGroupMaterial> {
  const db = await openDb()
  const row: LocalGroupMaterial = {
    id: newLocalId(),
    groupId,
    fileName: file.name || 'upload.bin',
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now(),
    blob: file,
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(row)
    tx.oncomplete = () => resolve(row)
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save local file'))
  })
}

export async function localListGroupFiles(groupId: number): Promise<LocalGroupMaterial[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const idx = tx.objectStore(STORE).index('byGroup')
    const req = idx.getAll(groupId)
    req.onsuccess = () => {
      const rows = (req.result ?? []) as LocalGroupMaterial[]
      rows.sort((a, b) => b.createdAt - a.createdAt)
      resolve(rows)
    }
    req.onerror = () => reject(req.error ?? new Error('Failed to list local files'))
  })
}

export async function localRenameGroupFile(id: string, fileName: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const row = getReq.result as LocalGroupMaterial | undefined
      if (!row) {
        reject(new Error('Local file not found'))
        return
      }
      row.fileName = fileName
      store.put(row)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to rename local file'))
  })
}

export async function localDeleteGroupFile(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete local file'))
  })
}

export async function localCountGroupFiles(groupId: number): Promise<number> {
  const list = await localListGroupFiles(groupId)
  return list.length
}

export async function localGetBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => {
      const row = req.result as LocalGroupMaterial | undefined
      resolve(row?.blob ?? null)
    }
    req.onerror = () => reject(req.error ?? new Error('Failed to read local file'))
  })
}
