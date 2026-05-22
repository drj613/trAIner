import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ThemeProvider } from "@/components/app/ThemeProvider";
import { LocalDataProvider } from "@/components/app/LocalDataProvider";
import { AppShell } from "@/components/app/AppShell";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { TodayClient } from "@/components/workout/TodayClient";
import { RoutinesIndexClient } from "@/components/workout/RoutinesIndexClient";
import { RoutineBuilderClient } from "@/components/workout/RoutineBuilderClient";
import { ProgramDetailClient } from "@/components/workout/ProgramDetailClient";
import { EditClient } from "@/components/workout/EditClient";
import { DiffPage } from "@/components/workout/DiffPage";
import { ProgramMapClient } from "@/components/workout/ProgramMapClient";
import { WorkoutDayClient } from "@/components/workout/WorkoutDayClient";
import { HistoryClient } from "@/components/workout/HistoryClient";
import { LibraryClient } from "@/components/catalog/LibraryClient";
import { ImportClient } from "@/components/import/ImportClient";
import { ProfileClient } from "@/components/profile/ProfileClient";
import { SettingsClient } from "@/components/app/SettingsClient";
import { PromptBuilderClient } from "@/components/prompts/PromptBuilderClient";

function ProgramDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <ProgramDetailClient id={id!} />;
}

function EditRoute() {
  const { id } = useParams<{ id: string }>();
  return <EditClient programId={id!} />;
}

function MapRoute() {
  const { id } = useParams<{ id: string }>();
  return <ProgramMapClient programId={id!} />;
}

function WorkoutDayRoute() {
  return <WorkoutDayClient />;
}

export default function App() {
  return (
    <BrowserRouter basename="/trAIner" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <LocalDataProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/today" element={<TodayClient />} />
              <Route path="/programs" element={<RoutinesIndexClient />} />
              <Route path="/programs/new" element={<RoutineBuilderClient />} />
              <Route path="/programs/:id" element={<ProgramDetailRoute />} />
              <Route path="/programs/:id/edit" element={<EditRoute />} />
              <Route path="/programs/:id/days/:dayId" element={<WorkoutDayRoute />} />
              <Route path="/programs/:id/diff" element={<DiffPage />} />
              <Route path="/programs/:id/map" element={<MapRoute />} />
              <Route path="/history" element={<HistoryClient />} />
              <Route path="/library" element={<LibraryClient />} />
              <Route path="/import" element={<ImportClient />} />
              <Route path="/profile" element={<ProfileClient />} />
              <Route path="/settings" element={<SettingsClient />} />
              <Route path="/prompts" element={<PromptBuilderClient />} />
            </Routes>
          </AppShell>
        </LocalDataProvider>
      </ThemeProvider>
      <ServiceWorkerRegistration />
    </BrowserRouter>
  );
}
