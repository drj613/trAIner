import { render, screen } from '@testing-library/react';
import PromptCompilerPage from '@/app/prompts/page';

describe('PromptCompilerPage', () => {
  it('renders compiler controls and output', () => {
    render(<PromptCompilerPage />);

    expect(screen.getByText('Prompt Compiler')).toBeInTheDocument();
    expect(screen.getByText('Primary goal')).toBeInTheDocument();
    expect(screen.getByText('Duration (weeks)')).toBeInTheDocument();
    expect(screen.getByText('Days per week')).toBeInTheDocument();
    expect(
      screen.getByText('Personas (choose one or more)')
    ).toBeInTheDocument();
    expect(screen.getByText('Compiled Prompt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy prompt/i })).toBeInTheDocument();
  });
});
