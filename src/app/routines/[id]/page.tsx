'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Dumbbell,
  ArrowLeft,
  Calendar,
  Clock,
  ChevronDown,
  ChevronRight,
  Play,
} from 'lucide-react';
import Link from 'next/link';

interface RoutineExercise {
  exercise_id: string;
  name: string;
  movement_pattern?: string;
  primary_muscles?: string[];
  rest_seconds?: number;
  notes?: string;
  alternatives?: string[];
  sets: Array<{
    set_number: number;
    reps: number;
    target_rpe?: number;
    rep_range?: string;
  }>;
}

interface RoutineDay {
  day_number: number;
  title: string;
  focus?: string[];
  exercises: RoutineExercise[];
}

interface RoutineWeek {
  week_number: number;
  days: RoutineDay[];
}

interface RoutineDetail {
  routine_id: string;
  schema_version: string;
  title: string;
  duration_weeks: number;
  days_per_week: number;
  goals?: string[];
  equipment?: string[];
  notes?: string;
  weeks: RoutineWeek[];
}

export default function RoutineDetailPage() {
  const router = useRouter();
  const params = useParams();
  const routineId = params.id as string;

  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1]));
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchRoutine() {
      try {
        const res = await fetch(`/api/routines/${routineId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Routine not found');
          } else {
            setError('Failed to load routine');
          }
          return;
        }
        const data = await res.json();
        setRoutine(data);
        // Expand week 1, day 1 by default
        if (data.weeks && data.weeks.length > 0) {
          setExpandedWeeks(new Set([1]));
          if (data.weeks[0].days && data.weeks[0].days.length > 0) {
            setExpandedDays(new Set(['1-1']));
          }
        }
      } catch (err) {
        setError('Failed to load routine');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (routineId) {
      fetchRoutine();
    }
  }, [routineId]);

  const toggleWeek = (weekNum: number) => {
    const newSet = new Set(expandedWeeks);
    if (newSet.has(weekNum)) {
      newSet.delete(weekNum);
    } else {
      newSet.add(weekNum);
    }
    setExpandedWeeks(newSet);
  };

  const toggleDay = (key: string) => {
    const newSet = new Set(expandedDays);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setExpandedDays(newSet);
  };

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
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <Link
          href="/routines"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Routines
        </Link>

        {loading ? (
          <div className="text-center py-12">
            <Dumbbell className="h-8 w-8 text-blue-600 animate-pulse mx-auto mb-4" />
            <p className="text-gray-600">Loading routine...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        ) : routine ? (
          <>
            {/* Routine Header */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">{routine.title}</h1>
                  <div className="flex items-center text-sm text-gray-600 space-x-4 mb-4">
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {routine.duration_weeks} weeks
                    </span>
                    <span>{routine.days_per_week} days/week</span>
                  </div>
                  {routine.goals && routine.goals.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {routine.goals.map((goal) => (
                        <span
                          key={goal}
                          className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-full"
                        >
                          {goal}
                        </span>
                      ))}
                    </div>
                  )}
                  {routine.equipment && routine.equipment.length > 0 && (
                    <p className="text-sm text-gray-600">
                      <strong>Equipment:</strong> {routine.equipment.join(', ')}
                    </p>
                  )}
                  {routine.notes && (
                    <p className="text-sm text-gray-600 mt-2">{routine.notes}</p>
                  )}
                </div>
                <Link
                  href={`/routines/${routineId}/log`}
                  className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Log Workout
                </Link>
              </div>
            </div>

            {/* Weeks */}
            <div className="space-y-4">
              {routine.weeks.map((week) => (
                <div
                  key={week.week_number}
                  className="bg-white rounded-lg shadow-sm border border-gray-200"
                >
                  <button
                    onClick={() => toggleWeek(week.week_number)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                  >
                    <span className="font-semibold text-gray-900">Week {week.week_number}</span>
                    {expandedWeeks.has(week.week_number) ? (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}
                  </button>

                  {expandedWeeks.has(week.week_number) && (
                    <div className="border-t border-gray-200">
                      {week.days.map((day) => {
                        const dayKey = `${week.week_number}-${day.day_number}`;
                        return (
                          <div key={dayKey} className="border-b border-gray-100 last:border-b-0">
                            <button
                              onClick={() => toggleDay(dayKey)}
                              className="w-full flex items-center justify-between p-4 pl-8 text-left hover:bg-gray-50"
                            >
                              <div>
                                <span className="font-medium text-gray-900">
                                  Day {day.day_number}: {day.title}
                                </span>
                                {day.focus && day.focus.length > 0 && (
                                  <span className="ml-2 text-sm text-gray-500">
                                    ({day.focus.join(', ')})
                                  </span>
                                )}
                              </div>
                              {expandedDays.has(dayKey) ? (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )}
                            </button>

                            {expandedDays.has(dayKey) && (
                              <div className="px-8 pb-4 space-y-3">
                                {day.exercises.map((ex, idx) => (
                                  <div
                                    key={ex.exercise_id}
                                    className="bg-gray-50 rounded-lg p-4"
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div>
                                        <span className="text-sm text-gray-500 mr-2">
                                          {idx + 1}.
                                        </span>
                                        <span className="font-medium text-gray-900">
                                          {ex.name}
                                        </span>
                                        {ex.movement_pattern && (
                                          <span className="ml-2 text-xs text-gray-500">
                                            ({ex.movement_pattern})
                                          </span>
                                        )}
                                      </div>
                                      {ex.rest_seconds && (
                                        <span className="flex items-center text-xs text-gray-500">
                                          <Clock className="h-3 w-3 mr-1" />
                                          {ex.rest_seconds}s rest
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      {ex.sets.length} sets ×{' '}
                                      {ex.sets[0]?.rep_range || `${ex.sets[0]?.reps} reps`}
                                      {ex.sets[0]?.target_rpe && ` @ RPE ${ex.sets[0].target_rpe}`}
                                    </div>
                                    {ex.primary_muscles && ex.primary_muscles.length > 0 && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {ex.primary_muscles.join(', ')}
                                      </div>
                                    )}
                                    {ex.alternatives && ex.alternatives.length > 0 && (
                                      <div className="text-xs text-blue-600 mt-1">
                                        Alternatives: {ex.alternatives.join(', ')}
                                      </div>
                                    )}
                                    {ex.notes && (
                                      <div className="text-xs text-gray-500 mt-1 italic">
                                        {ex.notes}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
