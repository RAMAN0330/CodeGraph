/**
 * Reference material for the pattern detectors in
 * features/analysis/services/parser.ts (`Parser.detectPatterns`).
 *
 * Keyed by the `name` each detector emits. Unlisted names fall back to
 * DEFAULT_REFERENCE so a new detector still renders sensibly.
 */

export interface PatternReference {
  /** Why this shows up / what it signals about the codebase. */
  why: string;
  /** What to do about it — only meaningful for anti-patterns. */
  recommendation: string | null;
}

export const DEFAULT_REFERENCE: PatternReference = {
  why: 'This structural pattern was detected based on naming and code shape heuristics.',
  recommendation: null,
};

export const PATTERN_REFERENCE: Record<string, PatternReference> = {
  Singleton: {
    why: 'A single shared instance is a reasonable choice for configuration, logging, or a connection pool — but it also introduces global state, which makes unit testing and concurrent use harder to reason about.',
    recommendation: null,
  },
  Factory: {
    why: 'Centralizing object creation behind a factory keeps callers decoupled from concrete classes, so new variants can be added without touching every call site.',
    recommendation: null,
  },
  'Observer/Event': {
    why: 'An event/subscription mechanism decouples producers from consumers, which scales well but can make control flow harder to trace — check that listeners are cleaned up to avoid leaks.',
    recommendation: null,
  },
  'Custom Hooks': {
    why: 'Extracting stateful logic into hooks keeps components focused on rendering and makes the logic independently testable and reusable.',
    recommendation: null,
  },
  'Higher-Order Component': {
    why: 'HOCs let you enhance a component without modifying it, though deep HOC chains can make prop origin harder to trace — hooks are usually the more debuggable alternative for new code.',
    recommendation: null,
  },
  'Context Provider': {
    why: 'Context avoids prop drilling for state that many components need, at the cost of re-rendering every consumer when the value changes — fine for low-frequency state like theme or auth.',
    recommendation: null,
  },
  UserForms: { why: 'VBA UserForms implement the UI layer for Office automation tooling.', recommendation: null },
  Modules: { why: 'VBA Modules hold procedural, reusable business logic separate from UI code.', recommendation: null },
  'Class Modules': { why: 'VBA Class Modules bring object-oriented structure — encapsulated state and behavior — to VBA projects.', recommendation: null },
  'API Endpoints': {
    why: 'These are the HTTP surface of the application. Each one is a place where untrusted input enters the system, so they are worth cross-checking against the Security page.',
    recommendation: null,
  },
  Dataclasses: { why: 'Dataclasses cut down boilerplate for data-holding classes and give you equality/repr for free.', recommendation: null },
  'Abstract Base Classes': { why: 'ABCs enforce that subclasses implement required methods, catching missing-implementation bugs at instantiation rather than at first call.', recommendation: null },
  'Context Managers': { why: 'The `with` protocol guarantees cleanup (closing files, releasing locks) even when an exception is raised inside the block.', recommendation: null },
  Mixins: {
    why: 'Mixins share behavior across classes via multiple inheritance. Useful in moderation — deep mixin chains can make method resolution order hard to follow.',
    recommendation: null,
  },
  'Django Signals': {
    why: 'Signals decouple side effects from the code that triggers them, but they also make control flow implicit — a change can have effects that are not visible at the call site.',
    recommendation: null,
  },
  Middleware: { why: 'Middleware centralizes cross-cutting concerns (auth, logging, CORS) so individual handlers stay focused on their own logic.', recommendation: null },
  'God Object': {
    why: 'A file with 15+ functions is usually doing the work of several modules. That concentration makes it a hotspot for merge conflicts, a magnet for further unrelated additions, and hard to unit test in isolation.',
    recommendation: 'Group the functions by the responsibility they serve and extract each group into its own module. Start with the group that changes most often in git history — that is usually the one under active development and the one splitting will help most.',
  },
  'Long File': {
    why: 'Files over 500 lines take longer to navigate, review, and hold in working memory during a code review, and they tend to accumulate more unrelated concerns over time.',
    recommendation: 'Look for natural seams — a class doing two jobs, a set of helpers that only serve one exported function — and extract them into sibling files.',
  },
  'VBA God Module': {
    why: 'A VBA module with 20+ procedures mixes many unrelated tasks in one place, making it hard to find the procedure you need and risky to change without breaking something unrelated.',
    recommendation: 'Split procedures into modules organized by the workbook/feature area they serve (e.g. Reporting, DataImport, UI).',
  },
};

export function patternReferenceFor(name: string): PatternReference {
  return PATTERN_REFERENCE[name] ?? DEFAULT_REFERENCE;
}
