import { render, screen } from '@testing-library/react';
import DashboardPage from '@/app/dashboard/page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}));

describe('DashboardPage', () => {
  it('renders dashboard shell and actions', () => {
    render(<DashboardPage />);

    expect(screen.getByText('AI Trainer')).toBeInTheDocument();
    expect(screen.getByText('My Routines')).toBeInTheDocument();
    expect(screen.getByText('Import a Routine')).toBeInTheDocument();
    expect(screen.getByText('View Routines')).toBeInTheDocument();
    expect(screen.getByText('Import Routine')).toBeInTheDocument();
  });
});
