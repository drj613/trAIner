import { createClient } from '@/lib/supabase/client';

// Mock the Supabase createBrowserClient
jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn((url, key) => ({
    url,
    key,
    auth: {},
    from: jest.fn(),
  })),
}));

describe('Supabase Client', () => {
  beforeEach(() => {
    // Set up environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  it('creates a Supabase client with correct configuration', () => {
    const client = createClient();
    
    expect(client).toBeDefined();
    expect(client.url).toBe('https://test.supabase.co');
    expect(client.key).toBe('test-anon-key');
  });
});