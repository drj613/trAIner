'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell, Plus, Calendar, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface RoutineListItem {
  id: string;
  title: string;
  duration_weeks: number;
  days_per_week: number;
  goals?: string[];
  created_at: string;
}

export default function RoutinesPage() {
  const router = useRouter();
  const [routines, setRoutines] = useState<RoutineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRoutines() {
      try {
        const res = await fetch('/api/routines');
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError('Failed to load routines');
          console.error(data);
          return;
        }
        setRoutines(data.routines ?? []);
      } catch (err) {
        setError('Failed to load routines');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchRoutines();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="flex items-center">
                <Dumbbell className="h-8 w-8 text-blue-600 mr-3" />
                <h1 className="text-xl font-semibold text-gray-900">AI Trainer</h1>
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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">My Routines</h2>
            <p className="text-gray-600 mt-1">Your imported workout routines</p>
          </div>
          <Link
            href="/routines/import"
            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            Import Routine
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Dumbbell className="h-8 w-8 text-blue-600 animate-pulse mx-auto mb-4" />
            <p className="text-gray-600">Loading routines...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        ) : routines.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Dumbbell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No routines yet</h3>
            <p className="text-gray-600 mb-4">
              Import your first routine to start tracking your workouts.
            </p>
            <Link
              href="/routines/import"
              className="inline-flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5 mr-2" />
              Import Routine
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {routines.map((routine) => (
              <Link
                key={routine.id}
                href={`/routines/${routine.id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {routine.title}
                    </h3>
                    <div className="flex items-center text-sm text-gray-600 space-x-4">
                      <span className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        {routine.duration_weeks} weeks
                      </span>
                      <span>{routine.days_per_week} days/week</span>
                      {routine.goals && routine.goals.length > 0 && (
                        <span className="text-blue-600">
                          {routine.goals.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
