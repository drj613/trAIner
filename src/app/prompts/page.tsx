'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Dumbbell, ClipboardCopy, Check, ArrowLeft } from 'lucide-react';
import { TRAINER_PERSONAS } from '@/lib/trainers/personas';
import { compileRoutinePrompt, getExportInstruction } from '@/lib/prompts/compiler';

export default function PromptCompilerPage() {
  const [primaryGoal, setPrimaryGoal] = useState('build strength and muscle');
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [equipment, setEquipment] = useState('barbell, rack, bench, dumbbells');
  const [constraints, setConstraints] = useState('');
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const compiledPrompt = useMemo(
    () =>
      compileRoutinePrompt({
        primaryGoal,
        durationWeeks,
        daysPerWeek,
        equipment,
        constraints,
        selectedPersonaIds,
      }),
    [
      primaryGoal,
      durationWeeks,
      daysPerWeek,
      equipment,
      constraints,
      selectedPersonaIds,
    ]
  );

  const personaList = useMemo(() => Object.values(TRAINER_PERSONAS), []);

  const togglePersona = (personaId: string) => {
    setSelectedPersonaIds((prev) =>
      prev.includes(personaId)
        ? prev.filter((id) => id !== personaId)
        : [...prev, personaId]
    );
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(compiledPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleCopyExportOnly = async () => {
    await navigator.clipboard.writeText(getExportInstruction());
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/dashboard" className="flex items-center">
              <Dumbbell className="h-8 w-8 text-blue-600 mr-3" />
              <span className="text-xl font-semibold text-gray-900">AI Trainer</span>
            </Link>
            <Link
              href="/routines/import"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Go to Import
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Prompt Compiler</h1>
            <p className="text-sm text-gray-600 mb-6">
              Build a copy-ready prompt for your LLM, then paste the returned JSON in
              the import page.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary goal
                </label>
                <input
                  value={primaryGoal}
                  onChange={(e) => setPrimaryGoal(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (weeks)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={durationWeeks}
                    onChange={(e) => setDurationWeeks(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Days per week
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={daysPerWeek}
                    onChange={(e) => setDaysPerWeek(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipment
                </label>
                <input
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. barbell, dumbbells, bands"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Constraints / injury notes
                </label>
                <textarea
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. avoid heavy overhead pressing due to shoulder irritation"
                />
              </div>

              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">
                  Personas (choose one or more)
                </p>
                <div className="space-y-2 max-h-64 overflow-auto pr-1">
                  {personaList.map((persona) => (
                    <label
                      key={persona.id}
                      className="flex items-start gap-2 p-2 border border-gray-200 rounded-md"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPersonaIds.includes(persona.id)}
                        onChange={() => togglePersona(persona.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="text-sm font-medium text-gray-900">
                          {persona.name}
                        </span>
                        <span className="text-xs text-gray-600 block">
                          {persona.specialty}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Compiled Prompt</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyExportOnly}
                  className="text-xs px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-100"
                >
                  Copy Export Instruction
                </button>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <ClipboardCopy className="h-4 w-4 mr-1" />}
                  {copied ? 'Copied' : 'Copy Prompt'}
                </button>
              </div>
            </div>

            <textarea
              readOnly
              value={compiledPrompt}
              rows={26}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
            />

            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <ol className="list-decimal list-inside space-y-1">
                <li>Copy this prompt into your LLM chatbot.</li>
                <li>Ask for edits until routine looks right.</li>
                <li>Copy the final JSON output.</li>
                <li>Go to import page and paste JSON.</li>
              </ol>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
