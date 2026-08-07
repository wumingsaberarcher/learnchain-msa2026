import { create } from 'zustand'
import type { AssessmentDifficulty } from '../utils/habitHelpers'
import type {
  AssessmentGradeResult,
  AssessmentQuestion,
  HabitMaterialDto,
} from '../api/assessmentApi'
import { listHabitMaterials } from '../api/assessmentApi'

export type AssessmentPhase =
  | 'idle'
  | 'ready'
  | 'generating'
  | 'quiz'
  | 'revealing'
  | 'grading'
  | 'result'

interface AssessmentState {
  active: boolean
  habitId: number | null
  habitName: string
  difficulty: AssessmentDifficulty
  phase: AssessmentPhase
  materials: HabitMaterialDto[]
  questions: AssessmentQuestion[]
  currentIndex: number
  /** selected option id or text answer keyed by question id */
  answers: Record<string, { selectedOptionId?: string; textAnswer?: string }>
  lastReveal: { questionId: string; correct: boolean; correctOptionId?: string } | null
  gradeResult: AssessmentGradeResult | null
  canalLine: string | null
  error: string | null
  start: (habitId: number, habitName: string, difficulty?: AssessmentDifficulty) => Promise<void>
  refreshMaterials: () => Promise<void>
  setPhase: (phase: AssessmentPhase) => void
  setQuestions: (questions: AssessmentQuestion[]) => void
  setAnswer: (questionId: string, value: { selectedOptionId?: string; textAnswer?: string }) => void
  nextQuestion: () => void
  setReveal: (reveal: AssessmentState['lastReveal']) => void
  setGradeResult: (result: AssessmentGradeResult) => void
  setCanalLine: (line: string | null) => void
  setError: (error: string | null) => void
  close: () => void
}

const empty = {
  active: false,
  habitId: null as number | null,
  habitName: '',
  difficulty: 'easy' as AssessmentDifficulty,
  phase: 'idle' as AssessmentPhase,
  materials: [] as HabitMaterialDto[],
  questions: [] as AssessmentQuestion[],
  currentIndex: 0,
  answers: {} as Record<string, { selectedOptionId?: string; textAnswer?: string }>,
  lastReveal: null as AssessmentState['lastReveal'],
  gradeResult: null as AssessmentGradeResult | null,
  canalLine: null as string | null,
  error: null as string | null,
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  ...empty,

  start: async (habitId, habitName, difficulty = 'easy') => {
    set({
      ...empty,
      active: true,
      habitId,
      habitName,
      difficulty: difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy',
      phase: 'ready',
    })
    try {
      const materials = await listHabitMaterials(habitId)
      set({ materials })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'materials_failed' })
    }
  },

  refreshMaterials: async () => {
    const id = get().habitId
    if (id == null) return
    const materials = await listHabitMaterials(id)
    set({ materials })
  },

  setPhase: (phase) => set({ phase }),
  setQuestions: (questions) => set({ questions, currentIndex: 0, answers: {}, phase: 'quiz' }),
  setAnswer: (questionId, value) =>
    set((s) => ({ answers: { ...s.answers, [questionId]: value } })),
  nextQuestion: () =>
    set((s) => ({
      currentIndex: Math.min(s.currentIndex + 1, Math.max(0, s.questions.length - 1)),
      lastReveal: null,
      phase: 'quiz',
    })),
  setReveal: (lastReveal) => set({ lastReveal, phase: 'revealing' }),
  setGradeResult: (gradeResult) =>
    set({
      gradeResult,
      phase: 'result',
      canalLine: gradeResult.critique || gradeResult.summary,
    }),
  setCanalLine: (canalLine) => set({ canalLine }),
  setError: (error) => set({ error }),
  close: () => set({ ...empty }),
}))

/** Call after successful check-in when habit has assessment enabled. */
export async function triggerAssessmentAfterCheckIn(habit: {
  id: number
  name: string
  assessmentEnabled?: boolean
  assessmentDifficulty?: string
}) {
  if (!habit.assessmentEnabled) return
  const difficulty =
    habit.assessmentDifficulty === 'medium' || habit.assessmentDifficulty === 'hard'
      ? habit.assessmentDifficulty
      : 'easy'
  const { useCompanionStore } = await import('./companionStore')
  await useAssessmentStore.getState().start(habit.id, habit.name, difficulty)
  useCompanionStore.getState().enterGalMode({ zoneType: 'habit', habitId: habit.id })
}
