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
`allocatePointer`, `loadPointer`, `storePointer`, and `equalPointer`. The C#
target consumes the finalized TSTS operation facts once, converts them into
C#-owned typed-location operations, and lowers that target model to one
closed `Tsonic.CSharp.Runtime.Location<T>` representation. The backend never
reads the neutral pointer fact directly.

```ts
let value: int32 = 1;
const pointer = addressOf(value);
storePointer(pointer, 2);
const same = equalPointer(pointer, addressOf(value));
```

```csharp
int value = 1;
object locationIdentity = new object();
Location<int> pointer = Location<int>.CreateLocal(
    locationIdentity,
    () => value,
    next => value = next);
pointer.Store(2);
bool same = Location<int>.Same(
    pointer,
    Location<int>.CreateLocal(
        locationIdentity,
        () => value,
        next => value = next));
```

Every emitted local or parameter whose address is taken receives one identity
token per storage activation. Reference members use the exact receiver and
selected member identity. Array elements use the exact array reference and a
canonical integral index; address formation evaluates and validates that
index once. Provider and project indexers reject until their provider supplies
an exact location-equivalence policy. `allocatePointer` creates independent
storage, and `equalPointer` compares these canonical identities, including
`undefined` pointer values.

Source-core value-type fields retain their exact `field<T>()` fact when
TypeScript's checker type collapses aliases such as `int32` to `number`.
Their locations use `ProjectMember<T>` so a store writes the modified value
type back through its owner location. `for-of` and `for-in` bindings receive
identity at their actual lexical or `var` activation. Addressing a traditional
`for (let ...)` initializer or a destructured `var` `for-of` binding currently
fails with an exact target diagnostic because the existing C# loop shape
cannot preserve those escaping storage identities.

The target retains `ptr` and `fnptr` only as C#-flavoured type aliases;
neutral `Pointer<T>` remains a typed location, while CLR provider pointer
types remain native C# pointer types when provider metadata explicitly
selects them.

C#-flavoured source aliases are owned only by `@tsonic/csharp/lang.js`:

| C# alias | Selected source meaning |
| --- | --- |
| `out(value)` | write-only reference argument |
| `ref(value)` | read/write reference argument |
| `inref(value)` | read-only reference argument |
| `defaultof<T>()` | default value |
| `ptr<T>` | native C# pointer type marker |
| `fnptr<T>` | native C# function-pointer type marker |

Neutral code instead imports `writeOnlyRef`, `readWriteRef`, `readOnlyRef`,
`defaultValue`, `Pointer`, and `FunctionPointer` from `@tsonic/core`.
