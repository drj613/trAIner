'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Dumbbell,
  ArrowLeft,
  Save,
  Check,
  History,
} from 'lucide-react';
import Link from 'next/link';

interface RoutineSet {
  set_number: number;
  reps: number;
  target_rpe?: number;
  rep_range?: string;
}

interface RoutineExercise {
  exercise_id: string;
  name: string;
  sets: RoutineSet[];
}

interface RoutineDay {
  day_number: number;
  title: string;
  exercises: RoutineExercise[];
}

interface RoutineWeek {
  week_number: number;
  days: RoutineDay[];
}

interface RoutineDetail {
  routine_id: string;
  title: string;
  weeks: RoutineWeek[];
}

interface SetLog {
  set_number: number;
  reps: number;
  weight: number;
  rpe?: number;
  notes?: string;
}

interface ExerciseLog {
  exercise_id: string;
  sets: SetLog[];
}

interface WorkoutHistory {
  workout_log_id: string;
  date: string;
  exercises: Array<{
    exercise_id: string;
    sets: SetLog[];
  }>;
}

export default function LogWorkoutPage() {
  const router = useRouter();
  const params = useParams();
  const routineId = params.id as string;

  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [history, setHistory] = useState<WorkoutHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(1);
  const [workoutDate, setWorkoutDate] = useState(new Date().toISOString().split('T')[0]);
  const [exerciseLogs, setExerciseLogs] = useState<Map<string, SetLog[]>>(new Map());

  const initializeLogForDay = useCallback((day: RoutineDay) => {
    const newLogs = new Map<string, SetLog[]>();
    day.exercises.forEach((ex) => {
      const sets = ex.sets.map((s) => ({
        set_number: s.set_number,
        reps: s.reps,
        weight: 0,
        rpe: s.target_rpe,
      }));
      newLogs.set(ex.exercise_id, sets);
    });
    setExerciseLogs(newLogs);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [routineRes, historyRes] = await Promise.all([
          fetch(`/api/routines/${routineId}`),
          fetch(`/api/routines/${routineId}/workouts`),
        ]);

        if (!routineRes.ok) {
          setError('Routine not found');
          return;
        }

        const routineData = await routineRes.json();
        setRoutine(routineData);

        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setHistory(historyData.workouts || []);
        }

        // Initialize log for first day
        if (routineData.weeks?.[0]?.days?.[0]) {
          initializeLogForDay(routineData.weeks[0].days[0]);
        }
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (routineId) {
      fetchData();
    }
  }, [routineId, initializeLogForDay]);

  const currentDay = routine?.weeks?.find((w) => w.week_number === selectedWeek)?.days?.find(
    (d) => d.day_number === selectedDay
  );

  const handleDayChange = (weekNum: number, dayNum: number) => {
    setSelectedWeek(weekNum);
    setSelectedDay(dayNum);
    const day = routine?.weeks?.find((w) => w.week_number === weekNum)?.days?.find(
      (d) => d.day_number === dayNum
    );
    if (day) {
      initializeLogForDay(day);
    }
    setSuccess(false);
  };

  const updateSet = (exerciseId: string, setNumber: number, field: keyof SetLog, value: number | string) => {
    setExerciseLogs((prev) => {
      const newMap = new Map(prev);
      const sets = [...(newMap.get(exerciseId) || [])];
      const setIdx = sets.findIndex((s) => s.set_number === setNumber);
      if (setIdx >= 0) {
        sets[setIdx] = { ...sets[setIdx], [field]: value };
        newMap.set(exerciseId, sets);
      }
      return newMap;
    });
  };

  const getLastWeight = (exerciseId: string): number | null => {
    for (const workout of history) {
      const ex = workout.exercises?.find((e) => e.exercise_id === exerciseId);
      if (ex?.sets?.[0]?.weight) {
        return ex.sets[0].weight;
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!currentDay) return;

    setSaving(true);
    setError(null);

    const exercises: ExerciseLog[] = [];
    exerciseLogs.forEach((sets, exercise_id) => {
      exercises.push({ exercise_id, sets });
    });

    try {
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routine_id: routineId,
          date: workoutDate,
          exercises,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Failed to save workout');
        return;
      }

      setSuccess(true);
      // Refresh history
      const historyRes = await fetch(`/api/routines/${routineId}/workouts`);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData.workouts || []);
      }
    } catch (err) {
      setError('Failed to save workout');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Dumbbell className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="flex items-center">
                <Dumbbell className="h-8 w-8 text-blue-600 mr-3" />
                <span className="text-xl font-semibold text-gray-900">AI Trainer</span>
              </Link>
            </div>
            <button
              onClick={() => router.push('/')}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Home
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
        <Link
          href={`/routines/${routineId}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Routine
        </Link>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 mb-4 flex items-center">
            <Check className="h-5 w-5 mr-2" />
            Workout saved successfully!
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-4">{routine?.title}</h1>

          {/* Day Selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            {routine?.weeks?.map((week) =>
              week.days.map((day) => {
                const isSelected =
                  week.week_number === selectedWeek && day.day_number === selectedDay;
                return (
                  <button
                    key={`${week.week_number}-${day.day_number}`}
                    onClick={() => handleDayChange(week.week_number, day.day_number)}
                    className={`px-3 py-1 text-sm rounded-full border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                    }`}
                  >
                    W{week.week_number}D{day.day_number}
                  </button>
                );
              })
            )}
          </div>

          {/* Date Picker */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={workoutDate}
              onChange={(e) => setWorkoutDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Exercise Logs */}
        {currentDay && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {currentDay.title}
            </h2>

            {currentDay.exercises.map((ex) => {
              const lastWeight = getLastWeight(ex.exercise_id);
              const sets = exerciseLogs.get(ex.exercise_id) || [];

              return (
                <div
                  key={ex.exercise_id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-medium text-gray-900">{ex.name}</h3>
                    {lastWeight !== null && (
                      <span className="flex items-center text-xs text-gray-500">
                        <History className="h-3 w-3 mr-1" />
                        Last: {lastWeight} lbs
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium">
                      <div className="col-span-1">Set</div>
                      <div className="col-span-3">Weight</div>
                      <div className="col-span-3">Reps</div>
                      <div className="col-span-2">RPE</div>
                      <div className="col-span-3">Notes</div>
                    </div>

                    {sets.map((set) => (
                      <div key={set.set_number} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-1 text-sm text-gray-600">{set.set_number}</div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            value={set.weight || ''}
                            onChange={(e) =>
                              updateSet(ex.exercise_id, set.set_number, 'weight', parseFloat(e.target.value) || 0)
                            }
                            placeholder="lbs"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            value={set.reps || ''}
                            onChange={(e) =>
                              updateSet(ex.exercise_id, set.set_number, 'reps', parseInt(e.target.value) || 0)
                            }
                            placeholder="reps"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            value={set.rpe || ''}
                            onChange={(e) =>
                              updateSet(ex.exercise_id, set.set_number, 'rpe', parseFloat(e.target.value) || 0)
                            }
                            placeholder="RPE"
                            min="1"
                            max="10"
                            step="0.5"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="text"
                            value={(set as SetLog & { notes?: string }).notes || ''}
                            onChange={(e) =>
                              updateSet(ex.exercise_id, set.set_number, 'notes', e.target.value)
                            }
                            placeholder="notes"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
              ) : (
                <Save className="h-5 w-5 mr-2" />
              )}
              {saving ? 'Saving...' : 'Save Workout'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
