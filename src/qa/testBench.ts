export const QA_BACKUP_KEY = 'aia.qa-backup.v1'
const GAME_KEY_PREFIX = 'aia.'
const QA_SNAPSHOT_VERSION = 1

export type QaStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

export type QaSnapshot = {
  version: typeof QA_SNAPSHOT_VERSION
  createdAt: string
  returnPath: string
  entries: Record<string, string>
}

export type QaRestoreResult = {
  ok: boolean
  returnPath?: string
  restoredKeys?: number
}

function gameKeys(storage: QaStorage) {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(GAME_KEY_PREFIX) && key !== QA_BACKUP_KEY) keys.push(key)
  }
  return keys
}

function validSnapshot(value: unknown): value is QaSnapshot {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<QaSnapshot>
  return item.version === QA_SNAPSHOT_VERSION
    && typeof item.createdAt === 'string'
    && Number.isFinite(Date.parse(item.createdAt))
    && typeof item.returnPath === 'string'
    && item.returnPath.startsWith('/')
    && Boolean(item.entries)
    && typeof item.entries === 'object'
    && !Array.isArray(item.entries)
    && Object.entries(item.entries).every(([key, entry]) =>
      key.startsWith(GAME_KEY_PREFIX)
      && key !== QA_BACKUP_KEY
      && typeof entry === 'string',
    )
}

export function readQaSnapshot(storage: QaStorage): QaSnapshot | undefined {
  try {
    const raw = storage.getItem(QA_BACKUP_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!validSnapshot(parsed)) {
      storage.removeItem(QA_BACKUP_KEY)
      return undefined
    }
    return parsed
  } catch {
    try { storage.removeItem(QA_BACKUP_KEY) } catch { /* storage may be unavailable */ }
    return undefined
  }
}

export function beginQaSession(storage: QaStorage, returnPath: string): QaSnapshot | undefined {
  const existing = readQaSnapshot(storage)
  if (existing) return existing
  try {
    const entries = Object.fromEntries(gameKeys(storage).map((key) => [key, storage.getItem(key) ?? '']))
    const snapshot: QaSnapshot = {
      version: QA_SNAPSHOT_VERSION,
      createdAt: new Date().toISOString(),
      returnPath: returnPath.startsWith('/') ? returnPath : '/',
      entries,
    }
    storage.setItem(QA_BACKUP_KEY, JSON.stringify(snapshot))
    return snapshot
  } catch {
    return undefined
  }
}

export function clearQaWorkingState(storage: QaStorage) {
  if (!readQaSnapshot(storage)) return false
  try {
    for (const key of gameKeys(storage)) storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function restoreQaSession(storage: QaStorage): QaRestoreResult {
  const snapshot = readQaSnapshot(storage)
  if (!snapshot) return { ok: false }
  try {
    // Keep the backup key until every original value is back. If a quota/security
    // error interrupts restoration, the same restore action can be retried safely.
    for (const key of gameKeys(storage)) storage.removeItem(key)
    for (const [key, value] of Object.entries(snapshot.entries)) storage.setItem(key, value)
    storage.removeItem(QA_BACKUP_KEY)
    return { ok: true, returnPath: snapshot.returnPath, restoredKeys: Object.keys(snapshot.entries).length }
  } catch {
    return { ok: false }
  }
}

export function qaSnapshotSummary(snapshot: QaSnapshot | undefined) {
  if (!snapshot) return undefined
  return {
    createdAt: snapshot.createdAt,
    returnPath: snapshot.returnPath,
    savedKeys: Object.keys(snapshot.entries).length,
  }
}
