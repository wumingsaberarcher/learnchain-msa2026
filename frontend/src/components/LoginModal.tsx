import { useState } from 'react'
import { Mail, User, Lock, Sparkles, X, KeyRound } from 'lucide-react'
import { useHabitStore } from '../stores/habitStore'
import { useTranslation } from '../stores/settingsStore'
import { API_BASE } from '../config/api'
import { isValidEmail, isValidPassword, isValidUsername } from '../utils/authValidation'

interface LoginModalProps {
    isOpen: boolean
    onClose: () => void
}

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
    const { t, language } = useTranslation()
    const [mode, setMode] = useState<AuthMode>('login')
    const [login, setLogin] = useState('')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [resetCode, setResetCode] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')

    const { login: doLogin } = useHabitStore()

    if (!isOpen) return null

    const resetForm = () => {
        setLogin('')
        setUsername('')
        setEmail('')
        setPassword('')
        setResetCode('')
        setError('')
        setInfo('')
    }

    const handleClose = () => {
        resetForm()
        setMode('login')
        onClose()
    }

    const switchMode = (next: AuthMode) => {
        setMode(next)
        setError('')
        setInfo('')
        setPassword('')
        setResetCode('')
    }

    const readErrorBody = async (res: Response) => {
        const text = await res.text()
        try {
            const json = JSON.parse(text)
            return json.message || json.title || text
        } catch {
            return text
        }
    }

    const handleSubmit = async () => {
        setError('')
        setInfo('')

        if (mode === 'login') {
            if (!login || !password) {
                setError(t('auth.fillRequired'))
                return
            }
            setIsLoading(true)
            const success = await doLogin(login, password)
            if (success) {
                handleClose()
            } else {
                setError(t('auth.loginFailed'))
            }
            setIsLoading(false)
            return
        }

        if (mode === 'register') {
            if (!username || !email || !password) {
                setError(t('auth.fillRequired'))
                return
            }
            if (!isValidUsername(username)) {
                setError(t('auth.invalidUsername'))
                return
            }
            if (!isValidEmail(email)) {
                setError(t('auth.invalidEmail'))
                return
            }
            if (!isValidPassword(password)) {
                setError(t('auth.invalidPassword'))
                return
            }

            setIsLoading(true)
            try {
                const res = await fetch(`${API_BASE}/user/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
                })

                if (!res.ok) {
                    setError((await readErrorBody(res)) || t('auth.registerFailed'))
                } else {
                    setMode('login')
                    setLogin(username.trim())
                    setPassword('')
                    setUsername('')
                    setEmail('')
                    setInfo(t('auth.registerSuccess'))
                }
            } catch {
                setError(t('auth.registerFailed'))
            }
            setIsLoading(false)
            return
        }

        if (mode === 'forgot') {
            if (!email) {
                setError(t('auth.fillRequired'))
                return
            }
            if (!isValidEmail(email)) {
                setError(t('auth.invalidEmail'))
                return
            }

            setIsLoading(true)
            try {
                const res = await fetch(`${API_BASE}/user/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.trim(), language }),
                })
                const body = await readErrorBody(res)
                if (!res.ok) {
                    setError(body || t('auth.forgotFailed'))
                } else {
                    setInfo(body || t('auth.forgotSent'))
                    setMode('reset')
                }
            } catch {
                setError(t('auth.forgotFailed'))
            }
            setIsLoading(false)
            return
        }

        // reset
        if (!email || !resetCode || !password) {
            setError(t('auth.fillRequired'))
            return
        }
        if (!isValidEmail(email)) {
            setError(t('auth.invalidEmail'))
            return
        }
        if (!isValidPassword(password)) {
            setError(t('auth.invalidPassword'))
            return
        }

        setIsLoading(true)
        try {
            const res = await fetch(`${API_BASE}/user/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim(),
                    code: resetCode.trim(),
                    newPassword: password,
                }),
            })
            const bodyText = await res.text()
            let data: { message?: string; username?: string } = {}
            try { data = JSON.parse(bodyText) } catch { /* plain text error */ }

            if (!res.ok) {
                setError(data.message || bodyText || t('auth.resetFailed'))
            } else {
                setMode('login')
                setLogin(data.username || email.trim())
                setPassword('')
                setResetCode('')
                setInfo(t('auth.resetSuccess'))
            }
        } catch {
            setError(t('auth.resetFailed'))
        }
        setIsLoading(false)
    }

    const title =
        mode === 'login' ? t('auth.welcomeBack')
            : mode === 'register' ? t('auth.createAccount')
                : mode === 'forgot' ? t('auth.forgotTitle')
                    : t('auth.resetTitle')

    const subtitle =
        mode === 'login' ? t('auth.loginSubtitle')
            : mode === 'register' ? t('auth.registerSubtitle')
                : mode === 'forgot' ? t('auth.forgotSubtitle')
                    : t('auth.resetSubtitle')

    const submitLabel =
        mode === 'login' ? t('auth.login')
            : mode === 'register' ? t('auth.register')
                : mode === 'forgot' ? t('auth.sendResetCode')
                    : t('auth.resetPassword')

    return (
        <div className="auth-modal-overlay" onClick={handleClose}>
            <div className="auth-modal" onClick={e => e.stopPropagation()}>
                <button type="button" className="auth-modal-close" onClick={handleClose}>
                    <X className="w-4 h-4" />
                </button>

                <div className="auth-modal-icon">
                    <Sparkles className="w-7 h-7" />
                </div>

                <h2 className="auth-modal-title">{title}</h2>
                <p className="auth-modal-subtitle">{subtitle}</p>

                {(mode === 'login' || mode === 'register') && (
                    <div className="auth-mode-tabs">
                        <button
                            type="button"
                            className={`auth-mode-tab${mode === 'login' ? ' active' : ''}`}
                            onClick={() => switchMode('login')}
                        >
                            {t('auth.login')}
                        </button>
                        <button
                            type="button"
                            className={`auth-mode-tab${mode === 'register' ? ' active' : ''}`}
                            onClick={() => switchMode('register')}
                        >
                            {t('auth.register')}
                        </button>
                    </div>
                )}

                <div className="auth-form">
                    {mode === 'login' && (
                        <div className="auth-field">
                            <User className="auth-field-icon" />
                            <input
                                type="text"
                                placeholder={t('auth.usernameOrEmail')}
                                value={login}
                                onChange={e => setLogin(e.target.value)}
                                className="auth-input"
                                onKeyDown={e => e.key === 'Enter' && void handleSubmit()}
                            />
                        </div>
                    )}

                    {mode === 'register' && (
                        <>
                            <div className="auth-field">
                                <User className="auth-field-icon" />
                                <input
                                    type="text"
                                    placeholder={t('auth.usernamePlaceholder')}
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="auth-input"
                                    autoComplete="username"
                                />
                            </div>
                            <p className="auth-hint">{t('auth.usernameHint')}</p>
                            <div className="auth-field">
                                <Mail className="auth-field-icon" />
                                <input
                                    type="email"
                                    placeholder={t('auth.email')}
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="auth-input"
                                    autoComplete="email"
                                />
                            </div>
                        </>
                    )}

                    {(mode === 'forgot' || mode === 'reset') && (
                        <div className="auth-field">
                            <Mail className="auth-field-icon" />
                            <input
                                type="email"
                                placeholder={t('auth.email')}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="auth-input"
                                autoComplete="email"
                            />
                        </div>
                    )}

                    {mode === 'reset' && (
                        <div className="auth-field">
                            <KeyRound className="auth-field-icon" />
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder={t('auth.resetCode')}
                                value={resetCode}
                                onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="auth-input"
                            />
                        </div>
                    )}

                    {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                        <>
                            <div className="auth-field">
                                <Lock className="auth-field-icon" />
                                <input
                                    type="password"
                                    placeholder={
                                        mode === 'reset' ? t('auth.newPassword') : t('auth.password')
                                    }
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="auth-input"
                                    onKeyDown={e => e.key === 'Enter' && void handleSubmit()}
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                />
                            </div>
                            {(mode === 'register' || mode === 'reset') && (
                                <p className="auth-hint">{t('auth.passwordHint')}</p>
                            )}
                        </>
                    )}
                </div>

                {error && <div className="auth-error">{error}</div>}
                {info && <div className="auth-info">{info}</div>}

                <div className="auth-actions">
                    <button type="button" className="btn-habit btn-habit-ghost" onClick={handleClose}>
                        {t('auth.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn-habit btn-habit-checkin"
                        onClick={() => void handleSubmit()}
                        disabled={isLoading}
                    >
                        {isLoading ? t('auth.processing') : submitLabel}
                    </button>
                </div>

                <div className="auth-footer-links">
                    {mode === 'login' && (
                        <button type="button" className="auth-text-link" onClick={() => switchMode('forgot')}>
                            {t('auth.forgotLink')}
                        </button>
                    )}
                    {mode === 'forgot' && (
                        <button type="button" className="auth-text-link" onClick={() => switchMode('login')}>
                            {t('auth.backToLogin')}
                        </button>
                    )}
                    {mode === 'reset' && (
                        <>
                            <button type="button" className="auth-text-link" onClick={() => switchMode('forgot')}>
                                {t('auth.resendCode')}
                            </button>
                            <button type="button" className="auth-text-link" onClick={() => switchMode('login')}>
                                {t('auth.backToLogin')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
