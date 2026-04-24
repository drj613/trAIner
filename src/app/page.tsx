import { Dumbbell } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <Dumbbell className="h-16 w-16 text-blue-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">trAIner</h1>
        <p className="text-gray-600 mb-6">
          Build prompts for your LLM, paste routine JSON, and log your lifts.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/prompts"
            className="rounded-md bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
          >
            Compile Prompt
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Open Dashboard
          </Link>
          <Link
            href="/routines/import"
            className="rounded-md bg-white px-4 py-2 text-gray-700 border border-gray-300 hover:bg-gray-100"
          >
            Import Routine
          </Link>
        </div>
      </div>
    </div>
  );
}
