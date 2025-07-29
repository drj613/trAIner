'use client';

import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function DebugPage() {
  const { user, profile, loading, session } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [directSession, setDirectSession] = useState<any>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
    
    // Test direct Supabase client
    const testDirectClient = async () => {
      try {
        const supabase = createClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        setDirectSession(session);
        setDebugLogs(prev => [...prev, `Direct session check: ${session ? 'Found' : 'None'}, Error: ${error?.message || 'None'}`]);
        
        if (session) {
          // Test profile fetch
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', session.user.id)
            .single();
          
          setDebugLogs(prev => [...prev, `Profile fetch: ${profileData ? 'Success' : 'Failed'}, Error: ${profileError?.message || 'None'}`]);
        }
      } catch (error) {
        setDebugLogs(prev => [...prev, `Direct client error: ${error}`]);
      }
    };

    testDirectClient();
  }, []);

  const refreshAuth = () => {
    window.location.reload();
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Auth Debug Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Auth Context State:</h2>
          <div className="space-y-1 text-sm">
            <p><strong>Mounted:</strong> {mounted ? 'Yes' : 'No'}</p>
            <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
            <p><strong>User:</strong> {user ? user.email : 'null'}</p>
            <p><strong>Profile:</strong> {profile ? profile.full_name || 'No name' : 'null'}</p>
            <p><strong>Session:</strong> {session ? 'Active' : 'null'}</p>
          </div>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Direct Session Check:</h2>
          <div className="space-y-1 text-sm">
            <p><strong>Direct Session:</strong> {directSession ? 'Active' : 'null'}</p>
            <p><strong>Direct User:</strong> {directSession?.user?.email || 'null'}</p>
            <p><strong>Session:</strong> {directSession ? 'Active' : 'Inactive'}</p>
          </div>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Environment:</h2>
          <div className="space-y-1 text-sm">
            <p><strong>Supabase URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set'}</p>
            <p><strong>Supabase Key:</strong> {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Not set'}</p>
            <p><strong>NODE_ENV:</strong> {typeof window !== 'undefined' ? 'Client' : 'Server'}</p>
          </div>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Debug Logs:</h2>
          <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
            {debugLogs.map((log, index) => (
              <p key={index}>{log}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <button 
          onClick={refreshAuth}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Refresh Auth State
        </button>

        <div>
          <h2 className="text-xl font-semibold mb-2">Navigation Links:</h2>
          <div className="space-x-4">
            <a href="/" className="text-blue-600 hover:underline">Home</a>
            <a href="/auth/login" className="text-blue-600 hover:underline">Login</a>
            <a href="/auth/signup" className="text-blue-600 hover:underline">Signup</a>
            <a href="/dashboard" className="text-blue-600 hover:underline">Dashboard</a>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-yellow-50 p-4 rounded border border-yellow-200">
        <h3 className="font-semibold text-yellow-800 mb-2">Instructions:</h3>
        <ol className="text-sm text-yellow-700 space-y-1">
          <li>1. Check browser console for additional logs</li>
          <li>2. Try navigating to /dashboard directly</li>
          <li>3. Check if loading state changes after a few seconds</li>
          <li>4. Note any differences between Auth Context and Direct Session</li>
        </ol>
      </div>
    </div>
  );
}