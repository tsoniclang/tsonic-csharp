# Agent Notes (Tsonic C#)

This repo follows the Tsonic “airplane-grade” architecture rules.

## Generic Policy First (IMPORTANT)

- Every product mechanism must be implemented at the most generic policy/fact/provider level that correctly fits the domain; do not solve repeated compiler/runtime patterns with one-off hardcoded branches.
- Source or target names such as `Map`, `Set`, `Date`, `Array`, `fs`, `C#`, or `Rust` may appear in declarative policy, provider metadata, capability ledgers, and explicit exception definitions, but not as source-family algorithm branches in generic resolution paths.
- This rule applies across all analysis layers, not only surfaces: source semantics, target type resolution, object-shape analysis, runtime-carrier lifecycle, operation providers, backend planning, compat/runtime lanes, tests, and capability ledgers.
- Concrete source/target names are data. Generic algorithms consume selected TSTS declarations/signatures, provider metadata, finalized facts, source identities, and policy entries; they must not branch on source-family spellings or target member names.
- When one case exposes a pattern, design the reusable policy engine or provider contract first, then express the case as data/policy over that mechanism.
- Hardcoded special cases are allowed only as narrow policy exceptions with source identity, target identity, reason, required facts, diagnostics, positive and negative tests, and ledger evidence.
- If existing code is hardcoded where a generic policy belongs, delete/rebuild it against the generic mechanism rather than extending the hardcoded path.
- Treat hardcoding as an architecture smell by default. Before keeping any concrete source/target name, prove it belongs in declarative policy, provider metadata, tests, or a documented exception; otherwise rethink the abstraction.

## Runtime Semantics

- Product runtime/generated user code must not use runtime reflection, dynamic dispatch, member discovery, or best-effort fallback as language semantics.
- Build-time provider tooling may inspect known first-party assemblies or source metadata, but generated user code must remain statically closed.
- Missing finalized facts or provider metadata must produce deterministic diagnostics instead of guessing.

## Explicit Target Semantics (IMPORTANT)

- Explicit is the default: represent each independently controllable C# behavior with its own fact, marker, dialect rule, or project setting. Absence means that behavior was not selected; never derive it from a neighboring control.
- Preserve independent target-language controls as independent compiler contracts. Do not make one marker, fact, project option, or emitted construct imply another unless the target language specification itself defines that implication.
- In particular, native pointer shape, lexical `unsafe` context, declaration-level caller safety, and project permission to compile unsafe code are separate C# semantics.
- Emit only the target-language implications that are mandatory for the selected language version. Never add broader implicit behavior for convenience, because future target versions may change one control without changing the others.
- Tie every mandatory implicit coupling to the selected C# language version and prove that exact rule in tests. Current Roslyn acceptance, convention, proximity, or convenience is not a semantic contract.
- If source evidence does not explicitly select a target semantic and the target specification does not require it, omit it or reject precisely; do not infer it from nearby syntax, types, configuration, or another marker.

## .NET Toolchain Config Boundary

- Advanced .NET build/toolchain configuration belongs in user-owned `.csproj`/MSBuild files, not in `tsonic.json`.
- Keep SDK selection, framework/package/reference items, assembly aliases, analyzers, publish profiles, trimming, NativeAOT knobs, deployment settings, and other open-ended MSBuild/NuGet configuration in the .NET project file when the .NET toolchain already supports them.
- Do not add parallel C# target config for those knobs unless the value is compiler semantic input, provider metadata selection, source-profile selection, or deterministic codegen policy.
- User-owned project mode must emit generated C# sources without mutating the user `.csproj`; the user project owns how generated sources are included and built.
- If emitted C# requires alias-qualified type names or other code semantics, C# must prove and emit that source shape from explicit source/provider facts. The `.csproj` may declare the build alias, but it must not become a hidden semantic fallback.

## Work Hygiene

- Use `.temp/` for Tsonic-specific scratch work and do not use `/tmp`.
- Do not commit `.analysis/` content.
- Do not use `git stash`.
- Never use `git add -f` / `git add --force`. Force-add is banned outright.
  - `.gitignore` is the authority on what belongs in the repository. If a path is ignored, it is not tracked; that is the decision, not an obstacle to route around.
  - This applies to `.analysis/`, `.temp/`, `.tests/`, `.todos/`, build output, and every other ignored path. Investigation and planning documents stay untracked.
  - If something genuinely must be tracked, change `.gitignore` in its own reviewed commit and explain why. Do not bypass the ignore rule per-file.
- Never force-push or delete remote branches/tags.

## Review Scope and Status

- Review an in-progress checkpoint against the scope explicitly claimed complete at that checkpoint, not against the eventual end state. Verify completed items fully; list known unstarted or explicitly deferred items as remaining status rather than presenting them as newly discovered failures of the completed scope.
- Keep checkpoint quality and overall completion separate. If known work remains, say the branch/task is incomplete, while stating precisely whether the completed checkpoint itself satisfies its claimed acceptance criteria.

## Test Rerun Efficiency

- Expectation-only reruns are a narrow exception to complete-suite final gates: when a completed full run has exactly one failure, inspection proves the expectation is stale, and the only subsequent edit changes that expectation with no product, build, configuration, fixture-input, or semantic change, run only the owning focused test.
- Certify that case explicitly as the preceding full run plus the focused corrected test; do not repeat the expensive full suite.
- If the expectation change reflects or approves different product behavior, language semantics, generated output, fixtures, or toolchain policy, it is not expectation-only and still requires the normal full final gate.
