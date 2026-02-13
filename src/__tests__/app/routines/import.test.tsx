import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportRoutinePage from '@/app/routines/import/page';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
  })),
}));

// Mock fetch
global.fetch = jest.fn();

describe('ImportRoutinePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the import page', () => {
    render(<ImportRoutinePage />);

    expect(screen.getByRole('heading', { name: 'Import Routine' })).toBeInTheDocument();
    expect(screen.getByText('Routine JSON')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import routine/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load example/i })).toBeInTheDocument();
  });

  it('loads example routine on button click', async () => {
    const user = userEvent.setup();
    render(<ImportRoutinePage />);

    const loadExampleBtn = screen.getByRole('button', { name: /load example/i });
    await user.click(loadExampleBtn);

    const textarea = screen.getByPlaceholderText(/paste your routine json/i);
    expect((textarea as HTMLTextAreaElement).value).toContain('schema_version');
    expect((textarea as HTMLTextAreaElement).value).toContain('4-Week Strength Base');
  });

  it('shows error for invalid JSON', async () => {
    const user = userEvent.setup();
    render(<ImportRoutinePage />);

    const textarea = screen.getByPlaceholderText(/paste your routine json/i);
    await user.type(textarea, 'not valid json');

    const importBtn = screen.getByRole('button', { name: /import routine/i });
    await user.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText(/invalid json format/i)).toBeInTheDocument();
    });
  });

  it('shows validation errors from API', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          ok: false,
          error: 'validation_failed',
          message: 'Validation failed',
          details: [{ path: 'title', message: 'title is required' }],
        }),
    });

    render(<ImportRoutinePage />);

    const textarea = screen.getByPlaceholderText(/paste your routine json/i);
    // Use paste instead of type to avoid userEvent curly brace parsing issues
    await user.click(textarea);
    await user.paste('{"schema_version": "1.0"}');

    const importBtn = screen.getByRole('button', { name: /import routine/i });
    await user.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
      expect(screen.getByText(/title is required/i)).toBeInTheDocument();
    });
  });

  it('redirects on successful import', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          routine_id: 'routine-123',
        }),
    });

    render(<ImportRoutinePage />);

    const textarea = screen.getByPlaceholderText(/paste your routine json/i);
    await user.click(textarea);
    await user.paste('{"schema_version": "1.0", "title": "Test"}');

    const importBtn = screen.getByRole('button', { name: /import routine/i });
    await user.click(importBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/routines/routine-123');
    });
  });

  it('disables import button when textarea is empty', () => {
    render(<ImportRoutinePage />);

    const importBtn = screen.getByRole('button', { name: /import routine/i });
    expect(importBtn).toBeDisabled();
  });
});
