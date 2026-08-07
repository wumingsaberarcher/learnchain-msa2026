import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Mic, Sparkles, Trash2, Upload, X } from 'lucide-react'
import {
  deleteHabitMaterial,
  generateAssessment,
  gradeAssessment,
  uploadHabitMaterial,
  type AssessmentGradeResult,
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
  if (ext === 'docx' || ext === 'doc' || ext === 'wps') return 'docx'
  if (ext === 'md' || ext === 'markdown') return 'md'
  return 'txt'
}

/** Treat as short-answer whenever options are missing/unusable (avoids blank quiz UI). */
function isShortQuestion(q: AssessmentQuestion) {
  const t = (q.type || '').toLowerCase()
  if (
    t.includes('short')
    || t.includes('essay')
    || t === 'qa'
    || t.includes('open')
    || t.includes('text')
  ) {
    return true
  }
  const usable = (q.options || []).filter((o) => (o.text || '').trim().length > 0)
  return usable.length < 2
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

function buildWrongReviewPrompt(
  result: AssessmentGradeResult,
  questions: AssessmentQuestion[],
  answers: Record<string, { selectedOptionId?: string; textAnswer?: string }>,
  zh: boolean,
): string | null {
  const wrongs = result.results.filter((r) => !r.correct)
  if (wrongs.length === 0) return null

  const blocks = wrongs.map((r, i) => {
    const q = questions.find((x) => x.id === r.questionId)
    const a = answers[r.questionId]
    const prompt = q?.prompt?.trim() || `(Q ${r.questionId})`
    if (q && !isShortQuestion(q)) {
      const userOpt = (q.options || []).find(
        (o) => o.id.toLowerCase() === (a?.selectedOptionId || '').toLowerCase(),
      )
      const correctOpt = (q.options || []).find(
        (o) => o.id.toLowerCase() === (r.correctOptionId || q.correctOptionId || '').toLowerCase(),
      )
      const opts = (q.options || []).map((o) => `  ${o.id.toUpperCase()}. ${o.text}`).join('\n')
      return zh
        ? `【错题 ${i + 1}】\n题干：${prompt}\n选项：\n${opts}\n我的选择：${(a?.selectedOptionId || '?').toUpperCase()} ${userOpt?.text || ''}\n正确答案：${(r.correctOptionId || q.correctOptionId || '?').toUpperCase()} ${correctOpt?.text || ''}\n批改备注：${r.explanation || '无'}`
        : `[Miss ${i + 1}]\nPrompt: ${prompt}\nOptions:\n${opts}\nMy pick: ${(a?.selectedOptionId || '?').toUpperCase()} ${userOpt?.text || ''}\nCorrect: ${(r.correctOptionId || q.correctOptionId || '?').toUpperCase()} ${correctOpt?.text || ''}\nGrader note: ${r.explanation || 'n/a'}`
    }
    return zh
      ? `【错题 ${i + 1}】\n题干：${prompt}\n我的作答：${a?.textAnswer || '（空）'}\n参考要点：${q?.referenceAnswer || '无'}\n批改备注：${r.explanation || '无'}`
      : `[Miss ${i + 1}]\nPrompt: ${prompt}\nMy answer: ${a?.textAnswer || '(empty)'}\nReference: ${q?.referenceAnswer || 'n/a'}\nGrader note: ${r.explanation || 'n/a'}`
  })

  return zh
    ? `我刚完成习惯考核，以下是错题明细。请用 Canal 的口吻逐题讲解：\n1) 我为什么选错/答错；\n2) 正确思路；\n3) 对应关键知识点（结合资料，简洁清楚，可用小标题/列表）。\n不要复述整份卷子，只讲错题。\n\n${blocks.join('\n\n')}`
    : `I just finished a habit assessment. Here are my misses. Please explain each in Canal's voice:\n1) why my choice/answer was wrong;\n2) the correct reasoning;\n3) the key knowledge point (tied to the materials; keep it clear with short lists).\nOnly cover the misses.\n\n${blocks.join('\n\n')}`
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
  const sendMessage = useChatStore((s) => s.sendMessage)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  /** Visible step-by-step upload log (also mirrored to console). */
  const [uploadTrace, setUploadTrace] = useState<{ ok: boolean | null; text: string }[]>([])
  const [uploadOutcome, setUploadOutcome] = useState<'ok' | 'fail' | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [shortDraft, setShortDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [shortResult, setShortResult] = useState<{
    explanation: string
    highlights: { start: number; end: number; reason: string }[]
    deductions: { reason: string; points: number }[]
    score: number
    maxScore: number
  } | null>(null)
  const [shortListening, setShortListening] = useState(false)
  const explainedRef = useRef<string | null>(null)

  const question: AssessmentQuestion | undefined = questions[currentIndex]
  const usableMaterials = useMemo(() => materials.filter((m) => m.hasText), [materials])
  const selectedUsable = useMemo(
    () => usableMaterials.filter((m) => selectedIds.includes(m.id)),
    [usableMaterials, selectedIds],
  )

  useEffect(() => {
    setSelectedIds((prev) => {
      const usableIds = usableMaterials.map((m) => m.id)
      if (usableIds.length === 0) return []
      if (prev.length === 0) return usableIds
      const kept = prev.filter((id) => usableIds.includes(id))
      const added = usableIds.filter((id) => !prev.includes(id))
      return [...kept, ...added]
    })
  }, [usableMaterials])

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

  const askCanalAboutWrongs = async (
    result: AssessmentGradeResult,
    qs: AssessmentQuestion[],
    ans: Record<string, { selectedOptionId?: string; textAnswer?: string }>,
  ) => {
    const zh = language.startsWith('zh')
    const prompt = buildWrongReviewPrompt(result, qs, ans, zh)
    if (!prompt) {
      onCanalSpeak?.(t('assess.explainNone'))
      return
    }
    if (!apiKey.trim()) {
      setError(t('chat.missingApiKey'))
      return
    }
    setExplaining(true)
    onCanalSpeak?.(t('assess.explainIntro'))
    try {
      await sendMessage(prompt, language)
    } catch {
      setError(t('assess.explainFail'))
    } finally {
      setExplaining(false)
    }
  }

  useEffect(() => {
    if (phase !== 'result' || !gradeResult) return
    const key = `${habitId}-${gradeResult.summary}-${gradeResult.correctCount}`
    if (explainedRef.current === key) return
    explainedRef.current = key
    if (gradeResult.results.some((r) => !r.correct)) return
    if (gradeResult.critique) onCanalSpeak?.(gradeResult.critique)
  }, [phase, gradeResult, habitId, onCanalSpeak])

  if (!active || habitId == null) return null

  const toggleMaterial = (id: number, hasText: boolean) => {
    if (!hasText) return
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectAllUsable = () => setSelectedIds(usableMaterials.map((m) => m.id))
  const clearSelection = () => setSelectedIds([])

  const pushTrace = (text: string, ok: boolean | null = null) => {
    console.info('[AssessUpload]', text)
    setUploadTrace((prev) => [...prev, { ok, text }])
  }

  const onUpload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    setUploadTrace([])
    setUploadOutcome(null)
    setError(null)

    if (list.length === 0) {
      pushTrace('未选中任何文件（可能点了取消）', false)
      setUploadOutcome('fail')
      setError('未选中任何文件')
      return
    }
    if (habitId == null) {
      pushTrace('habitId 为空，无法上传', false)
      setUploadOutcome('fail')
      setError('考核会话异常（habitId 缺失），请关闭后重新打卡进入')
      return
    }

    setUploading(true)
    pushTrace(`开始上传 · habitId=${habitId} · 共 ${list.length} 个文件`, true)
    const failures: string[] = []
    const warnings: string[] = []
    let okCount = 0
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i]
        setUploadProgress(`${i + 1}/${list.length}`)
        pushTrace(`—— 文件 ${i + 1}/${list.length}: ${file.name}`, null)
        try {
          const dto = await uploadHabitMaterial(habitId, file, (step, detail) => {
            pushTrace(detail ? `${step} · ${detail}` : step, step.startsWith('失败') ? false : true)
          })
          okCount += 1
          if (!dto.hasText || dto.warning) {
            warnings.push(`${file.name}: ${dto.warning || t('assess.noText')}`)
          }
        } catch (e) {
          const reason = e instanceof Error ? e.message : t('assess.uploadFail')
          failures.push(`${file.name}: ${reason}`)
          pushTrace(`文件失败: ${reason}`, false)
        }
      }

      pushTrace('刷新资料列表…', null)
      try {
        await refreshMaterials()
        const n = useAssessmentStore.getState().materials.length
        pushTrace(`列表已刷新 · 当前共 ${n} 份资料`, true)
      } catch (e) {
        const reason = e instanceof Error ? e.message : t('assess.uploadRefreshFail')
        pushTrace(`刷新列表失败: ${reason}`, false)
        if (failures.length === 0) {
          failures.push(t('assess.uploadRefreshFail'))
        }
      }

      if (failures.length > 0) {
        setUploadOutcome('fail')
        setError(
          failures.length === list.length
            ? failures.join('\n')
            : t('assess.uploadPartial', { ok: okCount, fail: failures.length }) +
              '\n' +
              failures.join('\n'),
        )
      } else if (warnings.length > 0) {
        setUploadOutcome('ok')
        setError(warnings.join('\n'))
        pushTrace(`全部请求成功，但有警告（${warnings.length}）`, true)
      } else {
        setUploadOutcome('ok')
        setError(null)
        pushTrace(`全部成功（${okCount}/${list.length}）`, true)
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      pushTrace(`未捕获异常: ${reason}`, false)
      setUploadOutcome('fail')
      setError(reason)
    } finally {
      setUploadProgress(null)
      setUploading(false)
    }
  }

  const onDeleteMaterial = async (mid: number) => {
    try {
      await deleteHabitMaterial(habitId, mid)
      await refreshMaterials()
      setSelectedIds((prev) => prev.filter((id) => id !== mid))
    } catch {
      setError(t('assess.deleteFail'))
    }
  }

  const startGenerate = async () => {
    if (!apiKey.trim()) {
      setError(t('chat.missingApiKey'))
      return
    }
    if (selectedUsable.length === 0) {
      setError(t('assess.needSelectMaterial'))
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
        materialIds: selectedUsable.map((m) => m.id),
      })
      const normalized = data.questions.map((q) =>
        isShortQuestion(q) ? { ...q, type: 'short' } : { ...q, type: 'mcq' },
      )
      setQuestions(normalized)
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

  const finishGrade = async (
    answerOverride?: Record<string, { selectedOptionId?: string; textAnswer?: string }>,
  ) => {
    if (!apiKey.trim()) {
      setError(t('chat.missingApiKey'))
      return
    }
    setBusy(true)
    setPhase('grading')
    try {
      const latestAnswers = {
        ...useAssessmentStore.getState().answers,
        ...answerOverride,
      }
      const payloadAnswers = questions.map((q) => {
        const asShort = isShortQuestion(q)
        const normalized = asShort ? { ...q, type: 'short' as const } : { ...q, type: 'mcq' as const }
        return {
          questionId: q.id,
          type: asShort ? 'short' : 'mcq',
          selectedOptionId: latestAnswers[q.id]?.selectedOptionId,
          textAnswer: latestAnswers[q.id]?.textAnswer,
          question: normalized,
        }
      })
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
      if (result.results.some((r) => !r.correct)) {
        void askCanalAboutWrongs(result, questions, latestAnswers)
      }
    } catch (e) {
      setPhase('quiz')
      setError(e instanceof Error ? e.message : t('assess.gradeFail'))
    } finally {
      setBusy(false)
    }
  }

  const submitShort = async () => {
    if (!question || !shortDraft.trim() || busy) return
    const textAnswer = shortDraft.trim()
    setAnswer(question.id, { textAnswer })
    if (currentIndex < questions.length - 1) {
      nextQuestion()
    } else {
      await finishGrade({ [question.id]: { textAnswer } })
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

  const wrongCount = gradeResult?.results.filter((r) => !r.correct).length ?? 0

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
          <p className="assess-select-hint">{t('assess.selectHint')}</p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.wps,.md,.txt,application/pdf,text/plain,text/markdown"
            hidden
            onChange={(e) => {
              const files = e.target.files
              console.info('[AssessUpload] input onChange', {
                count: files?.length ?? 0,
                names: files ? Array.from(files).map((f) => f.name) : [],
              })
              // Keep FileList copy before clearing the input value.
              const copied = files?.length ? Array.from(files) : []
              e.target.value = ''
              if (copied.length) void onUpload(copied)
              else {
                setUploadTrace([{ ok: false, text: '文件选择对话框关闭且未选中文件' }])
                setUploadOutcome('fail')
              }
            }}
          />
          <button
            type="button"
            className="assess-upload-btn"
            disabled={uploading}
            onClick={() => {
              console.info('[AssessUpload] open file picker', { habitId })
              setUploadTrace([{ ok: null, text: '已打开文件选择框，请选择文件…' }])
              setUploadOutcome(null)
              fileRef.current?.click()
            }}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading && uploadProgress
              ? t('assess.uploadingProgress', { current: uploadProgress.split('/')[0], total: uploadProgress.split('/')[1] || '?' })
              : t('assess.upload')}
          </button>
          {uploadTrace.length > 0 && (
            <div
              className={`assess-upload-trace${uploadOutcome === 'ok' ? ' ok' : ''}${uploadOutcome === 'fail' ? ' fail' : ''}`}
              role="status"
              aria-live="polite"
            >
              <div className="assess-upload-trace-title">
                {uploadOutcome === 'ok'
                  ? '上传完成'
                  : uploadOutcome === 'fail'
                    ? '上传未成功（见下方卡在哪一步）'
                    : uploading
                      ? '上传进行中…'
                      : '上传日志'}
              </div>
              <ol>
                {uploadTrace.map((row, i) => (
                  <li key={`${i}-${row.text.slice(0, 24)}`} className={row.ok === false ? 'bad' : row.ok ? 'good' : ''}>
                    {row.ok === true ? '✓ ' : row.ok === false ? '✗ ' : '· '}
                    {row.text}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {error && (
            <div className="assess-error assess-error-sidebar" role="alert">
              {error}
            </div>
          )}
          {usableMaterials.length > 0 && (
            <div className="assess-select-actions">
              <button type="button" onClick={selectAllUsable}>{t('assess.selectAll')}</button>
              <button type="button" onClick={clearSelection}>{t('assess.selectNone')}</button>
              <span>{t('assess.selectedCount', { n: selectedUsable.length })}</span>
            </div>
          )}
          <ul className="assess-file-list">
            {materials.length === 0 && <li className="assess-empty">{t('assess.noMaterials')}</li>}
            {materials.map((m) => {
              const kind = fileKind(m.fileName)
              const selected = selectedIds.includes(m.id)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`assess-file${selected ? ' selected' : ''}${m.hasText ? '' : ' bad'}`}
                    onClick={() => toggleMaterial(m.id, m.hasText)}
                    disabled={!m.hasText}
                    aria-pressed={selected}
                    title={m.hasText ? `${m.fileName}\n${t('assess.toggleSelect')}` : t('assess.noText')}
                  >
                    <span className={`assess-file-badge kind-${kind}`} aria-hidden>
                      {kind === 'pdf' ? 'PDF' : kind.toUpperCase()}
                    </span>
                    <span className="assess-file-copy">
                      <strong>{m.fileName}</strong>
                      <small>
                        {(m.size / 1024).toFixed(1)} KB
                        {m.hasText ? ` · ${m.textLength} chars` : ` · ${t('assess.noText')}`}
                      </small>
                    </span>
                    <span className={`assess-file-check${selected ? ' on' : ''}`} aria-hidden>
                      {selected ? <Check className="w-3.5 h-3.5" /> : null}
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
              )
            })}
          </ul>
        </aside>

        <section className="assess-main">
          {error && (
            <div className="assess-error" role="alert">
              {error}
            </div>
          )}

          {(phase === 'ready' || phase === 'idle') && (
            <div className="assess-ready">
              <p>
                {usableMaterials.length === 0
                  ? t('assess.needMaterial')
                  : selectedUsable.length === 0
                    ? t('assess.needSelectMaterial')
                    : t('assess.readyHintSelected', { n: selectedUsable.length })}
              </p>
              <button
                type="button"
                className="assess-primary"
                disabled={busy || selectedUsable.length === 0}
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
                {t('assess.questionOf', {
                  current: currentIndex + 1,
                  total: questions.length,
                })}
                {' · '}
                {isShortQuestion(question) ? t('assess.typeShort') : t('assess.typeMcq')}
              </div>
              <h3 className="assess-prompt">{question.prompt}</h3>

              {!isShortQuestion(question) ? (
                <div className="assess-options">
                  {(question.options || []).map((o) => {
                    const revealing = phase === 'revealing' && lastReveal?.questionId === question.id
                    const picked = answers[question.id]?.selectedOptionId === o.id
                    const isCorrect =
                      revealing
                      && (o.id.toLowerCase() === (lastReveal?.correctOptionId || '').toLowerCase())
                    const isWrongPick = revealing && picked && !lastReveal?.correct
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className={`assess-option${picked ? ' selected' : ''}${isCorrect ? ' correct' : ''}${isWrongPick ? ' wrong' : ''}`}
                        disabled={phase === 'revealing' || busy}
                        onClick={() => submitMcq(o.id)}
                      >
                        <span className="assess-opt-id">{o.id.toUpperCase()}</span>
                        <span>{o.text}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="assess-short">
                  <textarea
                    value={shortDraft}
                    onChange={(e) => setShortDraft(e.target.value)}
                    placeholder={t('assess.shortPlaceholder')}
                    rows={5}
                    disabled={busy}
                  />
                  <div className="assess-short-actions">
                    <button
                      type="button"
                      className={`assess-mic${shortListening ? ' listening' : ''}`}
                      onClick={() => (shortListening ? speech.stop() : speech.start())}
                      title={t('chat.voice')}
                    >
                      {shortListening
                        ? <VoiceVolumeIcon level={speech.volumeLevel} className="w-4 h-4" />
                        : <Mic className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      className="assess-primary"
                      disabled={busy || !shortDraft.trim()}
                      onClick={() => void submitShort()}
                    >
                      {t('assess.submitAnswer')}
                    </button>
                  </div>
                </div>
              )}

              {phase === 'revealing' && lastReveal?.questionId === question.id && (
                <div className="assess-reveal-bar">
                  <span>
                    {lastReveal.correct
                      ? t('assess.revealCorrect')
                      : t('assess.revealWrong', {
                          answer: (lastReveal.correctOptionId || '?').toUpperCase(),
                        })}
                  </span>
                  <button type="button" className="assess-primary" onClick={() => void goNextOrFinish()}>
                    {currentIndex < questions.length - 1 ? t('assess.next') : t('assess.finish')}
                  </button>
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
              <div className="assess-result-actions">
                {wrongCount > 0 && (
                  <button
                    type="button"
                    className="assess-secondary"
                    disabled={explaining || busy}
                    onClick={() => void askCanalAboutWrongs(gradeResult, questions, answers)}
                  >
                    {explaining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {t('assess.askCanalExplain')}
                  </button>
                )}
                <button type="button" className="assess-primary" onClick={close}>
                  {t('assess.done')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
