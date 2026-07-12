import { useEffect, useState } from 'react'
import { useAchievementStore } from '../stores/achievementStore'
import { useTranslation } from '../stores/settingsStore'
import { Save, Lock } from 'lucide-react'

export default function ProfilePage() {
    const { profile, fetchProfile, updateBio, changePassword } = useAchievementStore()
    const { t } = useTranslation()
    const [bio, setBio] = useState('')
    const [oldPwd, setOldPwd] = useState('')
    const [newPwd, setNewPwd] = useState('')
    const [msg, setMsg] = useState('')
    const [err, setErr] = useState('')

    useEffect(() => { fetchProfile() }, [fetchProfile])
    useEffect(() => { if (profile) setBio(profile.bio) }, [profile])

    const handleSaveBio = async () => {
        setErr('')
        const ok = await updateBio(bio)
        setMsg(ok ? t('profile.saved') : t('profile.saveFailed'))
        setTimeout(() => setMsg(''), 2500)
    }

    const handleChangePassword = async () => {
        setErr('')
        const error = await changePassword(oldPwd, newPwd)
        if (error) { setErr(error); return }
        setOldPwd('')
        setNewPwd('')
        setMsg(t('profile.pwdChanged'))
        setTimeout(() => setMsg(''), 2500)
    }

    if (!profile) {
        return <div className="profile-page"><p className="profile-loading">{t('habits.loading')}</p></div>
    }

    const joinDate = new Date(profile.createdAt).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
    })

    return (
        <div className="profile-page">
            <div className="profile-card">
                <h1 className="profile-title">{t('profile.title')}</h1>
                <p className="profile-subtitle">{t('profile.subtitle')}</p>

                <div className="profile-info-grid">
                    <div className="profile-info-item">
                        <label>{t('auth.username')}</label>
                        <div className="profile-readonly">{profile.username}</div>
                    </div>
                    <div className="profile-info-item">
                        <label>{t('auth.email')}</label>
                        <div className="profile-readonly">{profile.email}</div>
                    </div>
                    <div className="profile-info-item">
                        <label>{t('profile.joined')}</label>
                        <div className="profile-readonly">{joinDate}</div>
                    </div>
                    <div className="profile-info-item">
                        <label>{t('profile.level')}</label>
                        <div className="profile-readonly">Lv.{profile.level} · {profile.totalXP} XP</div>
                    </div>
                </div>

                <div className="profile-section">
                    <label htmlFor="bio">{t('profile.bioLabel')}</label>
                    <p className="profile-hint">{t('profile.bioHint')}</p>
                    <textarea
                        id="bio"
                        className="profile-bio-input"
                        rows={5}
                        value={bio}
                        onChange={e => setBio(e.target.value)}
                        placeholder={t('profile.bioPlaceholder')}
                    />
                    <button type="button" className="btn btn-primary profile-save-btn" onClick={handleSaveBio}>
                        <Save className="w-4 h-4" /> {t('profile.saveBio')}
                    </button>
                </div>

                <div className="profile-section">
                    <label>{t('profile.changePassword')}</label>
                    <div className="profile-password-row">
                        <input
                            type="password"
                            className="profile-input"
                            placeholder={t('profile.oldPassword')}
                            value={oldPwd}
                            onChange={e => setOldPwd(e.target.value)}
                        />
                        <input
                            type="password"
                            className="profile-input"
                            placeholder={t('profile.newPassword')}
                            value={newPwd}
                            onChange={e => setNewPwd(e.target.value)}
                        />
                        <button type="button" className="btn btn-secondary" onClick={handleChangePassword}>
                            <Lock className="w-4 h-4" /> {t('profile.updatePassword')}
                        </button>
                    </div>
                </div>

                {msg && <div className="profile-msg success">{msg}</div>}
                {err && <div className="profile-msg error">{err}</div>}
            </div>
        </div>
    )
}
