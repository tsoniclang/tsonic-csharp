import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { valueStructProofFiles } from "../../../../tsonic/test/fixtures/value-structs.mjs";
import { valueRecordMemoryProofFiles } from "../../../../tsonic/test/fixtures/value-record-memory.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { closedGenericDispatchProofFiles, closedGenericDispatchPackageFiles, closedGenericDispatchPackageGraph } from "../../../../tsonic/test/fixtures/closed-generic-dispatch.mjs";
import { fixedArrayMemoryProofFiles } from "../../../../tsonic/test/fixtures/fixed-array-memory.mjs";
import { caughtErrorProofFiles } from "../../../../tsonic/test/fixtures/caught-errors.mjs";
import { numberBoxingProof, numberBoxingOutput } from "../../../../tsonic/test/fixtures/number-boxing.mjs";
import { genericBaseConstructorFiles } from "../../../../tsonic/test/fixtures/generic-base-constructors.mjs";
import { explicitErrorStackSource, invalidErrorStackSources } from "../../../../tsonic/test/fixtures/explicit-error-stacks.mjs";
import { sourceClassAnnotationSource, invalidSourceClassAnnotations } from "../../../../tsonic/test/fixtures/source-class-annotations.mjs";
import { pointerViewFiles } from "../../../../tsonic/test/fixtures/pointer-views.mjs";
import { jsArrayCopyFiles } from "../../../../tsonic/test/fixtures/js-array-copy.mjs";
import { sourcePackageCallbackErrorFiles, sourcePackageCallbackErrorGraph } from "../../../../tsonic/test/fixtures/source-package-callback-errors.mjs";
import { falliblePointerFiles, falliblePointerPackageFiles, falliblePointerPackageGraph } from "../../../../tsonic/test/fixtures/fallible-pointer-views.mjs";
import { nativeV8FlagsSource } from "../../../../tsonic/test/fixtures/native-v8-flags.mjs";
import { nativeV8HeapSource } from "../../../../tsonic/test/fixtures/native-v8-heap.mjs";
import { boundMemoryRecordProofFiles } from "../../../../tsonic/test/fixtures/bound-memory-records.mjs";
import { emptyMemoryRecordProofFiles } from "../../../../tsonic/test/fixtures/empty-memory-records.mjs";
import { broadValueNarrowingSource } from "../../../../tsonic/test/fixtures/broad-value-narrowing.mjs";
import { logicalAccessAssignmentSource } from "../../../../tsonic/test/fixtures/logical-access-assignment.mjs";
import { mixedWidthRecordSource } from "../../../../tsonic/test/fixtures/mixed-width-records.mjs";
import { numberArrayUnionFiles } from "../../../../tsonic/test/fixtures/number-array-unions.mjs";
import { recursiveSourceUnionFiles } from "../../../../tsonic/test/fixtures/recursive-source-unions.mjs";
import { frozenObjectSources } from "../../../../tsonic/test/fixtures/frozen-objects.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { structuralMethodRestSource, receiverBoundMethodRestSource } from "../../../../tsonic/test/fixtures/structural-method-rest.mjs";
import { compoundIndexedWriteSource } from "../../../../tsonic/test/fixtures/compound-indexed-write.mjs";
import { bigintOperatorSource } from "../../../../tsonic/test/fixtures/bigint-operators.mjs";
import { jsNumericPropertySource } from "../../../../tsonic/test/fixtures/js-numeric-properties.mjs";
import { flowClassReadSource } from "../../../../tsonic/test/fixtures/flow-class-reads.mjs";
import { referenceDefaultSource } from "../../../../tsonic/test/fixtures/reference-defaults.mjs";
import { structuralEnumerationSource } from "../../../../tsonic/test/fixtures/structural-enumeration.mjs";
import { nativeNodeSpawnSource } from "../../../../tsonic/test/fixtures/native-node-spawn.mjs";

test("Node spawn preserves binary views, option aliases, child environment and failures", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeNodeSpawnSource(process.execPath) });
  execute(compiled, "native-node-spawn", false, false, [
    join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
  ]);
});

for (const surface of [undefined, "js"]) {
  test(`structural enumeration retains actual keys without reading getters (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: structuralEnumerationSource });
    execute(compiled, `structural-enumeration-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /ReadOnlySpan<string>/);
    assert.match(output, /private static readonly string\[\] __tsonicObjectEnumerableKeyStorage/);
    assert.doesNotMatch(output, /GetProperties|GetFields|System\.Reflection/);
  });
  test(`reference defaults remain lazy for methods and delegates (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: referenceDefaultSource }), `reference-defaults-${surface ?? "native"}`);
  });
  test(`class flow reads preserve declaration storage and selected members (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: flowClassReadSource }), `flow-class-reads-${surface ?? "native"}`);
  });
}

test("BigInt operators retain exact counts, source errors and compound evaluation order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: bigintOperatorSource }), "bigint-operators");
});

test("JS numeric array properties retain keys, aliases, presence and length", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: jsNumericPropertySource }), "js-numeric-properties");
});

test("JS indexed compound writes preserve evaluation order and exact result carriers", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: compoundIndexedWriteSource }), "compound-indexed-write");
});

test("object rest retains stored method values through reordered structural interfaces", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: structuralMethodRestSource }), "structural-method-rest");
});

test("object rest never binds a copied method to its original receiver", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: receiverBoundMethodRestSource });
  assert.equal(compiled.artifacts.size, 0);
  assert.ok(compiled.result.diagnostics.some(({ code, message }) =>
    code === "CSHARP_UNSUPPORTED_AST" && message.includes("copied method-value contract")));
});

function execute(compiled, name, asynchronous = false, allowUnsafe = false, additionalReferences = []) {
  assertCsharpCompilationSucceeded(compiled);
  const scratch = fileURLToPath(new URL("../../../.temp/", import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, `${name}-`));
  for (const [path, text] of compiled.artifacts) {
    if (!path.endsWith(".cs")) continue;
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  if (!compiled.artifacts.has("generated/TsonicEntrypoint.cs")) {
    writeFileSync(join(root, "Program.cs"), `if (!(${asynchronous ? "await " : ""}Tsonic.Generated.Index.run())) throw new System.Exception("source construction contract");`);
  }
  const references = [
    join(testRepositoryRoots.csharpRuntime, "src/Tsonic.CSharp.Runtime/Tsonic.CSharp.Runtime.csproj"),
    join(testRepositoryRoots.csharpJs, "src/Tsonic.CSharp.Js/Tsonic.CSharp.Js.csproj"),
    ...additionalReferences,
  ];
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
<AllowUnsafeBlocks>${allowUnsafe}</AllowUnsafeBlocks>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup>${references.map(path => `<ProjectReference Include="${path}" />`).join("")}</ItemGroup></Project>`);
  const native = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet"], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304,
  });
  assert.equal(native.status, 0, `${native.error ?? ""}\n${native.stdout}\n${native.stderr}`);
  return native.stdout;
}

for (const surface of [undefined, "js"]) {
  const profile = surface ?? "native";
  test(`explicit Error stacks execute without implicit capture (${profile})`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: explicitErrorStackSource }), `explicit-error-stack-${profile}`);
    for (const sourceText of invalidErrorStackSources) {
      const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText });
      assert.match(compiled.sourceDiagnosticsText, /error TS/u);
    }
  });
  test(`abstract declarations and readonly annotations preserve native dispatch (${profile})`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: sourceClassAnnotationSource }), `class-annotations-${profile}`);
    for (const { source: sourceText, code } of invalidSourceClassAnnotations) {
      const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText });
      assert.ok(compiled.sourceDiagnosticsText.includes(code), compiled.sourceDiagnosticsText);
    }
  });
}

test("numeric array presence preserves holes, boundary keys and evaluation order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
let order = "";
const values = new Array<number>(2);
values[1] = 0;
function index(): number { order += "i"; return 1; }
function array(): number[] { order += "a"; return values; }
export function run(): boolean {
  const present = index() in array();
  return present && order === "ia" && !(0 in values) && !(-0 in values) &&
    !(-1 in values) && !(0.5 in values) && !(2 in values) && !(Number.POSITIVE_INFINITY in values) && !(Number.NaN in values);
}` }), "numeric-array-presence");
});

for (const [name, source] of Object.entries(frozenObjectSources)) {
  test(`frozen reference objects preserve ${name}`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface: "js", sourceText: `${source}\nexport function run(): boolean { main(); return true; }` }), `frozen-${name}`);
  });
}

test("reference defaults evaluate in the callee only for omitted and undefined arguments", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
let calls = 0;
const token = {value: 4};
function make(): {value: number} { calls += 1; return token; }
class Holder { value: {value: number}; constructor(value = make()) { this.value = value; } }
export function run(): boolean {
  const first = new Holder();
  const second = new Holder(undefined);
  const other = {value: 8};
  const third = new Holder(other);
  return calls === 2 && first.value === token && second.value === token && third.value === other;
}` }), "reference-defaults");
});

test("generic literal arguments preserve exact carrier inference regardless of argument order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ sourceText: `
import { allocatePointer, loadPointer, storePointer } from "@tsonic/core/lang.js";
import type { Pointer, uint32 } from "@tsonic/core/types.js";
function first<T>(value: T, location: Pointer<T>): T { storePointer(location, value); return loadPointer(location); }
function last<T>(location: Pointer<T>, value: T): T { return first(value, location); }
export function run(): boolean {
  const location = allocatePointer<number>(1);
  const wide = allocatePointer<uint32>(0);
  return first(9, location) === 9 && last(location, 12) === 12 && first(4294967295, wide) === 4294967295;
}` }), "generic-literal-inference");
});

test("writable methods select before arguments and retain previously selected functions", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
export class Counter { value(step: number): number { return step + 1; } }
function replace(counter: Counter): number { counter.value = (step: number): number => step + 10; return 2; }
export function run(): boolean {
  const counter = new Counter();
  const before = counter.value;
  const selected = counter.value(replace(counter));
  return selected === 3 && counter.value(2) === 12 && before(2) === 3;
}` });
  compiled.artifacts.set("generated/TsonicEntrypoint.cs", `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("method evaluation order");
var counter = new Tsonic.Generated.Counter();
var selected = counter.value;
if (!object.ReferenceEquals(selected, counter.value)) throw new System.Exception("method identity");
for (var warmup = 0; warmup < 10000; warmup++) System.GC.KeepAlive(counter.value);
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) System.GC.KeepAlive(counter.value);
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("method read allocated");
counter.value = step => step + 10;
if (selected(2) != 3 || counter.value(2) != 12) throw new System.Exception("method replacement");
`);
  execute(compiled, "writable-methods");
});

for (const surface of [undefined, "js"]) {
  test(`inline structural construction retains own keys (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: `
function keys(value: { count: number; label: string }): string {
  let result = "";
  for (const key in value) result += key + ",";
  return result;
}
export function run(): boolean {
  const count = 1;
  return keys({ label: "first", count }) === "label,count,";
}` }), `inline-enumeration-${surface ?? "native"}`);
  });
  test(`mapped readonly arguments preserve identity and independent copies (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: `
type Item = { count: number; label: string };
function read(value: Readonly<Item>): number { return value.count; }
function clone(value: Readonly<Item>): Item { return { ...value }; }
export function run(): boolean {
  const item: Item = { count: 1, label: "first" };
  const view: Readonly<Item> = item;
  const copy = clone(view);
  item.count = 7;
  copy.count = 9;
  return read(view) === 7 && copy.count === 9 && item.count === 7;
}` }), `mapped-readonly-${surface ?? "native"}`);
  });
}

test("constant initializer storage remains native without read-time numeric casts", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
const total = 1;
function selected(): number { const value = 2; return value; }
export function run(): boolean { return total === 1 && selected() === 2; }
` });
  execute(compiled, "constant-native-storage");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /int value = 2;/);
  assert.match(output, /static int total\b/);
  assert.doesNotMatch(output, /\(int\)(?:value|total)/);
});

test("JavaScript error subclasses preserve constructor, call and base identity", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
export function run(): boolean {
  const first = new TypeError("first");
  const second = RangeError("second");
  const third = new URIError("third");
  return first instanceof Error && first instanceof TypeError && !(first instanceof RangeError) &&
    second instanceof Error && second instanceof RangeError && third instanceof URIError && first.message === "first";
}` }), "error-subclasses");
});

test("a local same-spelled error constructor remains source-owned", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
class TypeError { value = 9; }
export function run(): boolean { const value = new TypeError(); return value.value === 9; }
` }), "shadowed-error-subclass");
});

for (const valueRepresentation of [false, true]) {
  for (const surface of [undefined, "js"]) {
    const label = `${valueRepresentation ? "value" : "reference"}-${surface ?? "native"}`;
    test(`bound records retain live field locations, ownership and errors in ${label}`, { timeout: 300_000 }, () => {
      const files = boundMemoryRecordProofFiles(valueRepresentation);
      execute(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
        sourceText: files["index.ts"],
        files: Object.fromEntries(Object.entries(files).filter(([path]) => path !== "index.ts")),
      }), `bound-records-${label}`);
    });
  }
}

test("typed and ordinary numeric array unions preserve reads, width and copy independence", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
    sourceText: `${numberArrayUnionFiles["index.ts"]}\nif (!run()) throw new Error("number array union contract");`,
    files: { "arrays.ts": numberArrayUnionFiles["arrays.ts"] },
  }), "number-array-unions");
});

for (const surface of [undefined, "js"]) {
  test(`type-only brands erase without removing ordinary class fields in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
class Box {
  declare private readonly then?: never;
  declare private readonly anotherBrand: void;
  value: number = 3;
  read(): number { return this.value; }
}
export function run(): boolean {
  const first = new Box();
  const second = first;
  second.value = 9;
  return first.read() === 9;
}` });
    execute(compiled, `type-only-brands-${surface ?? "native"}`);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\b(?:then|anotherBrand)\b/u);
  });
  test(`recursive generic and mutually recursive union records execute in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: recursiveSourceUnionFiles["index.ts"],
      files: Object.fromEntries(Object.entries(recursiveSourceUnionFiles).filter(([path]) => path !== "index.ts")),
    }), `recursive-union-records-${surface ?? "native"}`);
  });
}

for (const sparse of ["new Array<number>(3)", "[1, 2]"]) {
  test(`numeric array union copying requires density for ${sparse}`, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
      files: { "arrays.ts": numberArrayUnionFiles["arrays.ts"] },
      sourceText: `import { copy } from "./arrays.js";
        const values = ${sparse}; delete values[0]; copy(values);`,
    });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.ok(compiled.targetDiagnostics.some(diagnostic => diagnostic.message.includes("ArrayConstructor.from")));
    assert.equal(compiled.artifacts.size, 0);
  });
}

for (const surface of [undefined, "js"]) {
  test(`nested record fields retain exact signed and unsigned widths in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: mixedWidthRecordSource }), `mixed-width-records-${surface ?? "native"}`);
  });
  test(`logical accessor assignments preserve both lanes and short-circuit effects in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: logicalAccessAssignmentSource }), `logical-access-${surface ?? "native"}`);
  });
  test(`non-nullish unknown retains its value and identity in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: broadValueNarrowingSource }), `broad-value-narrowing-${surface ?? "native"}`);
  });
  test(`empty memory records preserve zero-field bindings in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const files = emptyMemoryRecordProofFiles(surface === "js");
    execute(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
      sourceText: files["index.ts"],
      files: { "schema.ts": files["schema.ts"] },
    }), `empty-memory-record-${surface ?? "native"}`);
  });
  test(`native V8 heap observations fail only on invocation in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, capabilities: [nodejsCapability()],
      sourceText: nativeV8HeapSource }), `native-v8-heap-${surface ?? "native"}`, false, false, [
        join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
      ]);
  });
  test(`native V8 flags fail only on explicit invocation in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, capabilities: [nodejsCapability()],
      sourceText: nativeV8FlagsSource }), `native-v8-flags-${surface ?? "native"}`, false, false, [
        join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
      ]);
  });
}

for (const [name, files] of [["files", falliblePointerFiles], ["packages", falliblePointerPackageFiles]]) {
  for (const surface of [undefined, "js"]) {
    test(`fallible pointer callbacks preserve aliases and errors across ${name}, ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      execute(compileCsharpSource({ surface, sourceText: files["index.ts"],
        sourcePackages: name === "packages" ? falliblePointerPackageGraph : undefined,
        files: Object.fromEntries(Object.entries(files).filter(([path]) => path !== "index.ts")),
      }), `fallible-locations-${name}-${surface ?? "native"}`);
    });
  }
}

test("retained cross-package callbacks preserve the original thrown object", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: sourcePackageCallbackErrorFiles["index.ts"],
    sourcePackages: sourcePackageCallbackErrorGraph,
    files: Object.fromEntries(Object.entries(sourcePackageCallbackErrorFiles).filter(([path]) => path !== "index.ts")),
  }), "package-callback-errors");
});

test("Array.from preserves dense copies and materializes sparse undefined entries", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: jsArrayCopyFiles["index.ts"] }), "js-array-copy");
});

for (const [label, source] of [
  ["a scalar hole", "const values: number[] = new Array<number>(2);"],
  ["a null-only payload with a hole", "const values: (number | null)[] = new Array<number | null>(2);"],
  ["length expansion", "const values = [1]; values.length = 3;"],
  ["deletion through an alias", "const values = [1]; const alias = values; delete alias[0];"],
]) {
  test(`Array.from rejects ${label} without a representable undefined element`, () => {
    const result = compileCsharpSource({ surface: "js", sourceText: `
export function copy(): number { ${source} return Array.from(values).length; }
` });
    assert.equal(result.result.artifacts.length, 0);
    assert.ok(result.result.diagnostics.some(diagnostic => diagnostic.code === "TS9101001" &&
      diagnostic.message.includes("js.ArrayConstructor.from.member")));
  });
}

test("number-domain scalar boxing preserves complete values and evaluation order", { timeout: 300_000 }, () => {
  assert.equal(execute(compileCsharpSource({ surface: "js", sourceText: numberBoxingProof }),
    "number-boxing"), numberBoxingOutput);
});

test("broad values distinguish null, undefined and source reference identity", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
class Item { value = 3; }
function absent(value: unknown): boolean { return value === undefined && value !== null; }
function nil(value: unknown): boolean { return value === null && value !== undefined; }
function same(left: unknown, right: unknown): boolean { return left === right; }
export function run(): boolean {
  const value = new Item();
  const empty = {};
  return absent(undefined) && !absent(null) && nil(null) && !nil(undefined) &&
    same(value, value) && !same(value, new Item()) && same(empty, empty) && !same(empty, {});
}` }), "broad-reference-nullish");
});

test("inferred pointer loads preserve concrete conditional aliases and native widths", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { Pointer, uint32 } from "@tsonic/core/types.js";
import { allocatePointer, loadPointer } from "@tsonic/core/lang.js";
type Selected<T> = T extends string ? string : T;
class Box<T> { value: T; constructor(value: T) { this.value = value; } }
function read(pointer: Pointer<Box<Selected<uint32>>>): Selected<uint32> {
  return loadPointer(pointer).value;
}
export function run(): boolean {
  const maximum: uint32 = 4294967295;
  return read(allocatePointer(new Box<uint32>(maximum))) === maximum;
}
` }), "inferred-pointer-alias");
});

for (const surface of [undefined, "js"]) {
  test(`read-free pointer views retain aliases and optional ownership in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: pointerViewFiles["index.ts"],
      files: { "view.ts": pointerViewFiles["view.ts"] } }), `pointer-views-${surface ?? "native"}`);
  });
  test(`installed source-package generic dispatch executes in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: closedGenericDispatchPackageFiles["index.ts"],
      sourcePackages: closedGenericDispatchPackageGraph,
      files: Object.fromEntries(Object.entries(closedGenericDispatchPackageFiles).filter(([path]) => path !== "index.ts")) }),
    `package-generic-dispatch-${surface ?? "native"}`);
  });
  test(`implicit generic base constructors retain owner and initializer effects in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: genericBaseConstructorFiles["index.ts"],
      files: { "base.ts": genericBaseConstructorFiles["base.ts"] } }), `generic-base-${surface ?? "native"}`);
  });
  test(`caught builtin Errors retain identity and stack in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: caughtErrorProofFiles["index.ts"],
      files: { "failures.ts": caughtErrorProofFiles["failures.ts"] } }), `caught-errors-${surface ?? "native"}`);
  });
  test(`shared fixed-array native layout preserves strides and snapshots in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
      sourceText: fixedArrayMemoryProofFiles["index.ts"], files: { "layout.ts": fixedArrayMemoryProofFiles["layout.ts"] } }),
    `fixed-array-memory-${surface ?? "native"}`, false, true);
  });
  test(`shared cross-file generic virtual dispatch executes in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: closedGenericDispatchProofFiles["index.ts"],
      files: { "dispatch.ts": closedGenericDispatchProofFiles["dispatch.ts"] } }),
    `closed-generic-dispatch-${surface ?? "native"}`);
  });
  test(`shared value record native layout preserves copies and aliases in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
      sourceText: valueRecordMemoryProofFiles["index.ts"], files: { "layout.ts": valueRecordMemoryProofFiles["layout.ts"] } }),
    `value-record-memory-${surface ?? "native"}`, false, true);
  });
  test(`shared value-struct storage and location contract executes in ${surface ?? "native"} source`, { timeout: 300_000 }, () => {
    execute(compileCsharpSource({ surface, sourceText: valueStructProofFiles["index.ts"],
      files: { "records.ts": valueStructProofFiles["records.ts"] } }), `value-struct-${surface ?? "native"}`);
  });
}

test("void results retain unit calls, nullable conversion and equality effects", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
let visits = 0;
function value(): number { visits += 1; return visits; }
function unit(): void { visits += 1; }
function optional(value: number | undefined): boolean { return value === undefined; }
function compare(value: number | undefined): boolean { return value === void unit(); }
export function run(): boolean {
  return String(void value()) === "undefined" && String(void unit()) === "undefined" &&
    optional(void value()) && optional(void unit()) && compare(undefined) && visits === 5;
}
` }), "void-source-values");
});

test("void awaited unit and value operands preserve completion order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
let visits = 0;
async function value(): Promise<number> { visits += 1; return visits; }
async function unit(): Promise<void> { visits += 1; }
function optional(value: number | undefined): boolean { return value === undefined; }
export async function run(): Promise<boolean> {
  return optional(void await value()) && optional(void (await unit())) && visits === 2;
}
` }), "void-awaited-values", true);
});

test("qualified source builtins retain static operations and local shadows", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
function local(globalThis: { String: { fromCharCode: (value: number) => number } }): number {
  return globalThis.String.fromCharCode(7);
}
export function run(): boolean {
  const codes = [65, 66];
  const frozen = globalThis.Object.freeze({});
  return globalThis.String.fromCharCode(...codes) === "AB" &&
    (globalThis).String.fromCharCode(65) === "A" &&
    (globalThis.String).fromCodePoint(128512) === "😀" &&
    globalThis["String"].fromCharCode(...codes) === "AB" &&
    globalThis.Math.max(...[3, 7]) === 7 && globalThis.Object.isFrozen(frozen) &&
    local({ String: { fromCharCode: value => value + 1 } }) === 8;
}
` }), "qualified-source-builtins");
});

test("numeric sequence arguments retain holes, widths and source evaluation order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
function check(value: boolean): void { if (!value) throw new Error("sequence contract"); }
export function run(): boolean {
  const bytes: uint8[] = [65, 66];
  const empty: number[] = [];
  check(String.fromCharCode(...bytes, ...empty, ...[67, 68]) === "ABCD");
  check(String.fromCharCode(...empty) === "");
  check(String.fromCharCode(...[]) === "");
  const tuple: [uint8, number] = [65, 66];
  check(String.fromCharCode(...tuple) === "AB");
  let tupleReads = 0;
  const readTuple = (): [uint8, number] => { tupleReads += 1; return tuple; };
  check(String.fromCharCode(...readTuple(), ...[], 67) === "ABC" && tupleReads === 1);
  check(String.fromCodePoint(...[128512]) === "😀");
  check(Math.max(2, ...[3, 8], ...empty, 4) === 8);
  check(Math.min(...[3, 8], 2) === 2 && Math.hypot(...[3, 4]) === 5);
  const holes = new Array<number>(2);
  holes[0] = 65;
  check(String.fromCharCode(...holes) === "A\\0" && Number.isNaN(Math.max(...holes)));
  const mutable: number[] = [66];
  let evaluations = 0;
  const next = (): number => { evaluations += 1; mutable[0] = 88; return 67; };
  check(String.fromCharCode(65, ...mutable, next(), ...mutable) === "ABCX");
  check(evaluations === 1 && mutable[0] === 88);
  let caught = 0;
  try { String.fromCodePoint(...[1.5], next()); } catch { caught += 1; }
  check(caught === 1 && evaluations === 2);
  const fail = (): number => { throw new Error("stop"); };
  try { String.fromCharCode(...bytes, fail(), next()); } catch { caught += 1; }
  check(caught === 2 && evaluations === 2);
  return true;
}
` }), "numeric-rest-sequences");
});

test("character constructors preserve numeric coercion and exact runtime rejection", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
export function run(): boolean {
  const byte: uint8 = 66;
  const text = String.fromCharCode(65.9, byte, 67);
  const unicode = globalThis.String.fromCodePoint(0x1F600);
  let rejected = false;
  try { String.fromCodePoint(65.9); } catch { rejected = true; }
  return text === "ABC" && unicode === "😀" && rejected &&
    String.fromCharCode(-1.9).charCodeAt(0) === 65535 &&
    String.fromCharCode(Number.NaN).charCodeAt(0) === 0;
}
` }), "character-construction");
});

test("String construction preserves primitive and numeric-union values natively", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { int64, uint8 } from "@tsonic/core/types.js";
function numeric(value: number | bigint): string { return globalThis.String(value); }
export function run(): boolean {
  const wide: int64 = 9007199254740993n;
  const byte: uint8 = 255;
  let evaluations = 0;
  const evaluate = (): number => { evaluations += 1; return 7; };
  const absent = undefined;
  const missing = (): undefined => { evaluations += 1; return undefined; };
  const absenceChecks = String(absent) === "undefined" &&
    String(void evaluate()) === "undefined" && String(missing()) === "undefined" && evaluations === 2;
  return String() === "" && String(undefined) === "undefined" && String(null) === "null" &&
    String(true) === "true" && String(false) === "false" && String("a😀z") === "a😀z" &&
    String(-0) === "0" && String(1.5) === "1.5" && String(1e21) === "1e+21" &&
    String(Number.NaN) === "NaN" && String(Number.POSITIVE_INFINITY) === "Infinity" &&
    String(Number.NEGATIVE_INFINITY) === "-Infinity" &&
    String(wide) === "9007199254740993" && String(byte) === "255" &&
    String(-18446744073709551617n) === "-18446744073709551617" &&
    numeric(9007199254740993n) === "9007199254740993" && numeric(1.5) === "1.5" &&
    String(evaluate()) === "7" && evaluations === 3 && absenceChecks;
}
` }), "primitive-string-construction");
});

test("mapped native strings retain byte results and Unicode callback order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
export function run(): boolean {
  const bytes = Array.from("Aÿ", (part: string): uint8 => part.charCodeAt(0) as uint8);
  const parts = Array.from("a😀z", (part: string): string => part);
  const indices = Array.from("a😀z", (part: string, index: number): number => index);
  const fractions = Array.from("ab", function (part: string, index: number): number {
    index += 0.5;
    return index;
  });
  const captures = Array.from("ab", (part: string, index: number): (() => number) => {
    const __tsonic_param1 = 0.5;
    index += __tsonic_param1;
    return () => { index += 0.5; return index; };
  });
  const first = captures[0];
  const second = captures[1];
  let count = 0;
  const zero = Array.from("abc", (): number => { count += 1; return count; });
  const empty = Array.from("", (): number => { count += 1; return count; });
  let visited = "";
  let failed = false;
  try {
    Array.from("a😀z", (part: string, index: number): string => {
      visited += part;
      if (index === 1) throw new Error("stop");
      return part;
    });
  } catch { failed = true; }
  return bytes.length === 2 && bytes[0] === 65 && bytes[1] === 255 &&
    parts.length === 3 && parts.join("") === "a😀z" &&
    indices[0] === 0 && indices[2] === 2 && count === 3 &&
    zero[0] === 1 && zero[2] === 3 && empty.length === 0 && failed && visited === "a😀" &&
    fractions[0] === 0.5 && fractions[1] === 1.5 && first() === 1 && first() === 1.5 && second() === 2;
}
` }), "mapped-source-strings");
});

test("lambda parameter adaptation rejects an unproved implicit narrowing", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
export function run(): uint8[] { return Array.from("abc", (part: string, index: uint8): uint8 => index); }
` });
  assert(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_LAMBDA_PARAMETER_TYPE_CONFLICT"));
  assert.equal(compiled.result.artifacts.length, 0);
});

test("unrelated class unions preserve cross-file method dispatch and object aliasing", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", files: {
    "backing.ts": `
      export class TextBacking {
        value: string;
        constructor(value: string) { this.value = value; }
        read(): string { return this.value; }
        change(value: string): void { this.value = value; }
      }
      export class OtherBacking {
        value: string;
        extra: boolean = true;
        constructor(value: string) { this.value = value; }
        read(): string { return this.value; }
        change(value: string): void { this.value = value; }
      }
      export class Wrapper {
        backing: TextBacking | OtherBacking;
        constructor(backing: TextBacking | OtherBacking) { this.backing = backing; }
        read(): string { return this.backing.read(); }
        change(value: string): void { this.backing.change(value); }
      }
      export function retain(backing: OtherBacking | TextBacking): TextBacking | OtherBacking { return backing; }
    `,
  }, sourceText: `
    import { TextBacking, OtherBacking, Wrapper, retain } from "./backing.js";
    export function run(): boolean {
      const first = new TextBacking("first");
      const second = new OtherBacking("second");
      const left = new Wrapper(retain(first));
      const right = new Wrapper(retain(second));
      const initial = left.read() === "first" && right.read() === "second";
      left.change("changed");
      return initial && left.read() === "changed" && first.read() === "changed" && second.read() === "second";
    }
  ` }), "inferred-class-union");
});


test("generic class unions retain optional pointer results, exceptions and call evaluation order", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({
    surface: "js",
    files: { "backing.ts": `
import type { Pointer, uint8 } from "@tsonic/core/types.js";
import { loadPointer } from "@tsonic/core/lang.js";
export class OptionalBacking {
  value: Pointer<uint8>;
  constructor(value: Pointer<uint8>) { this.value = value; }
  read(absent: boolean): Pointer<uint8> | undefined {
    if (absent) return undefined;
    return this.value;
  }
}
export class RequiredBacking {
  value: Pointer<uint8>;
  extra: boolean = true;
  constructor(value: Pointer<uint8>) { this.value = value; }
  read(fail: boolean): Pointer<uint8> {
    if (fail) throw new Error("selected branch");
    return this.value;
  }
}
export class GenericBacking<T> {
  value: T;
  constructor(value: T) { this.value = value; }
  read(fail: boolean): T {
    if (fail) throw new Error("generic branch");
    return this.value;
  }
}
export type Backing = RequiredBacking | GenericBacking<Pointer<uint8>> | OptionalBacking;
export function read(backing: Backing, fail: boolean): uint8 {
  const pointer = backing.read(fail);
  if (pointer === undefined) return 0;
  return loadPointer(pointer);
}
export class Calls {
  order: string = "";
  source(value: Backing): Backing { this.order += "receiver"; return value; }
  argument(): boolean { this.order += "argument"; return false; }
}
export function evaluate(calls: Calls, value: Backing): uint8 {
  const pointer = calls.source(value).read(calls.argument());
  if (pointer === undefined) return 0;
  return loadPointer(pointer);
}
` },
    sourceText: `
import type { Pointer, uint8 } from "@tsonic/core/types.js";
import { allocatePointer, storePointer } from "@tsonic/core/lang.js";
import { OptionalBacking, RequiredBacking, GenericBacking, Calls, evaluate, read } from "./backing.js";

export function run(): boolean {
  const byte: uint8 = 29;
  const pointer = allocatePointer<uint8>(byte);
  const first = new OptionalBacking(pointer);
  const second = new RequiredBacking(pointer);
  const third = new GenericBacking<Pointer<uint8>>(pointer);
  const initial = read(first, false) === 29 && read(second, false) === 29 && read(third, false) === 29 && read(first, true) === 0;
  storePointer(pointer, 31);
  const retained = read(first, false) === 31 && read(second, false) === 31 && read(third, false) === 31;
  let caught = false;
  try { read(second, true); } catch { caught = true; }
  const calls = new Calls();
  const ordered = evaluate(calls, third) === 31 && calls.order === "receiverargument";
  return initial && retained && caught && ordered;
}
`,
  }), "generic-class-union");
});

test("BigInt construction preserves native integer widths and closed numeric unions", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", files: {
    "values.ts": `
      export function exact(value: number | bigint): bigint { return BigInt(value); }
      export function numberValue(value: number | bigint): number { return Number(value); }
    `,
  }, sourceText: `
    import type { int64, uint64, int128 } from "@tsonic/core/types.js";
    import { exact, numberValue } from "./values.js";
    function convert(value: number): bigint { return BigInt(value); }
    export function run(): boolean {
      const signed: int64 = -9007199254740993n;
      const unsigned: uint64 = 9007199254740993n;
      const wide: int128 = 170141183460469231731687303715884105727n;
      let rejected = false;
      try { convert(1.5); } catch { rejected = true; }
      return rejected && BigInt(signed) === -9007199254740993n &&
        BigInt(unsigned) === 9007199254740993n &&
        BigInt(wide) === 170141183460469231731687303715884105727n &&
        convert(-42) === -42n && globalThis.BigInt(9007199254740993n) === 9007199254740993n &&
        BigInt(true) === 1n && BigInt(false) === 0n && BigInt("0xff") === 255n &&
        exact(9007199254740993n) === 9007199254740993n && exact(2) === 2n &&
        numberValue(9007199254740993n) === 9007199254740992 && numberValue(2) === 2;
    }
  ` }), "bigint-construction");
});

test("length constructors preserve holes and generic fill preserves token identity", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    function filled<T>(length: number, value: T): T[] { return new Array<T>(length).fill(value); }
    function retain(token: object): object { return token; }
    export function run(): boolean {
      const first: object = {};
      const alias = retain(first);
      if (Object.isFrozen(alias)) return false;
      const frozen = Object.freeze(first);
      const second: object = Object.freeze({});
      const tokens = new Set<object>();
      tokens.add(first);
      const slots = new Array<object>(3);
      let visits = 0;
      slots.forEach(() => { visits += 1; });
      if (visits !== 0 || slots.length !== 3) return false;
      slots.fill(first);
      const generic = filled(2, second);
      const empty = new Array<number>(0);
      const items = new Array<number>(3, 4);
      const single = Array.of<number>(3);
      const called = Array<number>(2);
      const integer: int64 = 3n;
      const integerItems = new Array<int64>(integer);
      let rejected = false;
      try { new Array<object>(1.5); } catch { rejected = true; }
      return rejected && frozen === alias && Object.isFrozen(alias) && second !== first &&
        tokens.has(alias) && !tokens.has(second) && slots[0] === alias && slots[2] === alias &&
        generic[0] === second && generic[1] === second && empty.length === 0 &&
        items.length === 2 && single.length === 1 && called.length === 2 &&
        integerItems.length === 1 && integerItems[0] === integer;
    }
  ` }), "array-token-construction");
});

test("same-spelled local functions and object members remain ordinary source", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function BigInt(value: number): number { return value + 1; }
    const Object = { freeze(value: number): number { return value + 2; } };
    export function run(): boolean { return BigInt(4) === 5 && Object.freeze(4) === 6; }
  ` });
  execute(compiled, "construction-shadows");
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /BigIntOps|EmptyObject\.Freeze/u);
});

test("stored Error throws preserve identity across parameters, return values and rethrows", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
    function fail(error: Error): void { throw error; }
    function create(): Error { return new Error("returned"); }
    export function run(): boolean {
      const original = new Error("stored");
      const before = original.stack;
      let caught = 0;
      let cleaned = 0;
      try { throw original; } catch (error) {
        if (error instanceof Error && error === original && error.message === "stored") caught += 1;
      }
      try { fail(original); } catch (error) { if (error === original) caught += 1; }
      try { throw create(); } catch (error) {
        if (error instanceof Error && error.message === "returned") caught += 1;
      }
      try {
        try { fail(original); } catch (error) { throw error; }
        finally { cleaned += 1; }
      } catch (error) { if (error === original) caught += 1; }
      const subtype = new RangeError("bounds");
      try { fail(subtype); } catch (error) { if (error === subtype) caught += 1; }
      return caught === 5 && cleaned === 1 && original.stack === before;
    }
  ` }), "stored-error-transport");
});

test("open objects cannot silently use a closed frozen carrier", () => {
  for (const sourceText of [
    `function freeze(value: object): object { return Object.freeze(value); } export function example(): object { return freeze({ count: 1 }); }`,
  ]) {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert(compiled.extensionDiagnostics.length + compiled.targetDiagnostics.length > 0);
    assert.equal(compiled.artifacts.size, 0);
  }
});

test("generic object aliases retain exact pointer and byte arguments across nullable transport", { timeout: 300_000 }, () => {
  execute(compileCsharpSource({ surface: "js", sourceText: `
    import type { Pointer, uint8 } from "@tsonic/core/types.js";
    import { allocatePointer, loadPointer, storePointer } from "@tsonic/core/lang.js";
    type Region<Element> = { readonly kind: "value"; readonly value: Element }
      | { readonly kind: "pointer"; readonly at: () => Pointer<Element> };
    function retain<Item>(region: Region<Item> | undefined): Region<Item> | undefined { return region; }
    function read(region: Region<uint8> | undefined): uint8 {
      if (region === undefined) return 0;
      if (region.kind === "value") return region.value;
      return loadPointer(region.at());
    }
    function nested<Value>(value: Value): () => () => Value { return () => () => value; }
    export function run(): boolean {
      const byte: uint8 = 29;
      const pointer = allocatePointer<uint8>(byte);
      const first: Region<uint8> = { kind: "value", value: byte };
      const second: Region<uint8> = { kind: "pointer", at: () => pointer };
      const callback = nested("retained")();
      const inline = retain({ kind: "pointer", at: () => pointer });
      storePointer(pointer, 31);
      return read(retain(first)) === byte && read(retain(second)) === 31 &&
        read(inline) === 31 && read(retain<uint8>(undefined)) === 0 && callback() === "retained" && callback() === "retained";
    }
  ` }), "generic-pointer-region");
});

test("structural utilities do not materialize opaque marker declarations", () => {
  for (const type of ["Readonly<RawPointer>", "Pick<RawPointer, keyof RawPointer>"]) {
    const result = compileCsharpSource({ sourceText: `
      import type { RawPointer } from "@tsonic/core/types.js";
      export function pass(value: ${type}): ${type} { return value; }
    ` });
    assert.equal(result.sourceDiagnosticsText, "");
    assert.deepEqual(result.extensionDiagnostics, []);
    assert(result.targetDiagnostics.length > 0);
    assert(result.targetDiagnostics.every(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST"));
    assert.equal(result.artifacts.size, 0);
  }
});
