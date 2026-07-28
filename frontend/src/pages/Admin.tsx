import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Shield, Search, Ban, BadgeCheck, Sparkles } from 'lucide-react'
import { useHabitStore } from '../stores/habitStore'
import { useTranslation } from '../stores/settingsStore'
import {
    banUser,
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

export default function AdminPage() {
    const { isLoggedIn, currentUser } = useHabitStore()
    const { t } = useTranslation()
    const [users, setUsers] = useState<AdminUserSummary[]>([])
    const [q, setQ] = useState('')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [detail, setDetail] = useState<AdminUserDetail | null>(null)
    const [badgeIds, setBadgeIds] = useState<string[]>([])
    const [xpInput, setXpInput] = useState('')
    const [banDays, setBanDays] = useState('7')
    const [grantBadgeId, setGrantBadgeId] = useState('')
    const [msg, setMsg] = useState('')
    const [err, setErr] = useState('')
    const [loading, setLoading] = useState(false)

    const isAdmin = currentUser?.role === 'Admin'

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
        listBadgeIds().then(setBadgeIds).catch(() => setBadgeIds([]))
    }, [isLoggedIn, isAdmin, refreshList])

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
        if (!detail) return
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
        if (!detail) return
        const days = parseInt(banDays, 10)
        if (Number.isNaN(days) || days < 1) {
            setErr(t('admin.invalidBanDays'))
            return
        }
        try {
            await banUser(detail.id, days)
            flash(t('admin.banned'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    const onUnban = async () => {
        if (!detail) return
        try {
            await unbanUser(detail.id)
            flash(t('admin.unbanned'))
            await loadDetail(detail.id)
            await refreshList()
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('admin.actionFailed'))
        }
    }

    return (
        <div className="admin-page">
            <div className="admin-card">
                <div className="admin-header">
                    <Shield className="w-6 h-6" />
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
                                            disabled={detail.role === 'Admin'}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => void onSetXp()}
                                            disabled={detail.role === 'Admin'}
                                        >
                                            {t('admin.saveXp')}
                                        </button>
                                    </div>
                                </section>

                                <section className="admin-section">
                                    <h3><BadgeCheck className="w-4 h-4" /> {t('admin.badges')}</h3>
                                    <ul className="admin-badge-list">
                                        {detail.achievements.filter(a => a.unlocked).map(a => (
                                            <li key={a.badgeId}>
                                                <code>{a.badgeId}</code>
                                                <button type="button" onClick={() => void onRevoke(a.badgeId)}>
                                                    {t('admin.revoke')}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="admin-inline">
                                        <select value={grantBadgeId} onChange={e => setGrantBadgeId(e.target.value)}>
                                            {badgeIds
                                                .filter(id => !detail.achievements.find(a => a.badgeId === id && a.unlocked))
                                                .map(id => (
                                                    <option key={id} value={id}>{id}</option>
                                                ))}
                                        </select>
                                        <button type="button" className="btn btn-secondary" onClick={() => void onGrant()}>
                                            {t('admin.grant')}
                                        </button>
                                    </div>
                                </section>

                                <section className="admin-section">
                                    <h3><Ban className="w-4 h-4" /> {t('admin.banSection')}</h3>
                                    <div className="admin-inline">
                                        <input
                                            type="number"
                                            min={1}
                                            value={banDays}
                                            onChange={e => setBanDays(e.target.value)}
                                            disabled={detail.role === 'Admin'}
                                        />
                                        <span>{t('admin.days')}</span>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => void onBan()}
                                            disabled={detail.role === 'Admin'}
                                        >
                                            {t('admin.ban')}
                                        </button>
                                        <button type="button" className="btn btn-primary" onClick={() => void onUnban()}>
                                            {t('admin.unban')}
                                        </button>
                                    </div>
                                </section>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
