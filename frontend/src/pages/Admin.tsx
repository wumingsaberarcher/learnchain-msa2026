import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Shield, Search, Ban, BadgeCheck, Sparkles, Trash2 } from 'lucide-react'
import { useHabitStore } from '../stores/habitStore'
import { useTranslation } from '../stores/settingsStore'
import { BADGE_DEFINITIONS, BADGE_MAP } from '../badges/badgeDefinitions'
import {
    banUser,
    deleteUser,
    getAdminUser,
    grantBadge,
    listAdminUsers,
    listBadgeIds,
    revokeBadge,
    setUserXp,
    unbanUser,
    type AdminUserDetail,
    type AdminUserSummary,
} from '../api/adminApi'

/** Stepped ban durations: 1h → 30d */
const BAN_HOURS = [1, 3, 6, 12, 24, 72, 168, 336, 720] as const

function banLabel(hours: number, t: (key: 'admin.banHours' | 'admin.banDays', params?: Record<string, string | number>) => string) {
    if (hours < 24) return t('admin.banHours', { n: hours })
    return t('admin.banDays', { n: hours / 24 })
}

export default function AdminPage() {
    const { isLoggedIn, currentUser } = useHabitStore()
    const { t } = useTranslation()
    const [users, setUsers] = useState<AdminUserSummary[]>([])
    const [q, setQ] = useState('')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [detail, setDetail] = useState<AdminUserDetail | null>(null)
    const [badgeIds, setBadgeIds] = useState<string[]>([])
    const [xpInput, setXpInput] = useState('')
    const [banHours, setBanHours] = useState<number>(24)
    const [grantBadgeId, setGrantBadgeId] = useState('')
    const [msg, setMsg] = useState('')
    const [err, setErr] = useState('')
    const [loading, setLoading] = useState(false)

    const isAdmin = currentUser?.role === 'Admin'
    const targetIsAdmin = detail?.role === 'Admin'

    const refreshList = useCallback(async () => {
        setLoading(true)
        setErr('')
        try {
            const list = await listAdminUsers(q)
            setUsers(list)
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.loadFailed'))
        } finally {
            setLoading(false)
        }
    }, [q, t])

    const loadDetail = useCallback(async (id: number) => {
        setErr('')
        try {
            const d = await getAdminUser(id)
            setDetail(d)
            setSelectedId(id)
            setXpInput(String(d.totalXP))
            const locked = d.achievements.filter(a => !a.unlocked).map(a => a.badgeId)
            setGrantBadgeId(locked[0] ?? '')
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.loadFailed'))
        }
    }, [t])

    useEffect(() => {
        if (!isLoggedIn || !isAdmin) return
        void refreshList()
        listBadgeIds()
            .then(ids => {
                const order = BADGE_DEFINITIONS.map(b => b.id)
                const sorted = [...ids].sort((a, b) => {
                    const ia = order.indexOf(a)
                    const ib = order.indexOf(b)
                    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
                })
                setBadgeIds(sorted)
            })
            .catch(() => setBadgeIds([]))
    }, [isLoggedIn, isAdmin, refreshList])

    const grantableIds = useMemo(() => {
        if (!detail) return [] as string[]
        return badgeIds.filter(id => !detail.achievements.find(a => a.badgeId === id && a.unlocked))
    }, [badgeIds, detail])

    const ownedAchievements = useMemo(() => {
        if (!detail) return []
        return detail.achievements.filter(a => a.unlocked)
    }, [detail])

    if (!isLoggedIn) return <Navigate to="/" replace />
    if (!isAdmin) {
        return (
            <div className="admin-page">
                <div className="admin-card">
                    <h1>{t('admin.forbidden')}</h1>
                    <p>{t('admin.forbiddenHint')}</p>
                </div>
            </div>
        )
    }

    const flash = (ok: string) => {
        setMsg(ok)
        setErr('')
        setTimeout(() => setMsg(''), 2500)
    }

    const onSetXp = async () => {
        if (!detail || targetIsAdmin) return
        const xp = parseInt(xpInput, 10)
        if (Number.isNaN(xp) || xp < 0) {
            setErr(t('admin.invalidXp'))
            return
        }
        try {
            await setUserXp(detail.id, xp)
            flash(t('admin.xpUpdated'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    const onGrant = async () => {
        if (!detail || !grantBadgeId) return
        try {
            await grantBadge(detail.id, grantBadgeId)
            flash(t('admin.badgeGranted'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    const onRevoke = async (badgeId: string) => {
        if (!detail) return
        try {
            await revokeBadge(detail.id, badgeId)
            flash(t('admin.badgeRevoked'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    const onBan = async () => {
        if (!detail || targetIsAdmin) return
        if (!BAN_HOURS.includes(banHours as typeof BAN_HOURS[number])) {
            setErr(t('admin.invalidBan'))
            return
        }
        try {
            await banUser(detail.id, banHours)
            flash(t('admin.banned'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    const onUnban = async () => {
        if (!detail || targetIsAdmin) return
        try {
            await unbanUser(detail.id)
            flash(t('admin.unbanned'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    const onDelete = async () => {
        if (!detail || targetIsAdmin) return
        const ok = window.confirm(t('admin.deleteConfirm', { name: detail.username }))
        if (!ok) return
        try {
            await deleteUser(detail.id)
            flash(t('admin.deleted'))
            setDetail(null)
            setSelectedId(null)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    return (
        <div className="admin-page">
            <div className="admin-card">
                <div className="admin-header">
                    <Shield className="w-6 h-6 admin-header-icon" />
                    <div>
                        <h1>{t('admin.title')}</h1>
                        <p>{t('admin.subtitle')}</p>
                    </div>
                </div>

                <div className="admin-search-row">
                    <div className="admin-search">
                        <Search className="w-4 h-4" />
                        <input
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder={t('admin.searchPlaceholder')}
                            onKeyDown={e => e.key === 'Enter' && void refreshList()}
                        />
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => void refreshList()}>
                        {t('admin.search')}
                    </button>
                </div>

                {msg && <div className="admin-msg success">{msg}</div>}
                {err && <div className="admin-msg error">{err}</div>}

                <div className="admin-layout">
                    <div className="admin-user-list">
                        <h2>{t('admin.users')} {loading ? '…' : `(${users.length})`}</h2>
                        {users.map(u => (
                            <button
                                key={u.id}
                                type="button"
                                className={`admin-user-row${selectedId === u.id ? ' active' : ''}`}
                                onClick={() => void loadDetail(u.id)}
                            >
                                <strong>{u.username}</strong>
                                <span>{u.email}</span>
                                <span>Lv.{u.level} · {u.totalXP} XP · {u.role}</span>
                                {u.isBanned && <em className="admin-banned-tag">{t('admin.bannedTag')}</em>}
                            </button>
                        ))}
                    </div>

                    <div className="admin-detail">
                        {!detail ? (
                            <p className="admin-hint">{t('admin.selectUser')}</p>
                        ) : (
                            <>
                                <h2>{detail.username}</h2>
                                <p className="admin-meta">
                                    {detail.email} · {detail.role} · ID {detail.id}
                                </p>
                                {targetIsAdmin && (
                                    <p className="admin-protected">{t('admin.adminProtected')}</p>
                                )}
                                {detail.isBanned && detail.bannedUntil && (
                                    <p className="admin-banned-until">
                                        {t('admin.bannedUntil')}: {new Date(detail.bannedUntil).toLocaleString()}
                                    </p>
                                )}

                                <section className="admin-section">
                                    <h3><Sparkles className="w-4 h-4" /> {t('admin.setXp')}</h3>
                                    <div className="admin-inline">
                                        <input
                                            type="number"
                                            min={0}
                                            value={xpInput}
                                            onChange={e => setXpInput(e.target.value)}
                                            disabled={targetIsAdmin}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => void onSetXp()}
                                            disabled={targetIsAdmin}
                                        >
                                            {t('admin.saveXp')}
                                        </button>
                                    </div>
                                </section>

                                <section className="admin-section">
                                    <h3><BadgeCheck className="w-4 h-4" /> {t('admin.badges')}</h3>

                                    {ownedAchievements.length > 0 && (
                                        <>
                                            <p className="admin-sublabel">{t('admin.ownedBadges')}</p>
                                            <ul className="admin-badge-list">
                                                {ownedAchievements.map(a => {
                                                    const def = BADGE_MAP[a.badgeId]
                                                    return (
                                                        <li key={a.badgeId} className="admin-badge-owned">
                                                            <div className="admin-badge-info">
                                                                {def?.image ? (
                                                                    <img src={def.image} alt="" className="admin-badge-thumb" />
                                                                ) : (
                                                                    <div className="admin-badge-thumb placeholder">?</div>
                                                                )}
                                                                <div>
                                                                    <strong>{def ? t(def.titleKey) : a.badgeId}</strong>
                                                                    {def && <span>{t(def.descKey)}</span>}
                                                                </div>
                                                            </div>
                                                            <button type="button" className="admin-revoke-btn" onClick={() => void onRevoke(a.badgeId)}>
                                                                {t('admin.revoke')}
                                                            </button>
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                        </>
                                    )}

                                    <p className="admin-sublabel">{t('admin.grantBadge')}</p>
                                    {grantableIds.length === 0 ? (
                                        <p className="admin-hint">{t('admin.noBadgesToGrant')}</p>
                                    ) : (
                                        <>
                                            <div className="admin-badge-picker" role="listbox" aria-label={t('admin.grantBadge')}>
                                                {grantableIds.map(id => {
                                                    const def = BADGE_MAP[id]
                                                    return (
                                                        <button
                                                            key={id}
                                                            type="button"
                                                            role="option"
                                                            aria-selected={grantBadgeId === id}
                                                            className={`admin-badge-option${grantBadgeId === id ? ' selected' : ''}`}
                                                            onClick={() => setGrantBadgeId(id)}
                                                        >
                                                            {def?.image ? (
                                                                <img src={def.image} alt="" className="admin-badge-thumb" />
                                                            ) : (
                                                                <div className="admin-badge-thumb placeholder">?</div>
                                                            )}
                                                            <div className="admin-badge-option-text">
                                                                <strong>{def ? t(def.titleKey) : id}</strong>
                                                                {def && <span>{t(def.descKey)}</span>}
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                            <div className="admin-inline" style={{ marginTop: '0.75rem' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => void onGrant()}
                                                    disabled={!grantBadgeId}
                                                >
                                                    {t('admin.grant')}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </section>

                                <section className="admin-section">
                                    <h3><Ban className="w-4 h-4" /> {t('admin.banSection')}</h3>
                                    {targetIsAdmin ? (
                                        <p className="admin-hint">{t('admin.cannotBanAdmin')}</p>
                                    ) : (
                                        <div className="admin-inline">
                                            <select
                                                value={banHours}
                                                onChange={e => setBanHours(Number(e.target.value))}
                                                aria-label={t('admin.banDuration')}
                                            >
                                                {BAN_HOURS.map(h => (
                                                    <option key={h} value={h}>{banLabel(h, t)}</option>
                                                ))}
                                            </select>
                                            <button type="button" className="btn btn-secondary" onClick={() => void onBan()}>
                                                {t('admin.ban')}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={() => void onUnban()}
                                                disabled={!detail.isBanned}
                                            >
                                                {t('admin.unban')}
                                            </button>
                                        </div>
                                    )}
                                </section>

                                <section className="admin-section admin-danger">
                                    <h3><Trash2 className="w-4 h-4" /> {t('admin.deleteSection')}</h3>
                                    {targetIsAdmin ? (
                                        <p className="admin-hint">{t('admin.cannotDeleteAdmin')}</p>
                                    ) : (
                                        <>
                                            <p className="admin-hint">{t('admin.deleteHint')}</p>
                                            <button type="button" className="btn admin-btn-danger" onClick={() => void onDelete()}>
                                                {t('admin.delete')}
                                            </button>
                                        </>
                                    )}
                                </section>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
