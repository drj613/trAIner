'use client';

import Link from 'next/link';

export default function DebugPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Debug Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">App Mode:</h2>
          <div className="space-y-1 text-sm">
            <p><strong>Auth:</strong> Disabled</p>
            <p><strong>Storage:</strong> SQLite</p>
            <p><strong>Environment:</strong> {process.env.NODE_ENV || 'unknown'}</p>
          </div>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Health Links:</h2>
          <div className="space-y-1 text-sm">
            <p><Link className="text-blue-600 hover:underline" href="/api/health">/api/health</Link></p>
            <p><Link className="text-blue-600 hover:underline" href="/api/health/ready">/api/health/ready</Link></p>
          </div>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Environment:</h2>
          <div className="space-y-1 text-sm">
            <p><strong>SQLITE_DB_PATH:</strong> {process.env.SQLITE_DB_PATH || '(default ./data/trainer.sqlite)'}</p>
            <p><strong>NODE_ENV:</strong> {typeof window !== 'undefined' ? 'Client' : 'Server'}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Navigation Links:</h2>
          <div className="space-x-4">
            <Link href="/" className="text-blue-600 hover:underline">Home</Link>
            <Link href="/dashboard" className="text-blue-600 hover:underline">Dashboard</Link>
            <Link href="/routines/import" className="text-blue-600 hover:underline">Import</Link>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-yellow-50 p-4 rounded border border-yellow-200">
        <h3 className="font-semibold text-yellow-800 mb-2">Notes:</h3>
        <ol className="text-sm text-yellow-700 space-y-1">
          <li>1. The app no longer uses Supabase auth.</li>
          <li>2. All routine and workout data is stored in local SQLite.</li>
          <li>3. Use import page to paste LLM JSON routines.</li>
        </ol>
      </div>
    </div>
  );
}