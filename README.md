# trAIner

Prompt-to-routine workout tracker for local-first use.

## Overview

trAIner is a non-invasive workflow for people using any LLM chatbot:

1. Compile a high-quality prompt in-app (persona + constraints + export rules)
2. Paste the prompt into your LLM of choice
3. Copy JSON output back into trAIner
4. Import and track lifts week-to-week (progressive overload)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Local SQLite database (auto-created)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/trAIner.git
   cd trAIner
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env.local
   ```

4. Configure your `.env.local` file (optional):

   ```
   SQLITE_DB_PATH=./data/trainer.sqlite
   ```

5. Run the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

7. (Optional) Run tests to verify setup:

   ```bash
   npm test
   ```

### Local Mode

- No account setup is required.
- No hosted auth required.
- Data is stored in a local SQLite file.

## Features

- **Prompt Compiler**: Build a copy-ready prompt using persona guidance and output constraints
- **LLM-Agnostic Workflow**: Works with ChatGPT, Claude, Gemini, etc.
- **Strict JSON Import**: Validate and ingest routines against `ROUTINE_API_JSON_SPEC.md`
- **Routine Viewer**: Browse imported routines by week/day/exercise
- **Lift Logging**: Record set-level weight, reps, RPE, and notes
- **Workout History**: Review recent logs to support progressive overload decisions

## Tech Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **Backend**: Next.js route handlers
- **Database**: SQLite (local file)
- **AI**: External LLMs (prompt is compiled in-app; generation happens outside app)
- **Authentication**: None (current local mode)
- **Deployment**: Local-first development

## Project Structure

```
src/
├── app/              # Next.js app directory
├── components/       # Reusable React components
├── lib/             # Utility functions and API clients
└── __tests__/       # Test suites
```

## Development

### Testing

This project uses **Jest** and **React Testing Library** for comprehensive testing.

#### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (recommended during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

#### Test Structure

Tests are organized in the `src/__tests__/` directory, mirroring the source structure:

```
src/__tests__/
├── app/                    # Page and flow tests
│   ├── dashboard.test.tsx
│   ├── prompts/page.test.tsx
│   └── routines/
│       ├── import.test.tsx
│       └── page.test.tsx
└── lib/                    # Utility function tests
    └── routines/
        └── validate.test.ts
```

#### Testing Philosophy

- **Unit Tests**: Test individual components and functions in isolation
- **Integration Tests**: Test component interactions and data flow
- **Mocking**: Mock external dependencies (API calls, Next.js router) for reliable tests
- **Coverage**: Focus on JSON validation, import flow, prompt compiler, and routine pages

#### Writing Tests

Example test structure:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyComponent from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interactions', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);
    
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Updated Text')).toBeInTheDocument();
  });
});
```

#### Continuous Integration

Tests run automatically on every push and pull request via GitHub Actions. The CI pipeline includes:

- **Linting**: ESLint checks for code quality
- **Type Checking**: TypeScript compilation
- **Testing**: Full test suite execution
- **Build**: Production build verification

#### Database Testing

For database-related tests, mock API/data-layer boundaries to avoid touching local files:

```typescript
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ ok: true, routines: [] }),
});
```

#### Test Coverage

Current test coverage includes:

- ✅ Prompt compiler page rendering
- ✅ Routine import flow and validation handling
- ✅ Routine list/dashboard shell rendering
- ✅ Routine schema validation
- ✅ Error handling and edge cases
- 🔄 API route integration tests
- 🔄 SQLite repository-level tests

### Building for Production

```bash
npm run build
```

Note: current architecture is local-first SQLite. For hosted production, use a persistent database/storage strategy.

### Code Quality

#### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Fix ESLint issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without changes
npm run format:check
```

#### Pre-commit Hooks

This project uses **Husky** and **lint-staged** for automated code quality checks:

- **ESLint** runs on staged TypeScript/JavaScript files
- **Prettier** formats staged files automatically
- **TypeScript** compilation is checked

These run automatically when you commit, ensuring consistent code quality.

## Task Management

This project uses Task Master AI for development tracking. View current tasks:

```bash
npx task-master-ai list
```

## Contributing

Please read our contributing guidelines before submitting PRs.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
