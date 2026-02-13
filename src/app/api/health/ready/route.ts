import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/database/sqlite';

/**
 * Readiness probe endpoint
 * Returns 200 only when the application is fully ready to serve traffic
 * Used by deployment platforms to determine when to route traffic to the instance
 */
export async function GET() {
  try {
    const checks = [];
    let allHealthy = true;

    const dbHealth = checkDatabaseHealth();
    if (!dbHealth.ok) {
      checks.push({
        name: 'database',
        status: 'fail',
        details: dbHealth.error ?? 'Database connection failed',
      });
      allHealthy = false;
    } else {
      checks.push({ name: 'database', status: 'pass' });
    }

    checks.push({
      name: 'environment',
      status: 'pass',
      details: process.env.SQLITE_DB_PATH
        ? 'Using SQLITE_DB_PATH'
        : 'Using default local database path',
    });

    // Check memory usage (warn if over 80% of limit)
    const memUsage = process.memoryUsage();
    const memLimit = 512 * 1024 * 1024; // 512MB default limit
    const memPercent = (memUsage.heapUsed / memLimit) * 100;
    
    if (memPercent > 80) {
      checks.push({ 
        name: 'memory', 
        status: 'warn', 
        details: `Memory usage at ${memPercent.toFixed(1)}%` 
      });
    } else {
      checks.push({ name: 'memory', status: 'pass' });
    }

    const response = {
      status: allHealthy ? 'ready' : 'not-ready',
      timestamp: new Date().toISOString(),
      checks
    };

    return NextResponse.json(response, { 
      status: allHealthy ? 200 : 503 
    });

  } catch (error) {
    return NextResponse.json({
      status: 'not-ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}