export function ProgressScreenStyles() {
  return <style>{`.progress-screen {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.progress-screen .tx-up {
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
  color: var(--fg-2);
}
.progress-screen .tx-mono {
  font-family: inherit;
  font-size: 12px;
}
.progress-screen button,
.progress-screen select {
  min-height: 36px;
}
.progress-screen button:focus-visible {
  outline: 2px solid var(--fg);
  outline-offset: 2px;
}
.progress-screen .page-header {
  padding-inline: 0;
}
.routine-analysis button {
  white-space: normal;
}
@media (max-width: 640px) {
  .progress-screen button,
  .progress-screen select {
    min-height: 44px;
  }
}
`}</style>;
}
