# trAIner

AI-powered workout routine generator with conversational interface and personalized virtual trainers.

## Overview

trAIner is a fitness application that uses AI to create personalized workout routines through natural conversation. Users can interact with 11 different virtual trainer personas, each specializing in different fitness methodologies.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key (for AI features)
- Supabase account (for database)

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

4. Configure your `.env.local` file:

   ```
   OPENAI_API_KEY=your_openai_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
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

### Demo Mode

For testing without API keys, use these demo credentials:

- Email: `demo@example.com` | Password: `password`
- Email: `test@test.com` | Password: `123456`

## Features

- **Personalized Workouts**: AI generates custom workout routines based on your fitness level, goals, and available equipment
- **Virtual Trainers**: Choose from 11 specialized trainers, each with unique training philosophies
- **Natural Conversation**: Modify workouts through chat-based interactions
- **Progress Tracking**: Log workouts and track your fitness journey
- **Export Options**: Export routines to Google Sheets, PDF, or other formats
- **Safety First**: Built-in injury prevention and form reminders

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express (planned)
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4 via Vercel AI SDK
- **Authentication**: Supabase Auth
- **Deployment**: Vercel

## Project Structure

```
src/
├── app/              # Next.js app directory
├── components/       # Reusable React components
├── contexts/         # React context providers
├── lib/             # Utility functions and API clients
├── types/           # TypeScript type definitions
└── styles/          # Global styles
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
├── app/                    # Page component tests
│   └── auth/
│       └── login.test.tsx
├── contexts/               # Context provider tests
│   └── SupabaseAuthContext.test.tsx
└── lib/                    # Utility function tests
    └── supabase/
        └── client.test.ts
```

#### Testing Philosophy

- **Unit Tests**: Test individual components and functions in isolation
- **Integration Tests**: Test component interactions and data flow
- **Mocking**: Mock external dependencies (Supabase, Next.js router) for reliable tests
- **Coverage**: Aim for high test coverage on critical paths (auth, core functionality)

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

For database-related tests, we use mocked Supabase clients to avoid hitting the real database:

```typescript
// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: mockData, error: null }))
        }))
      })),
    }))
  }))
}));
```

#### Test Coverage

Current test coverage includes:

- ✅ Authentication context and flows
- ✅ Login/signup form interactions  
- ✅ Supabase client configuration
- ✅ Error handling and edge cases
- 🔄 Component rendering and state management
- 🔄 Database operations and queries
- 🔄 API route handlers

### Building for Production

```bash
npm run build
```

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
