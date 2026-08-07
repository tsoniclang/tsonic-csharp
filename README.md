# tsonic-csharp

C# target pack for Tsonic.

This package owns C#/.NET-specific source-to-source compilation concerns:

- C# target pack descriptor and registration.
- C# source semantics for neutral and C# primitive imports.
- C# target AST planning and AST-only source printing.
- C# project artifact generation and .NET toolchain handoff.

Tsonic itself remains the generic compiler shell and host. It consumes this package as a target pack.

## Neutral typed locations

The neutral source contract uses `Pointer<T>` with `addressOf`,
`allocatePointer`, `loadPointer`, and `storePointer`. The C# target consumes
the finalized TSTS operation facts and lowers the contract to one closed
`Tsonic.CSharp.Runtime.Location<T>` representation.

```ts
let value: int32 = 1;
const pointer = addressOf(value);
storePointer(pointer, 2);
```

```csharp
int value = 1;
Location<int> pointer = Location<int>.Create(
    () => value,
    next => value = next);
pointer.Store(2);
```

Address acquisition captures property receivers and element indexes exactly
once. `allocatePointer` creates independent storage. The target retains `ptr`
and `fnptr` only as C#-flavoured type aliases; neutral `Pointer<T>` remains a
typed location, while CLR provider pointer types remain native C# pointer
types when provider metadata explicitly selects them.
