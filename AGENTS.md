# Agent Notes (Tsonic C#)

This repo follows the Tsonic “airplane-grade” architecture rules.

## Generic Policy First (IMPORTANT)

- Every product mechanism must be implemented at the most generic policy/fact/provider level that correctly fits the domain; do not solve repeated compiler/runtime patterns with one-off hardcoded branches.
- Source or target names such as `Map`, `Set`, `Date`, `Array`, `fs`, `C#`, or `Rust` may appear in declarative policy, provider metadata, capability ledgers, and explicit exception definitions, but not as source-family algorithm branches in generic resolution paths.
- When one case exposes a pattern, design the reusable policy engine or provider contract first, then express the case as data/policy over that mechanism.
- Hardcoded special cases are allowed only as narrow policy exceptions with source identity, target identity, reason, required facts, diagnostics, positive and negative tests, and ledger evidence.
- If existing code is hardcoded where a generic policy belongs, delete/rebuild it against the generic mechanism rather than extending the hardcoded path.

## Runtime Semantics

- Product runtime/generated user code must not use runtime reflection, dynamic dispatch, member discovery, or best-effort fallback as language semantics.
- Build-time provider tooling may inspect known first-party assemblies or source metadata, but generated user code must remain statically closed.
- Missing finalized facts or provider metadata must produce deterministic diagnostics instead of guessing.

## Work Hygiene

- Use `.temp/` for Tsonic-specific scratch work and do not use `/tmp`.
- Do not commit `.analysis/` content.
- Do not use `git stash`.
- Never force-push or delete remote branches/tags.
