# AI Trainer - MVP Prototype

A Next.js application for AI-powered workout routine generation with conversational interface.

## 🚀 Current Status

✅ **Initial Scaffolding Complete**
- Next.js 14 with TypeScript and Tailwind CSS
- Fake authentication system with dummy users
- Login page with demo credentials
- Protected dashboard with "Hello World" interface
- Responsive design with modern UI components

## 🔑 Demo Login Credentials

Use any of these credentials to log in:

- **Email**: `demo@example.com` | **Password**: `password`
- **Email**: `test@test.com` | **Password**: `123456`
- **Email**: `user@demo.com` | **Password**: `demo`

## 🛠️ Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to [http://localhost:3000](http://localhost:3000)

4. **Login** using one of the demo credentials above

## 📁 Project Structure

```
src/
├── app/
│   ├── login/page.tsx          # Login page with fake auth
│   ├── dashboard/page.tsx      # Protected dashboard
│   ├── layout.tsx              # Root layout with AuthProvider
│   └── page.tsx                # Home page (redirects to login/dashboard)
├── contexts/
│   └── AuthContext.tsx         # Authentication context with fake auth
└── types/
    └── auth.ts                 # TypeScript interfaces
```

## 🔧 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Authentication**: Fake auth with localStorage (for now)
- **AI**: Vercel AI SDK (prepared, not yet implemented)
- **Database**: Supabase (prepared, not yet implemented)

## ✨ Features Implemented

- [x] Responsive login page with demo credentials
- [x] Fake authentication system
- [x] Protected routes (dashboard requires login)
- [x] User session persistence with localStorage
- [x] Clean, modern UI with Tailwind CSS
- [x] Loading states and error handling
- [x] Mobile-responsive design

## 🚧 Next Steps (MVP Phase)

1. **AI Integration** (Days 3-5)
   - Setup Vercel AI SDK with OpenAI
   - Create basic workout generation
   - Implement "Max" trainer persona

2. **Chat Interface** (Days 6-8)
   - Build chat UI with streaming responses
   - Add workout modification capabilities
   - Implement conversation memory

3. **Export Features** (Days 9-10)
   - Add workout export to markdown/JSON
   - Implement copy-to-clipboard
   - Polish UI and deploy to Vercel

## 🎯 MVP Success Criteria

- [x] User can sign up and log in (fake auth working)
- [ ] Add Supabase integration
- [ ] Users can create actual signup info and login
- [ ] AI generates sensible workout plans
- [ ] User can modify workouts through chat
- [ ] Export functionality works
- [ ] Deployed and accessible online

## 🔍 Testing the Current Build

1. Visit http://localhost:3000
2. You'll be redirected to the login page
3. Use demo credentials: `demo@example.com` / `password`
4. Click "Fill demo credentials" for quick access
5. After login, you'll see the dashboard with placeholder content
6. Logout button works and returns to login page

## 💡 Development Notes

- Using fake authentication for rapid prototyping
- All routes are client-side protected
- Session persists across browser refreshes
- Ready for real Supabase integration later
- Prepared for AI integration with Vercel AI SDK
