const DB_NAME = 'learnchain-bgm-user'
const STORE = 'tracks'
const DB_VERSION = 1

export interface StoredUserTrackMeta {
    id: string
    title: string
    mimeType: string
    createdAt: number
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    })
}

export async function idbPutTrack(id: string, title: string, blob: Blob): Promise<StoredUserTrackMeta> {
    const db = await openDb()
    const meta: StoredUserTrackMeta & { blob: Blob } = {
        id,
        title,
        mimeType: blob.type || 'audio/mpeg',
        createdAt: Date.now(),
        blob,
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(meta)
        tx.oncomplete = () => resolve({ id, title, mimeType: meta.mimeType, createdAt: meta.createdAt })
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save track'))
    })
}

export async function idbDeleteTrack(id: string): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('Failed to delete track'))
    })
}

export async function idbListTracks(): Promise<Array<StoredUserTrackMeta & { blob: Blob }>> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).getAll()
        req.onsuccess = () => resolve((req.result ?? []) as Array<StoredUserTrackMeta & { blob: Blob }>)
        req.onerror = () => reject(req.error ?? new Error('Failed to list tracks'))
    })
}

export async function idbGetBlob(id: string): Promise<Blob | null> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(id)
        req.onsuccess = () => {
            const row = req.result as { blob?: Blob } | undefined
            resolve(row?.blob ?? null)
        }
        req.onerror = () => reject(req.error ?? new Error('Failed to read track'))
    })
}
