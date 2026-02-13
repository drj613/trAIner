import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/database/sqlite';

export async function GET() {
  try {
    const startTime = Date.now();

    // Basic health check response
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: 'unknown',
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      }
    };

    const dbHealth = checkDatabaseHealth();
    if (dbHealth.ok) {
      health.checks.database = 'healthy';
    } else {
      health.checks.database = 'error';
      health.status = 'degraded';
    }

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      ...health,
      responseTime: `${responseTime}ms`
    }, {
      status: health.status === 'healthy' ? 200 : 503
    });

  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}
