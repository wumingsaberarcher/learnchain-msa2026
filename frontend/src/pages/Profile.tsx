import { useEffect, useState } from 'react'
import { useAchievementStore } from '../stores/achievementStore'
import { useAiSettingsStore } from '../stores/aiSettingsStore'
import { useTranslation } from '../stores/settingsStore'
import { getChatPreferences, updateChatPreferences } from '../api/chatApi'
import { isValidPassword } from '../utils/authValidation'
import { Save, Lock } from 'lucide-react'

export default function ProfilePage() {
    const { profile, fetchProfile, updateBio, changePassword } = useAchievementStore()
    const { t } = useTranslation()
    const aiSettings = useAiSettingsStore()
    const [bio, setBio] = useState('')
    const [oldPwd, setOldPwd] = useState('')
    const [newPwd, setNewPwd] = useState('')
    const [msg, setMsg] = useState('')
    const [err, setErr] = useState('')
    const [aiKey, setAiKey] = useState(aiSettings.apiKey)
    const [aiBase, setAiBase] = useState(aiSettings.baseUrl)
    const [aiModel, setAiModel] = useState(aiSettings.model)
    const [digestEnabled, setDigestEnabled] = useState(false)

    useEffect(() => { fetchProfile() }, [fetchProfile])
    useEffect(() => { if (profile) setBio(profile.bio) }, [profile])
    useEffect(() => {
        getChatPreferences()
            .then(p => setDigestEnabled(p.dailyDigestEnabled))
            .catch(() => { /* ignore when logged out edge */ })
    }, [])

    const handleSaveBio = async () => {
        setErr('')
        const ok = await updateBio(bio)
        setMsg(ok ? t('profile.saved') : t('profile.saveFailed'))
        setTimeout(() => setMsg(''), 2500)
    }

    const handleChangePassword = async () => {
        setErr('')
        if (!isValidPassword(newPwd)) {
            setErr(t('auth.invalidPassword'))
            return
        }
        const error = await changePassword(oldPwd, newPwd)
        if (error) { setErr(error); return }
        setOldPwd('')
        setNewPwd('')
        setMsg(t('profile.pwdChanged'))
        setTimeout(() => setMsg(''), 2500)
    }

    const handleSaveAi = () => {
        aiSettings.save({
            apiKey: aiKey.trim(),
            baseUrl: aiBase.trim() || 'https://api.openai.com/v1',
            model: aiModel.trim() || 'gpt-4o-mini',
        })
        setAiBase(aiBase.trim() || 'https://api.openai.com/v1')
        setAiModel(aiModel.trim() || 'gpt-4o-mini')
        setMsg(t('profile.aiSaved'))
        setTimeout(() => setMsg(''), 2500)
    }

    const handleDigestToggle = async (checked: boolean) => {
        setErr('')
        try {
            const res = await updateChatPreferences(checked)
            setDigestEnabled(res.dailyDigestEnabled)
            setMsg(t('profile.digestSaved'))
            setTimeout(() => setMsg(''), 2500)
        } catch {
            setErr(t('profile.digestFailed'))
        }
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

                <div className="profile-section">
                    <label>{t('profile.aiTitle')}</label>
                    <p className="profile-hint">{t('profile.aiHint')}</p>
                    <div className="profile-ai-grid">
                        <div className="profile-info-item">
                            <label htmlFor="ai-key">{t('profile.aiApiKey')}</label>
                            <input
                                id="ai-key"
                                type="password"
                                className="profile-input"
                                value={aiKey}
                                onChange={e => setAiKey(e.target.value)}
                                placeholder="sk-..."
                                autoComplete="off"
                            />
                        </div>
                        <div className="profile-info-item">
                            <label htmlFor="ai-base">{t('profile.aiBaseUrl')}</label>
                            <input
                                id="ai-base"
                                type="url"
                                className="profile-input"
                                value={aiBase}
                                onChange={e => setAiBase(e.target.value)}
                                placeholder="https://api.openai.com/v1"
                            />
                        </div>
                        <div className="profile-info-item">
                            <label htmlFor="ai-model">{t('profile.aiModel')}</label>
                            <input
                                id="ai-model"
                                type="text"
                                className="profile-input"
                                value={aiModel}
                                onChange={e => setAiModel(e.target.value)}
                                placeholder="gpt-4o-mini"
                            />
                        </div>
                    </div>
                    <button type="button" className="btn btn-primary profile-save-btn" onClick={handleSaveAi}>
                        <Save className="w-4 h-4" /> {t('profile.aiSave')}
                    </button>
                </div>

                <div className="profile-section">
                    <label>{t('profile.digestTitle')}</label>
                    <p className="profile-hint">{t('profile.digestHint')}</p>
                    <label className="profile-toggle">
                        <input
                            type="checkbox"
                            checked={digestEnabled}
                            onChange={e => void handleDigestToggle(e.target.checked)}
                        />
                        <span>{t('profile.digestEnable')}</span>
                    </label>
                </div>

                {msg && <div className="profile-msg success">{msg}</div>}
                {err && <div className="profile-msg error">{err}</div>}
            </div>
        </div>
    )
}
