import { render, screen, waitFor, act } from '@testing-library/react';
import RoutinesPage from '@/app/routines/page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}));

global.fetch = jest.fn();

describe('RoutinesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          routines: [],
        }),
    });
  });

  it('renders the routines page header', async () => {
    await act(async () => {
      render(<RoutinesPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('AI Trainer')).toBeInTheDocument();
      expect(screen.getByText('My Routines')).toBeInTheDocument();
    });
  });

  it('shows empty state when no routines', async () => {
    await act(async () => {
      render(<RoutinesPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('No routines yet')).toBeInTheDocument();
    });
  });

  it('displays routines when data is loaded', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          routines: [
            {
              id: 'routine-1',
              title: 'Test Routine',
              duration_weeks: 4,
              days_per_week: 3,
              goals: ['strength'],
              created_at: '2026-02-02T00:00:00Z',
            },
          ],
        }),
    });

    await act(async () => {
      render(<RoutinesPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Routine')).toBeInTheDocument();
      expect(screen.getByText('4 weeks')).toBeInTheDocument();
      expect(screen.getByText('3 days/week')).toBeInTheDocument();
    });
  });
});
