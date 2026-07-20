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
