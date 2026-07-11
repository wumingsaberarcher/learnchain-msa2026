import { useState } from 'react'
import { Mail, User, Lock, Sparkles, X } from 'lucide-react'
import { useHabitStore } from '../stores/habitStore'
import { useTranslation } from '../stores/languageStore'

interface LoginModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
    const { t } = useTranslation()
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [login, setLogin] = useState('')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    const { login: doLogin } = useHabitStore()

    if (!isOpen) return null

    const resetForm = () => {
        setLogin('')
        setUsername('')
        setEmail('')
        setPassword('')
        setError('')
    }

    const handleClose = () => {
        resetForm()
        onClose()
    }

    const isValidEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)

    const handleSubmit = async () => {
        setError('')

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

        if (!username || !email || !password) {
            setError(t('auth.fillRequired'))
            return
        }
        if (!isValidEmail(email)) {
            setError(t('auth.invalidEmail'))
            return
        }

        setIsLoading(true)
        try {
            const res = await fetch('http://localhost:5000/api/user/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            })

            if (!res.ok) {
                const errText = await res.text()
                setError(errText || t('auth.registerFailed'))
            } else {
                setMode('login')
                setLogin(username)
                setPassword('')
                setUsername('')
                setEmail('')
                setError('')
                alert(t('auth.registerSuccess'))
            }
        } catch {
            setError(t('auth.registerFailed'))
        }
        setIsLoading(false)
    }

    return (
        <div className="auth-modal-overlay" onClick={handleClose}>
            <div className="auth-modal" onClick={e => e.stopPropagation()}>
                <button type="button" className="auth-modal-close" onClick={handleClose}>
                    <X className="w-4 h-4" />
                </button>

                <div className="auth-modal-icon">
                    <Sparkles className="w-7 h-7" />
                </div>

                <h2 className="auth-modal-title">
                    {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
                </h2>
                <p className="auth-modal-subtitle">
                    {mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
                </p>

                <div className="auth-mode-tabs">
                    <button
                        type="button"
                        className={`auth-mode-tab${mode === 'login' ? ' active' : ''}`}
                        onClick={() => { setMode('login'); setError('') }}
                    >
                        {t('auth.login')}
                    </button>
                    <button
                        type="button"
                        className={`auth-mode-tab${mode === 'register' ? ' active' : ''}`}
                        onClick={() => { setMode('register'); setError('') }}
                    >
                        {t('auth.register')}
                    </button>
                </div>

                <div className="auth-form">
                    {mode === 'login' ? (
                        <div className="auth-field">
                            <User className="auth-field-icon" />
                            <input
                                type="text"
                                placeholder={t('auth.usernameOrEmail')}
                                value={login}
                                onChange={e => setLogin(e.target.value)}
                                className="auth-input"
                                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="auth-field">
                                <User className="auth-field-icon" />
                                <input
                                    type="text"
                                    placeholder={t('auth.username')}
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="auth-input"
                                />
                            </div>
                            <div className="auth-field">
                                <Mail className="auth-field-icon" />
                                <input
                                    type="email"
                                    placeholder={t('auth.email')}
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="auth-input"
                                />
                            </div>
                        </>
                    )}

                    <div className="auth-field">
                        <Lock className="auth-field-icon" />
                        <input
                            type="password"
                            placeholder={t('auth.password')}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="auth-input"
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        />
                    </div>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <div className="auth-actions">
                    <button type="button" className="btn-habit btn-habit-ghost" onClick={handleClose}>
                        {t('auth.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn-habit btn-habit-checkin"
                        onClick={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? t('auth.processing') : mode === 'login' ? t('auth.login') : t('auth.register')}
                    </button>
                </div>
            </div>
        </div>
    )
}
