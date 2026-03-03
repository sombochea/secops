"use client";

import { useState, useMemo, useCallback } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { AboutDialog } from "@/components/about-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TRAINING_SCENARIOS,
  TRAINING_CATEGORIES,
  type TrainingScenario,
  type ScenarioChoice,
} from "@/lib/training-scenarios";
import {
  Search,
  X,
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Trophy,
  RotateCcw,
  GraduationCap,
  Target,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: "bg-green-500/10 text-green-400 border-green-500/30",
  intermediate: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  advanced: "bg-red-500/10 text-red-400 border-red-500/30",
};

/* ─── Active Scenario Runner ──────────────────────────────────────────────── */

interface RunnerState {
  step: number;
  selected: number | null;
  confirmed: boolean;
  /** per-step: index of chosen answer, -1 = unanswered */
  answers: number[];
  done: boolean;
}

function ScenarioRunner({
  scenario,
  onBack,
}: {
  scenario: TrainingScenario;
  onBack: () => void;
}) {
  const [state, setState] = useState<RunnerState>({
    step: 0,
    selected: null,
    confirmed: false,
    answers: Array(scenario.steps.length).fill(-1),
    done: false,
  });

  const current = scenario.steps[state.step];
  const chosenChoice: ScenarioChoice | null =
    state.confirmed && state.selected !== null
      ? current.choices[state.selected]
      : null;

  const score = useMemo(() => {
    if (!state.done) return 0;
    return state.answers.reduce((acc, a, i) => {
      return acc + (scenario.steps[i].choices[a]?.correct ? 1 : 0);
    }, 0);
  }, [state.done, state.answers, scenario.steps]);

  const confirm = useCallback(() => {
    if (state.selected === null) return;
    setState((s) => {
      const answers = [...s.answers];
      answers[s.step] = s.selected!;
      return { ...s, confirmed: true, answers };
    });
  }, [state.selected]);

  const next = useCallback(() => {
    setState((s) => {
      const nextStep = s.step + 1;
      if (nextStep >= scenario.steps.length) return { ...s, done: true };
      return { ...s, step: nextStep, selected: null, confirmed: false };
    });
  }, [scenario.steps.length]);

  const restart = useCallback(() => {
    setState({
      step: 0,
      selected: null,
      confirmed: false,
      answers: Array(scenario.steps.length).fill(-1),
      done: false,
    });
  }, [scenario.steps.length]);

  /* ── Completion screen ── */
  if (state.done) {
    const pct = Math.round((score / scenario.steps.length) * 100);
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to scenarios
        </Button>

        <Card>
          <CardHeader className="text-center pb-2">
            <Trophy
              className={cn(
                "mx-auto h-12 w-12",
                pct === 100
                  ? "text-yellow-400"
                  : pct >= 60
                    ? "text-blue-400"
                    : "text-muted-foreground"
              )}
            />
            <CardTitle className="text-2xl mt-2">
              {pct === 100
                ? "Perfect Score!"
                : pct >= 60
                  ? "Good Work!"
                  : "Keep Practicing"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-4xl font-bold">
              {score}/{scenario.steps.length}
            </p>
            <Progress value={pct} className="h-3 max-w-xs mx-auto" />
            <p className="text-muted-foreground text-sm max-w-xl mx-auto">
              {scenario.debrief}
            </p>

            {/* Per-step review */}
            <div className="text-left space-y-3 mt-6 max-w-xl mx-auto">
              <h3 className="font-semibold text-sm">Step Review</h3>
              {scenario.steps.map((s, i) => {
                const ans = state.answers[i];
                const ok = s.choices[ans]?.correct;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border p-3 text-sm",
                      ok
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {ok ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <p className="font-medium">
                          Step {i + 1}: {s.question}
                        </p>
                        <p className="text-muted-foreground mt-1">
                          Your answer: {s.choices[ans]?.text}
                        </p>
                        {!ok && (
                          <p className="text-green-400 mt-1">
                            Correct: {s.choices.find((c) => c.correct)?.text}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-center pt-4">
              <Button variant="outline" onClick={restart} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
              <Button onClick={onBack} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> All Scenarios
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Active step ── */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <span className="text-sm text-muted-foreground">
          Step {state.step + 1} of {scenario.steps.length}
        </span>
      </div>

      <Progress
        value={((state.step + 1) / scenario.steps.length) * 100}
        className="h-2"
      />

      {/* Situation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Situation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{current.situation}</p>
        </CardContent>
      </Card>

      {/* Question + choices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{current.question}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {current.choices.map((c, i) => {
            const isSelected = state.selected === i;
            const showResult = state.confirmed;
            return (
              <button
                key={i}
                disabled={state.confirmed}
                onClick={() => setState((s) => ({ ...s, selected: i }))}
                className={cn(
                  "w-full text-left rounded-lg border p-3 text-sm transition-colors",
                  !showResult && isSelected && "border-primary bg-primary/10",
                  !showResult && !isSelected && "border-border hover:border-muted-foreground/50",
                  showResult && c.correct && "border-green-500/50 bg-green-500/10",
                  showResult && isSelected && !c.correct && "border-red-500/50 bg-red-500/10",
                  showResult && !isSelected && !c.correct && "opacity-50"
                )}
              >
                <div className="flex items-start gap-2">
                  {showResult && c.correct && (
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                  )}
                  {showResult && isSelected && !c.correct && (
                    <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  )}
                  <span>{c.text}</span>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Explanation after confirming */}
      {chosenChoice && (
        <Card
          className={cn(
            "border",
            chosenChoice.correct
              ? "border-green-500/30 bg-green-500/5"
              : "border-red-500/30 bg-red-500/5"
          )}
        >
          <CardContent className="pt-4">
            <p className="text-sm leading-relaxed">{chosenChoice.explanation}</p>
            {!chosenChoice.correct && current.hint && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                Hint: {current.hint}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {!state.confirmed ? (
          <Button disabled={state.selected === null} onClick={confirm}>
            Confirm Answer
          </Button>
        ) : (
          <Button onClick={next} className="gap-1.5">
            {state.step + 1 < scenario.steps.length ? (
              <>
                Next Step <ArrowRight className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                See Results <Trophy className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export function SocTraining({ userName }: { userName: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [active, setActive] = useState<TrainingScenario | null>(null);

  const filtered = useMemo(() => {
    return TRAINING_SCENARIOS.filter((s) => {
      if (category && s.category !== category) return false;
      if (difficulty && s.difficulty !== difficulty) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [search, category, difficulty]);

  const hasFilters = search || category || difficulty;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader
        userName={userName}
        onAboutClick={() => setAboutOpen(true)}
      />
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 py-6 sm:px-6">
        {active ? (
          <ScenarioRunner
            key={active.id}
            scenario={active}
            onBack={() => setActive(null)}
          />
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <GraduationCap className="h-6 w-6" /> SOC Training Mode
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Interactive scenarios to sharpen your incident response skills.
                Choose a scenario and make decisions under pressure.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                  <p className="text-xs text-muted-foreground">Scenarios</p>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{TRAINING_SCENARIOS.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                  <p className="text-xs text-muted-foreground">Categories</p>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{TRAINING_CATEGORIES.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                  <p className="text-xs text-muted-foreground">Total Steps</p>
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {TRAINING_SCENARIOS.reduce((a, s) => a + s.steps.length, 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                  <p className="text-xs text-muted-foreground">Est. Time</p>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {TRAINING_SCENARIOS.reduce((a, s) => a + s.duration, 0)}m
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search scenarios..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSearch("");
                    setCategory("");
                    setDifficulty("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Scenario cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <Card
                  key={s.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setActive(s)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={DIFFICULTY_COLOR[s.difficulty]}
                      >
                        {s.difficulty}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {s.duration} min
                      </span>
                    </div>
                    <CardTitle className="text-base mt-2">{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {s.description}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="secondary" className="text-xs">
                        {s.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {s.steps.length} steps
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-12">
                No scenarios match your filters.
              </p>
            )}
          </div>
        )}
      </main>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
