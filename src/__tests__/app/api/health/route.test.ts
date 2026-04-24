import packageJson from '../../../../../package.json';
import { GET } from '@/app/api/health/route';

jest.mock('@/lib/database/sqlite', () => ({
  checkDatabaseHealth: jest.fn(() => ({ ok: true })),
}));

describe('GET /api/health', () => {
  it('reports the application version from package metadata', async () => {
    const response = await GET();
    const json = await response.json();

    expect(json.version).toBe(packageJson.version);
  });
});
