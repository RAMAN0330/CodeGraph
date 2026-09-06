/**
 * Reference material for the security detectors implemented in
 * features/analysis/services/parser.ts (`Parser.detectSecurity`).
 *
 * Keys match the `title` each detector emits. Anything not listed here falls
 * back to DEFAULT_REFERENCE so a new detector still renders sensibly.
 */

export interface IssueReference {
  /** Short classification chips shown under the detail heading. */
  tags: string[];
  /** Why the finding matters. */
  why: string;
  /** Concrete remediation guidance. */
  fix: string;
  /** Further reading. */
  resources: { label: string; url: string }[];
}

const CWE = (id: number) => `https://cwe.mitre.org/data/definitions/${id}.html`;
const CHEATSHEET = (slug: string) =>
  `https://cheatsheetseries.owasp.org/cheatsheets/${slug}.html`;

const INJECTION_RESOURCES = [
  { label: 'OWASP Injection Prevention Cheat Sheet', url: CHEATSHEET('Injection_Prevention_Cheat_Sheet') },
  { label: 'OWASP Top 10 A03: Injection', url: 'https://owasp.org/Top10/A03_2021-Injection/' },
];

const COMMAND_INJECTION: IssueReference = {
  tags: ['CWE-78', 'Injection', 'OWASP A03'],
  why: 'Shell command execution built from untrusted input lets an attacker append their own commands, giving them the privileges of the running process.',
  fix: 'Avoid the shell entirely: pass arguments as an array to the process API rather than a single string. If a shell is unavoidable, allow-list the permitted values instead of escaping.',
  resources: [
    { label: 'OWASP OS Command Injection Defense', url: CHEATSHEET('OS_Command_Injection_Defense_Cheat_Sheet') },
    { label: 'CWE-78: OS Command Injection', url: CWE(78) },
  ],
};

const EVAL_EXECUTION: IssueReference = {
  tags: ['CWE-95', 'Code Execution', 'OWASP A03'],
  why: 'Evaluating code at runtime means any attacker-influenced string becomes executable code in your process.',
  fix: 'Replace dynamic evaluation with an explicit parser or dispatch table. For data, use a structured format such as JSON with a strict schema.',
  resources: [
    { label: 'CWE-95: Eval Injection', url: CWE(95) },
    ...INJECTION_RESOURCES,
  ],
};

export const DEFAULT_REFERENCE: IssueReference = {
  tags: ['Security'],
  why: 'This pattern is commonly associated with security weaknesses and is worth reviewing in context.',
  fix: 'Review the flagged line and confirm that untrusted input cannot reach it. Where it can, validate or encode the input at the boundary.',
  resources: [{ label: 'OWASP Top 10', url: 'https://owasp.org/www-project-top-ten/' }],
};

export const ISSUE_REFERENCE: Record<string, IssueReference> = {
  'Hardcoded Secret': {
    tags: ['CWE-798', 'Secrets', 'OWASP A07'],
    why: 'Credentials committed to source control are readable by anyone with repository access and remain in git history even after removal. They are routinely harvested from public and internal repositories.',
    fix: 'Move the value into an environment variable or a managed secret store, then rotate the exposed credential — removing it from the file does not invalidate it.',
    resources: [
      { label: 'OWASP Secrets Management Cheat Sheet', url: CHEATSHEET('Secrets_Management_Cheat_Sheet') },
      { label: 'CWE-798: Hard-coded Credentials', url: CWE(798) },
    ],
  },
  'SQL Injection Risk': {
    tags: ['CWE-89', 'Injection', 'SQL', 'OWASP A03'],
    why: 'String concatenation in SQL queries can allow an attacker to inject malicious SQL, potentially leading to unauthorized data access, data modification, or data deletion.',
    fix: 'Use parameterized queries or prepared statements. Never concatenate user input directly into SQL strings — bind it as a parameter so the driver handles escaping.',
    resources: [
      { label: 'OWASP SQL Injection Prevention Cheat Sheet', url: CHEATSHEET('SQL_Injection_Prevention_Cheat_Sheet') },
      { label: 'CWE-89: SQL Injection', url: CWE(89) },
    ],
  },
  'XSS Vulnerability': {
    tags: ['CWE-79', 'XSS', 'OWASP A03'],
    why: 'Writing unescaped values into the DOM lets an attacker execute script in your users’ sessions, enabling session theft, credential capture, and actions taken on the user’s behalf.',
    fix: 'Render text through the framework’s escaping (textContent, JSX children) instead of raw HTML. When HTML is genuinely required, sanitize it with a vetted library such as DOMPurify.',
    resources: [
      { label: 'OWASP XSS Prevention Cheat Sheet', url: CHEATSHEET('Cross_Site_Scripting_Prevention_Cheat_Sheet') },
      { label: 'CWE-79: Cross-site Scripting', url: CWE(79) },
    ],
  },
  'Dynamic Code Execution': EVAL_EXECUTION,
  'Python eval()': {
    ...EVAL_EXECUTION,
    fix: 'Use ast.literal_eval() when parsing literals, or an explicit parser for anything richer. Reserve eval() for trusted, developer-authored input only.',
  },
  'Python exec()': {
    ...EVAL_EXECUTION,
    fix: 'Restructure the code so the behaviour is selected from a dictionary of known functions rather than executed from a string.',
  },
  'Function Constructor': {
    ...EVAL_EXECUTION,
    why: 'The Function constructor compiles a string into executable code, carrying the same risk as eval() while being easier to overlook in review.',
  },
  'Command Execution': COMMAND_INJECTION,
  'OS Command Execution': COMMAND_INJECTION,
  'Shell Command Execution': COMMAND_INJECTION,
  'Shell Injection Risk': {
    ...COMMAND_INJECTION,
    why: 'Running a subprocess through the shell means shell metacharacters in the input (;, |, &&, backticks) are interpreted as syntax, letting an attacker chain their own commands.',
    fix: 'Pass the command and its arguments as a list and leave shell=True off. If the shell is required, allow-list the input rather than escaping it.',
  },
  'WScript.Shell Creation': {
    ...COMMAND_INJECTION,
    why: 'A WScript.Shell object can execute arbitrary system commands from within the document, a technique widely used by macro-based malware.',
  },
  'SendKeys Usage': {
    tags: ['CWE-94', 'Code Execution'],
    why: 'SendKeys drives whatever window currently has focus, so its effect depends on runtime state an attacker may be able to influence — and it is a known macro-malware technique.',
    fix: 'Call the target application’s object model directly instead of simulating keystrokes.',
    resources: [{ label: 'CWE-94: Code Injection', url: CWE(94) }],
  },
  'Pickle Deserialization': {
    tags: ['CWE-502', 'Deserialization', 'OWASP A08'],
    why: 'pickle executes arbitrary code during loading, so deserializing untrusted data is equivalent to running an attacker’s program.',
    fix: 'Use a data-only format such as JSON. If pickle is unavoidable, restrict it to data your own process produced and authenticate it with a MAC.',
    resources: [
      { label: 'OWASP Deserialization Cheat Sheet', url: CHEATSHEET('Deserialization_Cheat_Sheet') },
      { label: 'CWE-502: Deserialization of Untrusted Data', url: CWE(502) },
    ],
  },
  'Dynamic Import': {
    tags: ['CWE-829', 'Supply Chain'],
    why: 'Importing a module whose name is computed at runtime can load code the author never intended, especially if any part of the path is attacker-influenced.',
    fix: 'Import from a fixed allow-list of module names and map user input onto that list.',
    resources: [{ label: 'CWE-829: Untrusted Functionality Inclusion', url: CWE(829) }],
  },
  'Debug Mode Enabled': {
    tags: ['CWE-489', 'Misconfiguration', 'OWASP A05'],
    why: 'Debug mode exposes stack traces, configuration, and in some frameworks an interactive console — a direct path to remote code execution when it reaches production.',
    fix: 'Drive the debug flag from environment configuration and ensure it is off by default, so production cannot enable it accidentally.',
    resources: [
      { label: 'OWASP Top 10 A05: Security Misconfiguration', url: 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/' },
      { label: 'CWE-489: Active Debug Code', url: CWE(489) },
    ],
  },
  'Debug Statements': {
    tags: ['CWE-532', 'Logging'],
    why: 'Console output left in shipped code can leak tokens, user records, and internal structure into logs and browser consoles.',
    fix: 'Route diagnostics through a logger with levels, and strip or disable debug output in production builds.',
    resources: [
      { label: 'OWASP Logging Cheat Sheet', url: CHEATSHEET('Logging_Cheat_Sheet') },
      { label: 'CWE-532: Sensitive Information in Log File', url: CWE(532) },
    ],
  },
  'Excessive Error Suppression': {
    tags: ['CWE-390', 'Error Handling'],
    why: 'Swallowing errors hides failed security checks: the code continues as if the check passed, so a failure looks identical to success.',
    fix: 'Handle each error case explicitly and let unexpected errors surface rather than resuming past them.',
    resources: [{ label: 'CWE-390: Error Condition Without Action', url: CWE(390) }],
  },
  'Bare Except Clauses': {
    tags: ['CWE-396', 'Error Handling'],
    why: 'A bare except catches everything, including KeyboardInterrupt and genuine security failures, masking problems that should stop execution.',
    fix: 'Catch the specific exception types you can actually handle and re-raise the rest.',
    resources: [{ label: 'CWE-396: Generic Exception Catch', url: CWE(396) }],
  },
  'Assert in Production': {
    tags: ['CWE-617', 'Logic'],
    why: 'Python strips assert statements when run with -O, so any check written as an assertion silently disappears in optimized deployments.',
    fix: 'Use an explicit conditional that raises for anything that enforces a security or correctness invariant.',
    resources: [{ label: 'CWE-617: Reachable Assertion', url: CWE(617) }],
  },
  'Code Comments': {
    tags: ['CWE-546', 'Maintenance'],
    why: 'TODO and FIXME markers frequently flag known-incomplete handling, and occasionally describe the weakness itself to anyone reading the source.',
    fix: 'Resolve the marker or move it to your issue tracker so it is triaged rather than shipped.',
    resources: [{ label: 'CWE-546: Suspicious Comment', url: CWE(546) }],
  },
};

export function referenceFor(title: string): IssueReference {
  return ISSUE_REFERENCE[title] ?? DEFAULT_REFERENCE;
}
