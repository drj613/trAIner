'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Dumbbell } from 'lucide-react';

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <Dumbbell className="h-16 w-16 text-blue-600 animate-pulse mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">AI Trainer</h1>
        <p className="text-gray-600">Loading your fitness journey...</p>
      </div>
    </div>
  );
}
