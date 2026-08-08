import { create } from 'zustand'
import type { AssessmentDifficulty } from '../utils/habitHelpers'
import type {
  AssessmentGradeResult,
  AssessmentQuestion,
  HabitMaterialDto,
} from '../api/assessmentApi'
import { listHabitMaterials } from '../api/assessmentApi'
import { listGroupMaterials } from '../api/habitGroupApi'

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
  practice: boolean
  habitId: number | null
  groupId: number | null
  habitName: string
  difficulty: AssessmentDifficulty
  /** Canal curriculum: backend can quiz from lesson syllabus without uploads. */
  curriculumSyllabus: boolean
  phase: AssessmentPhase
  materials: HabitMaterialDto[]
  questions: AssessmentQuestion[]
  currentIndex: number
  answers: Record<string, { selectedOptionId?: string; textAnswer?: string }>
  lastReveal: { questionId: string; correct: boolean; correctOptionId?: string } | null
  gradeResult: AssessmentGradeResult | null
  canalLine: string | null
  error: string | null
  start: (
    habitId: number,
    habitName: string,
    difficulty?: AssessmentDifficulty,
    opts?: { groupId?: number | null; source?: string | null },
  ) => Promise<void>
  startPractice: (
    groupId: number,
    groupName: string,
    difficulty?: AssessmentDifficulty,
  ) => Promise<void>
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
  practice: false,
  habitId: null as number | null,
  groupId: null as number | null,
  habitName: '',
  difficulty: 'easy' as AssessmentDifficulty,
  curriculumSyllabus: false,
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

async function loadUnionMaterials(habitId: number, groupId?: number | null): Promise<HabitMaterialDto[]> {
  const habitMats = (await listHabitMaterials(habitId)).map((m) => ({
    ...m,
    source: 'habit' as const,
  }))
  if (!groupId) return habitMats
  try {
    const groupMats = (await listGroupMaterials(groupId)).map((m) => ({
      id: m.id,
      groupId: m.groupId,
      fileName: m.fileName,
      contentType: m.contentType,
      size: m.size,
      hasText: m.hasText,
      textLength: m.textLength,
      createdAt: m.createdAt,
      source: 'group' as const,
    }))
    return [...groupMats, ...habitMats]
  } catch {
    return habitMats
  }
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  ...empty,

  start: async (habitId, habitName, difficulty = 'easy', opts) => {
    const groupId = opts?.groupId ?? null
    const curriculumSyllabus = opts?.source === 'canal_curriculum'
    set({
      ...empty,
      active: true,
      practice: false,
      habitId,
      groupId,
      habitName,
      curriculumSyllabus,
      difficulty: difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy',
      phase: 'ready',
    })
    try {
      const materials = await loadUnionMaterials(habitId, groupId)
      set({ materials })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'materials_failed' })
    }
  },

  startPractice: async (groupId, groupName, difficulty = 'easy') => {
    set({
      ...empty,
      active: true,
      practice: true,
      habitId: null,
      groupId,
      habitName: groupName,
      difficulty: difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy',
      phase: 'ready',
    })
    try {
      const groupMats = (await listGroupMaterials(groupId)).map((m) => ({
        id: m.id,
        groupId: m.groupId,
        fileName: m.fileName,
        contentType: m.contentType,
        size: m.size,
        hasText: m.hasText,
        textLength: m.textLength,
        createdAt: m.createdAt,
        source: 'group' as const,
      }))
      set({ materials: groupMats })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'materials_failed' })
    }
  },

  refreshMaterials: async () => {
    const { habitId, groupId, practice } = get()
    if (practice && groupId != null) {
      const groupMats = (await listGroupMaterials(groupId)).map((m) => ({
        id: m.id,
        groupId: m.groupId,
        fileName: m.fileName,
        contentType: m.contentType,
        size: m.size,
        hasText: m.hasText,
        textLength: m.textLength,
        createdAt: m.createdAt,
        source: 'group' as const,
      }))
      set({ materials: groupMats })
      return
    }
    if (habitId == null) return
    const materials = await loadUnionMaterials(habitId, groupId)
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
  groupId?: number | null
  source?: string | null
}) {
  if (!habit.assessmentEnabled && habit.source !== 'canal_curriculum') return
  const difficulty =
    habit.assessmentDifficulty === 'medium' || habit.assessmentDifficulty === 'hard'
      ? habit.assessmentDifficulty
      : habit.source === 'canal_curriculum'
        ? 'medium'
        : 'easy'
  const { useCompanionStore } = await import('./companionStore')
  await useAssessmentStore.getState().start(habit.id, habit.name, difficulty, {
    groupId: habit.groupId,
    source: habit.source,
  })
  useCompanionStore.getState().enterGalMode({ zoneType: 'habit', habitId: habit.id })
}

export async function triggerGroupPractice(
  group: { id: number; name: string },
  difficulty: AssessmentDifficulty = 'easy',
) {
  const { useCompanionStore } = await import('./companionStore')
  await useAssessmentStore.getState().startPractice(group.id, group.name, difficulty)
  useCompanionStore.getState().enterGalMode({ zoneType: 'daily' })
}
