import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Loader2, Mic, Trash2, Upload, X } from 'lucide-react'
import {
  deleteHabitMaterial,
  generateAssessment,
  gradeAssessment,
  uploadHabitMaterial,
  type AssessmentQuestion,
} from '../../api/assessmentApi'
import { useAiSettingsStore } from '../../stores/aiSettingsStore'
import { useAffectionStore } from '../../stores/affectionStore'
import { useAssessmentStore } from '../../stores/assessmentStore'
import { useChatStore } from '../../stores/chatStore'
import { useTranslation } from '../../stores/settingsStore'
import { useSpeechInput } from './useSpeechInput'
import VoiceVolumeIcon from './VoiceVolumeIcon'
import './AssessmentQuizPanel.css'

function fileKind(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'md') return 'md'
  return 'txt'
}

function highlightAnswer(text: string, highlights: { start: number; end: number }[]) {
  if (!highlights.length) return [{ text, kind: 'plain' as const }]
  const sorted = [...highlights].sort((a, b) => a.start - b.start)
  const parts: { text: string; kind: 'plain' | 'hit' }[] = []
  let cursor = 0
  for (const h of sorted) {
    const start = Math.max(0, Math.min(text.length, h.start))
    const end = Math.max(start, Math.min(text.length, h.end))
    if (start > cursor) parts.push({ text: text.slice(cursor, start), kind: 'plain' })
    if (end > start) parts.push({ text: text.slice(start, end), kind: 'hit' })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), kind: 'plain' })
  return parts
}

export default function AssessmentQuizPanel({ onCanalSpeak }: { onCanalSpeak?: (line: string) => void }) {
  const { t, language } = useTranslation()
  const {
    active,
    habitId,
    habitName,
    difficulty,
    phase,
    materials,
    questions,
    currentIndex,
    answers,
    lastReveal,
    gradeResult,
    error,
    refreshMaterials,
    setPhase,
    setQuestions,
    setAnswer,
    nextQuestion,
    setReveal,
    setGradeResult,
    setError,
    close,
  } = useAssessmentStore()

  const apiKey = useAiSettingsStore((s) => s.apiKey)
  const baseUrl = useAiSettingsStore((s) => s.baseUrl)
  const model = useAiSettingsStore((s) => s.model)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null)
  const [shortDraft, setShortDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [shortResult, setShortResult] = useState<{
    explanation: string
    highlights: { start: number; end: number; reason: string }[]
    deductions: { reason: string; points: number }[]
    score: number
    maxScore: number
  } | null>(null)

  const question: AssessmentQuestion | undefined = questions[currentIndex]
  const usableMaterials = useMemo(() => materials.filter((m) => m.hasText), [materials])

  const [shortListening, setShortListening] = useState(false)

  const speech = useSpeechInput({
    language,
    onResult: (transcript) => {
      setShortDraft((prev) => (prev ? `${prev} ${transcript}` : transcript).trim())
    },
    onListeningChange: setShortListening,
  })

  useEffect(() => {
    setShortDraft(answers[question?.id ?? '']?.textAnswer ?? '')
    setShortResult(null)
  }, [question?.id, answers])

  useEffect(() => {
    if (phase === 'result' && gradeResult?.critique) {
      onCanalSpeak?.(gradeResult.critique)
    }
  }, [phase, gradeResult, onCanalSpeak])

  if (!active || habitId == null) return null

  const onUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      await uploadHabitMaterial(habitId, file)
      await refreshMaterials()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('assess.uploadFail'))
    } finally {
      setUploading(false)
    }
  }

  const onDeleteMaterial = async (mid: number) => {
    try {
      await deleteHabitMaterial(habitId, mid)
      await refreshMaterials()
      if (selectedMaterialId === mid) setSelectedMaterialId(null)
    } catch {
      setError(t('assess.deleteFail'))
    }
  }

  const startGenerate = async () => {
    if (!apiKey.trim()) {
      setError(t('chat.missingApiKey'))
      return
    }
    if (usableMaterials.length === 0) {
      setError(t('assess.needMaterial'))
      return
    }
    setBusy(true)
    setPhase('generating')
    setError(null)
    try {
      const data = await generateAssessment({
        habitId,
        apiKey,
        baseUrl,
        model,
        language,
      })
      setQuestions(data.questions)
      onCanalSpeak?.(t('assess.startLine', { name: habitName }))
    } catch (e) {
      setPhase('ready')
      setError(e instanceof Error ? e.message : t('assess.generateFail'))
    } finally {
      setBusy(false)
    }
  }

  const submitMcq = (optionId: string) => {
    if (!question || phase === 'revealing' || phase === 'grading') return
    setAnswer(question.id, { selectedOptionId: optionId })
    const correct = (question.correctOptionId || '').toLowerCase() === optionId.toLowerCase()
    setReveal({
      questionId: question.id,
      correct,
      correctOptionId: question.correctOptionId,
    })
  }

  const submitShort = async () => {
    if (!question || !shortDraft.trim()) return
    setAnswer(question.id, { textAnswer: shortDraft.trim() })
    if (currentIndex < questions.length - 1) {
      nextQuestion()
    } else {
      await finishGrade()
    }
  }

  const goNextOrFinish = async () => {
    if (!question) return
    if (currentIndex < questions.length - 1) {
      nextQuestion()
      return
    }
    await finishGrade()
  }

  const finishGrade = async () => {
    if (!apiKey.trim()) {
      setError(t('chat.missingApiKey'))
      return
    }
    setBusy(true)
    setPhase('grading')
    try {
      const payloadAnswers = questions.map((q) => ({
        questionId: q.id,
        type: q.type,
        selectedOptionId: answers[q.id]?.selectedOptionId,
        textAnswer: answers[q.id]?.textAnswer,
        question: q,
      }))
      const result = await gradeAssessment({
        habitId,
        difficulty,
        apiKey,
        baseUrl,
        model,
        language,
        answers: payloadAnswers,
      })
      setGradeResult(result)
      if (result.affection) {
        useAffectionStore.getState().applyAward({
          awarded: result.affection.awarded,
          points: result.affection.points,
          tierKey: result.affection.tierKey,
          gainedToday: result.affection.gainedToday,
          dailyCap: result.affection.dailyCap,
        })
      }
      useChatStore.getState().appendLocalExchange(
        t('assess.historyUser', { name: habitName }),
        `${result.critique}\n${result.summary}`,
      )
      // Short answer highlights from last short item if any
      const lastShort = [...result.results].reverse().find((r) => (r.highlights?.length || 0) > 0)
      if (lastShort) {
        setShortResult({
          explanation: lastShort.explanation,
          highlights: lastShort.highlights || [],
          deductions: lastShort.deductions || [],
          score: lastShort.score,
          maxScore: lastShort.maxScore,
        })
      }
    } catch (e) {
      setPhase('quiz')
      setError(e instanceof Error ? e.message : t('assess.gradeFail'))
    } finally {
      setBusy(false)
    }
  }

  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId)

  return (
    <div className="assess-panel" role="complementary" aria-label={t('assess.title')}>
      <div className="assess-panel-head">
        <div>
          <div className="assess-eyebrow">{t('assess.eyebrow')}</div>
          <h2 className="assess-title">{habitName}</h2>
          <p className="assess-sub">
            {t(`assess.diff.${difficulty}` as 'assess.diff.easy')} · {t('assess.afterCheckin')}
          </p>
        </div>
        <button type="button" className="assess-close" onClick={close} title={t('assess.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="assess-body">
        <aside className="assess-sidebar">
          <div className="assess-sidebar-title">{t('assess.materials')}</div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.md,.txt,application/pdf,text/plain,text/markdown"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void onUpload(f)
            }}
          />
          <button
            type="button"
            className="assess-upload-btn"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t('assess.upload')}
          </button>
          <ul className="assess-file-list">
            {materials.length === 0 && <li className="assess-empty">{t('assess.noMaterials')}</li>}
            {materials.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`assess-file${selectedMaterialId === m.id ? ' active' : ''}${m.hasText ? '' : ' bad'}`}
                  onClick={() => setSelectedMaterialId(m.id)}
                >
                  <FileText className="w-4 h-4" />
                  <span>
                    <strong data-kind={fileKind(m.fileName)}>{m.fileName}</strong>
                    <small>
                      {(m.size / 1024).toFixed(1)} KB
                      {m.hasText ? ` · ${m.textLength} chars` : ` · ${t('assess.noText')}`}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="assess-file-del"
                  title={t('assess.delete')}
                  onClick={() => void onDeleteMaterial(m.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {selectedMaterial && (
            <div className="assess-preview">
              <div className="assess-preview-name">{selectedMaterial.fileName}</div>
              <div className="assess-preview-meta">
                {selectedMaterial.contentType || fileKind(selectedMaterial.fileName)} ·{' '}
                {(selectedMaterial.size / 1024).toFixed(1)} KB
              </div>
              <p className="assess-preview-hint">{t('assess.previewHint')}</p>
            </div>
          )}
        </aside>

        <section className="assess-main">
          {error && (
            <div className="assess-error" role="alert">
              {error}
            </div>
          )}

          {(phase === 'ready' || phase === 'idle') && (
            <div className="assess-ready">
              <p>{usableMaterials.length ? t('assess.readyHint') : t('assess.needMaterial')}</p>
              <button
                type="button"
                className="assess-primary"
                disabled={busy || usableMaterials.length === 0}
                onClick={() => void startGenerate()}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('assess.startQuiz')}
              </button>
            </div>
          )}

          {phase === 'generating' && (
            <div className="assess-ready">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p>{t('assess.generating')}</p>
            </div>
          )}

          {(phase === 'quiz' || phase === 'revealing') && question && (
            <div className="assess-quiz">
              <div className="assess-progress">
                <div
                  className="assess-progress-bar"
                  style={{ width: `${((currentIndex + 1) / Math.max(1, questions.length)) * 100}%` }}
                />
              </div>
              <div className="assess-qmeta">
                {t('assess.questionOf', { current: currentIndex + 1, total: questions.length })}
              </div>
              <h3 className="assess-prompt">{question.prompt}</h3>

              {question.type === 'short' ? (
                <div className="assess-short">
                  <textarea
                    className="assess-textarea"
                    rows={5}
                    value={shortDraft}
                    disabled={phase === 'revealing'}
                    placeholder={t('assess.shortPlaceholder')}
                    onChange={(e) => setShortDraft(e.target.value)}
                  />
                  <div className="assess-short-actions">
                    <button
                      type="button"
                      className={`assess-mic ${shortListening ? 'listening' : ''}`}
                      disabled={!speech.supported || busy}
                      onClick={() => speech.toggle()}
                      title={speech.supported ? t('chat.voice') : t('chat.voiceUnsupported')}
                    >
                      {shortListening ? (
                        <VoiceVolumeIcon level={speech.volumeLevel} className="w-4 h-4" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="assess-primary"
                      disabled={!shortDraft.trim() || busy}
                      onClick={() => void submitShort()}
                    >
                      {currentIndex < questions.length - 1 ? t('assess.next') : t('assess.finish')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="assess-options">
                  {(question.options || []).map((opt) => {
                    const reveal = phase === 'revealing' && lastReveal?.questionId === question.id
                    const selected = answers[question.id]?.selectedOptionId === opt.id
                    const isCorrect = (lastReveal?.correctOptionId || '').toLowerCase() === opt.id.toLowerCase()
                    const cls = [
                      'assess-option',
                      selected ? 'selected' : '',
                      reveal && isCorrect ? 'correct' : '',
                      reveal && selected && !isCorrect ? 'wrong' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={cls}
                        disabled={phase === 'revealing'}
                        onClick={() => submitMcq(opt.id)}
                      >
                        <span className="assess-opt-id">{opt.id.toUpperCase()}</span>
                        <span>{opt.text}</span>
                      </button>
                    )
                  })}
                  {phase === 'revealing' && (
                    <button type="button" className="assess-primary" onClick={() => void goNextOrFinish()}>
                      {currentIndex < questions.length - 1 ? t('assess.next') : t('assess.finish')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === 'grading' && (
            <div className="assess-ready">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p>{t('assess.grading')}</p>
            </div>
          )}

          {phase === 'result' && gradeResult && (
            <div className={`assess-result ${gradeResult.passed ? 'pass' : 'fail'}`}>
              <h3>{gradeResult.passed ? t('assess.passed') : t('assess.failed')}</h3>
              <p>{gradeResult.summary}</p>
              {gradeResult.affection?.awarded != null && gradeResult.affection.awarded !== 0 && (
                <p className="assess-affection">
                  {t('assess.affectionDelta', { delta: gradeResult.affection.awarded })}
                </p>
              )}
              <ul className="assess-result-list">
                {gradeResult.results.map((r, i) => (
                  <li key={r.questionId} className={r.correct ? 'ok' : 'bad'}>
                    <strong>
                      #{i + 1} {r.correct ? '✓' : '✗'}
                    </strong>
                    <span>{r.explanation}</span>
                    {r.highlights && r.highlights.length > 0 && answers[r.questionId]?.textAnswer && (
                      <p className="assess-highlighted">
                        {highlightAnswer(answers[r.questionId]!.textAnswer!, r.highlights).map((p, idx) =>
                          p.kind === 'hit' ? (
                            <mark key={idx}>{p.text}</mark>
                          ) : (
                            <span key={idx}>{p.text}</span>
                          ),
                        )}
                      </p>
                    )}
                    {r.deductions && r.deductions.length > 0 && (
                      <ul className="assess-deductions">
                        {r.deductions.map((d, di) => (
                          <li key={di}>
                            −{d.points}: {d.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              {shortResult && (
                <p className="assess-result-note">
                  {t('assess.shortScore', {
                    score: shortResult.score,
                    max: shortResult.maxScore,
                  })}
                </p>
              )}
              <button type="button" className="assess-primary" onClick={close}>
                {t('assess.done')}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
