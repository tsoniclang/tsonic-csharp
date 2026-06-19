# tsonic-csharp

C# target pack for Tsonic.

This package owns C#/.NET-specific source-to-source compilation concerns:

- C# target pack descriptor and registration.
- C# source semantics for neutral and C# primitive imports.
- C# target AST planning and AST-only source printing.
- C# project artifact generation and .NET toolchain handoff.

Tsonic itself remains the generic compiler shell and host. It consumes this package as a target pack.
