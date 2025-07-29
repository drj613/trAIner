import { Dumbbell } from 'lucide-react';

// This page is only shown briefly before middleware redirects
// No need for client-side auth checks since middleware handles it
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <Dumbbell className="h-16 w-16 text-blue-600 animate-pulse mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">trAIner</h1>
        <p className="text-gray-600">Loading your fitness journey...</p>
      </div>
    </div>
  );
}
