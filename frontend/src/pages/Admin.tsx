import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Shield, Search, Ban, BadgeCheck, Sparkles, Trash2, KeyRound, Crown, Eye, EyeOff } from 'lucide-react'
import { useHabitStore } from '../stores/habitStore'
import { useTranslation } from '../stores/settingsStore'
import { BADGE_DEFINITIONS, BADGE_MAP } from '../badges/badgeDefinitions'
import {
    banUser,
    deleteUser,
    getAdminUser,
    grantBadge,
    isProtectedStaffRole,
    isStaffRole,
    isSuperAdminRole,
    listAdminUsers,
    listBadgeIds,
    revokeBadge,
    setUserPassword,
    setUserRole,
    setUserXp,
    unbanUser,
    type AdminUserDetail,
    type AdminUserSummary,
} from '../api/adminApi'

const BAN_HOURS = [1, 3, 6, 12, 24, 72, 168, 336, 720] as const

function banLabel(hours: number, t: (key: 'admin.banHours' | 'admin.banDays', params?: Record<string, string | number>) => string) {
    if (hours < 24) return t('admin.banHours', { n: hours })
    return t('admin.banDays', { n: hours / 24 })
}

function roleLabel(role: string, t: (key: 'admin.role.user' | 'admin.role.admin' | 'admin.role.super') => string) {
    if (role === 'SuperAdmin') return t('admin.role.super')
    if (role === 'Admin') return t('admin.role.admin')
    return t('admin.role.user')
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
    const [passwordInput, setPasswordInput] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [msg, setMsg] = useState('')
    const [err, setErr] = useState('')
    const [loading, setLoading] = useState(false)

    const isStaff = isStaffRole(currentUser?.role)
    const isSuper = isSuperAdminRole(currentUser?.role)
    const targetProtected = detail ? isProtectedStaffRole(detail.role) : false
    const targetIsSuper = detail ? isSuperAdminRole(detail.role) : false
    /** Regular Admin cannot manage staff; SuperAdmin can manage Admin (not SuperAdmin). */
    const canManageTarget = !!detail && (
        isSuper
            ? !targetIsSuper
            : !targetProtected
    )

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
        setShowPassword(false)
        setPasswordInput('')
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
        if (!isLoggedIn || !isStaff) return
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
    }, [isLoggedIn, isStaff, refreshList])

    const grantableIds = useMemo(() => {
        if (!detail) return [] as string[]
        return badgeIds.filter(id => !detail.achievements.find(a => a.badgeId === id && a.unlocked))
    }, [badgeIds, detail])

    const ownedAchievements = useMemo(() => {
        if (!detail) return []
        return detail.achievements.filter(a => a.unlocked)
    }, [detail])

    if (!isLoggedIn) return <Navigate to="/" replace />
    if (!isStaff) {
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
        if (!detail || !canManageTarget) return
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
        if (!detail || !canManageTarget) return
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
        if (!detail || !canManageTarget) return
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
        if (!detail || !canManageTarget) return
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

    const onPromote = async () => {
        if (!detail || !isSuper || targetIsSuper) return
        try {
            await setUserRole(detail.id, 'Admin')
            flash(t('admin.roleGranted'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    const onDemote = async () => {
        if (!detail || !isSuper || detail.role !== 'Admin') return
        const ok = window.confirm(t('admin.roleRevokeConfirm', { name: detail.username }))
        if (!ok) return
        try {
            await setUserRole(detail.id, 'User')
            flash(t('admin.roleRevoked'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    const onSetPassword = async () => {
        if (!detail || !isSuper) return
        if (!passwordInput.trim()) {
            setErr(t('admin.invalidPassword'))
            return
        }
        try {
            const res = await setUserPassword(detail.id, passwordInput.trim())
            flash(t('admin.passwordUpdated'))
            setPasswordInput(res.password)
            setShowPassword(true)
            await loadDetail(detail.id)
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
                        <p>{isSuper ? t('admin.subtitleSuper') : t('admin.subtitle')}</p>
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
                                <strong>
                                    {u.username}
                                    {u.role === 'SuperAdmin' && ' ★'}
                                </strong>
                                <span>{u.email}</span>
                                <span>Lv.{u.level} · {u.totalXP} XP · {roleLabel(u.role, t)}</span>
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
                                    {detail.email} · {roleLabel(detail.role, t)} · ID {detail.id}
                                </p>
                                {!canManageTarget && (
                                    <p className="admin-protected">
                                        {targetIsSuper ? t('admin.superProtected') : t('admin.adminProtected')}
                                    </p>
                                )}
                                {detail.isBanned && detail.bannedUntil && (
                                    <p className="admin-banned-until">
                                        {t('admin.bannedUntil')}: {new Date(detail.bannedUntil).toLocaleString()}
                                    </p>
                                )}

                                {isSuper && (
                                    <section className="admin-section">
                                        <h3><Crown className="w-4 h-4" /> {t('admin.secretsSection')}</h3>
                                        <div className="admin-secrets">
                                            <p><strong>{t('admin.secretEmail')}:</strong> {detail.email}</p>
                                            <p><strong>{t('admin.secretCreated')}:</strong> {new Date(detail.createdAt).toLocaleString()}</p>
                                            <p><strong>{t('admin.secretBio')}:</strong> {detail.bio?.trim() || t('admin.secretEmpty')}</p>
                                            <p><strong>{t('admin.secretDigest')}:</strong> {detail.dailyDigestEnabled ? t('admin.yes') : t('admin.no')}</p>
                                            <p className="admin-password-row">
                                                <strong>{t('admin.secretPassword')}:</strong>{' '}
                                                {detail.passwordAvailable && detail.password ? (
                                                    <>
                                                        <code>{showPassword ? detail.password : '••••••••'}</code>
                                                        <button
                                                            type="button"
                                                            className="admin-revoke-btn"
                                                            onClick={() => setShowPassword(v => !v)}
                                                        >
                                                            {showPassword
                                                                ? <><EyeOff className="w-3.5 h-3.5 inline" /> {t('admin.hidePassword')}</>
                                                                : <><Eye className="w-3.5 h-3.5 inline" /> {t('admin.showPassword')}</>}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="admin-hint">{t('admin.passwordUnavailable')}</span>
                                                )}
                                            </p>
                                        </div>
                                        {!targetIsSuper && (
                                            <div className="admin-inline" style={{ marginTop: '0.75rem' }}>
                                                <input
                                                    type="text"
                                                    value={passwordInput}
                                                    onChange={e => setPasswordInput(e.target.value)}
                                                    placeholder={t('admin.newPasswordPlaceholder')}
                                                    autoComplete="off"
                                                />
                                                <button type="button" className="btn btn-secondary" onClick={() => void onSetPassword()}>
                                                    <KeyRound className="w-4 h-4 inline mr-1" />
                                                    {t('admin.setPassword')}
                                                </button>
                                            </div>
                                        )}
                                    </section>
                                )}

                                {isSuper && !targetIsSuper && (
                                    <section className="admin-section">
                                        <h3><Crown className="w-4 h-4" /> {t('admin.roleSection')}</h3>
                                        <p className="admin-hint">{t('admin.roleHint')}</p>
                                        <div className="admin-inline">
                                            {detail.role === 'User' ? (
                                                <button type="button" className="btn btn-primary" onClick={() => void onPromote()}>
                                                    {t('admin.grantAdmin')}
                                                </button>
                                            ) : detail.role === 'Admin' ? (
                                                <button type="button" className="btn btn-secondary" onClick={() => void onDemote()}>
                                                    {t('admin.revokeAdmin')}
                                                </button>
                                            ) : null}
                                        </div>
                                    </section>
                                )}

                                <section className="admin-section">
                                    <h3><Sparkles className="w-4 h-4" /> {t('admin.setXp')}</h3>
                                    <div className="admin-inline">
                                        <input
                                            type="number"
                                            min={0}
                                            value={xpInput}
                                            onChange={e => setXpInput(e.target.value)}
                                            disabled={!canManageTarget}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => void onSetXp()}
                                            disabled={!canManageTarget}
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
                                    {!canManageTarget ? (
                                        <p className="admin-hint">
                                            {targetIsSuper ? t('admin.cannotBanSuper') : t('admin.cannotBanAdmin')}
                                        </p>
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
                                    {!canManageTarget ? (
                                        <p className="admin-hint">
                                            {targetIsSuper ? t('admin.cannotDeleteSuper') : t('admin.cannotDeleteAdmin')}
                                        </p>
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
