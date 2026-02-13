import { NextResponse } from 'next/server';

/**
 * Liveness probe endpoint
 * Simple endpoint that returns 200 if the application process is running
 * Used by deployment platforms to determine if the container should be restarted
 */
export async function GET() {
  try {
    // Basic liveness check - just ensure the process is running
    const response = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    // If we can't even return a response, the process is likely in a bad state
    return NextResponse.json({
      status: 'dead',
      timestamp: new Date().toISOString(),
      error: 'Liveness check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}