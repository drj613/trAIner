import { render, screen, waitFor } from '@testing-library/react';
import { SupabaseAuthProvider, useAuth } from '@/contexts/SupabaseAuthContext';

// Mock Supabase
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      upsert: jest.fn(),
    })),
  })),
}));

// Test component that uses the auth context
function TestComponent() {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (user) return <div>User logged in: {user.email}</div>;
  return <div>No user</div>;
}

describe('SupabaseAuthContext', () => {
  it('provides auth context to children', async () => {
    render(
      <SupabaseAuthProvider>
        <TestComponent />
      </SupabaseAuthProvider>
    );

    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Should show "No user" after loading
    await waitFor(() => {
      expect(screen.getByText('No user')).toBeInTheDocument();
    });
  });

  it('throws error when useAuth is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within a SupabaseAuthProvider');

    consoleSpy.mockRestore();
  });
});