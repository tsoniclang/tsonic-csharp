# Agent Notes (Tsonic C#)

The workspace policy in `../AGENTS.md` applies. This file contains only C#-
target deltas.

## C# Target Ownership

- This repository owns C# semantic classification, sealed target facts,
  planning, C# AST construction/printing, provider integration, generated
  `.csproj` support, and .NET toolchain handoff.
- Generated C# and product runtime paths are statically closed. Assembly
  reflection is permitted only in build-time provider tooling over explicit
  metadata inputs.

## Independent C# Controls

- Native pointer shape, lexical `unsafe` context, declaration-level
  requires-unsafe contracts, and project permission to compile unsafe code are
  independent semantics.
- Represent each with its own source fact or policy. Do not infer one from
  another unless the selected C# specification mandates that exact coupling.
- Tie mandatory coupling to the selected C# language version and prove it with
  tests. Roslyn acceptance alone is not the contract.

## .NET Project Boundary

- SDK selection, frameworks/packages/references, aliases, analyzers, publish
  profiles, trimming, NativeAOT, deployment, and other open-ended MSBuild/NuGet
  controls belong in user-owned `.csproj` or MSBuild files.
- Add C# target configuration only for compiler semantics, provider/source-
  profile selection, or deterministic codegen policy.
- User-owned project mode emits C# sources without mutating the user's project.
  Alias-qualified names and other source semantics must be proven from explicit
  facts and emitted directly, never recovered from project configuration.
