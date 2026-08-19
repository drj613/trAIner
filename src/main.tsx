import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ExerciseNormalizationProvider>
      <App />
    </ExerciseNormalizationProvider>
  </React.StrictMode>,
);
