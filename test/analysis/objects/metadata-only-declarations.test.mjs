import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";

const pureSource = `
import type { char, float16, float32, int64, uint8 } from "@tsonic/core/types.js";
const nativeKey = "value";
interface Holder { [nativeKey]: number; }
const literalKey = "literal";
type Literal = { [literalKey]: number };
const numericMetadata = 7;
type Numeric = typeof numericMetadata;
const booleanMetadata = true;
type BooleanMetadata = typeof booleanMetadata;
const templateMetadata = \`template\`;
type Template = typeof templateMetadata;
const wrappedMetadata = ("wrapped" as const);
type Wrapped = typeof wrappedMetadata;
const astralMetadata = "🌿";
type Astral = typeof astralMetadata;
const narrowMetadata: uint8 = 7;
type Narrow = typeof narrowMetadata;
const wideMetadata: int64 = 9007199254740993n;
type Wide = typeof wideMetadata;
const fractionalMetadata: float32 = 1.0000000596046448;
type Fractional = typeof fractionalMetadata;
const negativeMetadata: float32 = -1.5;
type Negative = typeof negativeMetadata;
const halfMetadata: float16 = 1.5;
type Half = typeof halfMetadata;
const charMetadata: char = "é";
type Character = typeof charMetadata;
const shadowMetadata = "outer";
type Shadow = typeof shadowMetadata;
function nativeShadow(): string { const shadowMetadata = "inner"; return shadowMetadata; }
function exactKey(): number {
  const { key } = { key: "value" } as const;
  const value: Holder = { [key]: 23 };
  return value[key];
}
export function run(): boolean { return exactKey() === 23 && nativeShadow() === "inner"; }
`;

const retainedSource = `
let sequence = 0;
function makeKey(): "call" { sequence = sequence * 10 + 1; return "call"; }
class KeySource { get key(): "getter" { sequence = sequence * 10 + 2; return "getter"; } }
class OwnedGuard { constructor() { sequence = sequence * 10 + 3; } }
const callKey = makeKey();
interface CallShape { [callKey]: number; }
const getterKey = new KeySource().key;
interface GetterShape { [getterKey]: number; }
const ownedGuard = new OwnedGuard();
type GuardMetadata = typeof ownedGuard;
const arrayMetadata = [1, 2];
type ArrayMetadata = typeof arrayMetadata;
const runtimeKey = "runtime";
interface RuntimeShape { [runtimeKey]: number; }
export const exportedKey = "exported";
interface ExportedShape { [exportedKey]: number; }
let mutableMetadata = 7;
type Mutable = typeof mutableMetadata;
export function run(): boolean {
  const value: RuntimeShape = { runtime: 29 };
  mutableMetadata = 8;
  return value[runtimeKey] === 29 && exportedKey === "exported" && sequence === 123 && mutableMetadata === 8;
}
`;

function namedVariable(program, name, moduleLevel = true) {
  const { ast } = program.source;
  const pending = [...program.sourceFiles];
  while (pending.length !== 0) {
    const node = pending.pop();
    if (ast.is.IsVariableDeclaration(node) && ast.is.IsIdentifier(ast.name(node)) && ast.text(ast.name(node)) === name &&
      sourceDeclarationIsModuleScoped(node, ast) === moduleLevel) return node;
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  assert.fail(`missing actual checked variable ${name}`);
}

for (const surface of [undefined, "js"]) {
  const label = surface ?? "native";
  test(`C# ${label} admits the whole pure metadata constant class before erasure`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: pureSource });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined && compiled.result.plan !== undefined, true, "genuine sealed native program");
    for (const name of ["nativeKey", "literalKey", "numericMetadata", "booleanMetadata", "templateMetadata", "wrappedMetadata", "astralMetadata",
      "narrowMetadata", "wideMetadata", "fractionalMetadata", "negativeMetadata", "halfMetadata", "charMetadata", "shadowMetadata"]) {
      const declaration = namedVariable(program, name);
      assert.equal(program.records.compileTimeMetadata.get(declaration), true, `${name}: existing native erasure fact`);
      assert.equal(program.sourceNavigation.declarationUseSummary(declaration).uses.every(use => use.kind === "type-only"), true,
        `${name}: the actual checked declaration has only erased references`);
    }
    const wideInitializer = program.source.ast.as.AsVariableDeclaration(namedVariable(program, "wideMetadata"))?.Initializer;
    assert.equal(wideInitializer !== undefined && program.records.literalValue.get(wideInitializer)?.integer === 9007199254740993n, true,
      "erasure preserves exact native integer metadata beyond the JS Number domain");
    const floatInitializer = program.source.ast.as.AsVariableDeclaration(namedVariable(program, "fractionalMetadata"))?.Initializer;
    const numeric = floatInitializer === undefined ? undefined : program.records.literalValue.get(floatInitializer)?.numeric;
    assert.equal(numeric?.kind === "authored" && numeric.token.decimalText === "1.0000000596046448", true,
      "the canonical authored native float token remains unchanged");
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    for (const name of ["nativeKey", "literalKey", "numericMetadata", "booleanMetadata", "templateMetadata", "wrappedMetadata", "astralMetadata",
      "narrowMetadata", "wideMetadata", "fractionalMetadata", "negativeMetadata", "halfMetadata", "charMetadata"]) {
      assert.equal(new RegExp(`\\b${name}\\b`, "u").test(output), false, `${name}: no native cell, field or helper`);
    }
    assert.equal(program.records.compileTimeMetadata.get(namedVariable(program, "shadowMetadata", false)), false,
      "an identically spelled local runtime binding is not selected for metadata erasure");
    for (const name of ["eraseCompileTimeDeclaration", "sealCompileTimeDeclarations"]) {
      assert.equal(Object.hasOwn(program, name) || Object.hasOwn(program.records, name), false, `${name}: private builder does not cross publication`);
    }
    executeCsharpConstruction(compiled, `metadata-only-declarations-${label}`, false, false, [], `
var native = new NativeHolder(23);
if (!Tsonic.Generated.Index.run() || native.Value != 23) throw new System.Exception("metadata-only native counterpart");
readonly record struct NativeHolder(double Value);
`);
  });

  test(`C# ${label} retains effects, runtime access, exports, writes and owned native state`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: retainedSource });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined && compiled.result.plan !== undefined, true, "genuine retained native initialization");
    for (const name of ["callKey", "getterKey", "ownedGuard", "arrayMetadata", "runtimeKey", "exportedKey", "mutableMetadata"]) {
      assert.equal(program.records.compileTimeMetadata.get(namedVariable(program, name)), false,
        `${name}: source-only use is not native construction/purity/lifetime permission`);
    }
    executeCsharpConstruction(compiled, `metadata-only-retained-${label}`, false, false, [],
      'if (!Tsonic.Generated.Index.run()) throw new System.Exception("metadata initializer order");');
  });

  for (const [name, token] of [["narrow", "256"], ["fractional", "1.5"]]) {
    test(`C# ${label} metadata-only ${name} initializer retains native uint8 rejection`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `import type { uint8 } from "@tsonic/core/types.js";
const invalid: uint8 = ${token}; type Metadata = typeof invalid; export function run(): boolean { return true; }` });
      assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error"), true, "invalid native construction is not erased");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "rejection remains before publication");
      assert.equal(compiled.result.artifacts.length, 0, "no native output hides the invalid metadata initializer");
    });
  }

  for (const [kind, initializer] of [["float16", "65520"], ["char", '"ab"']]) {
    test(`C# ${label} metadata-only ${kind} preserves canonical native literal admission`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `import type { ${kind} } from "@tsonic/core/types.js";
const invalid: ${kind} = ${initializer}; type Metadata = typeof invalid; export function run(): boolean { return true; }` });
      assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error"), true, `${kind}: native literal rejection is not suppressed`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, `${kind}: no publication`);
      assert.equal(compiled.result.artifacts.length, 0, `${kind}: no artifacts`);
    });
  }

  test(`C# ${label} runtime reads before initialization retain their source rejection`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: 'const early = key; const key = "value"; interface Metadata { [key]: number; } export function run(): boolean { return early === "value"; }' });
    assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error"), true, "before-initialization evidence is retained");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true, "no invalid native output");
  });

  test(`C# ${label} an unrelated runtime module cycle is not erased with metadata`, () => {
    const compiled = compileCsharpSource({ surface,
      sourceText: 'import { read } from "./other.js"; const key = "value"; interface Metadata { [key]: number; } export const value: number = read(); export function run(): number { return value; }',
      files: { "other.ts": 'import { value } from "./index.js"; export function read(): number { return value + 1; }' },
    });
    assert.equal(compiled.result.diagnostics.some(issue => /cycl/iu.test(issue.message)), true, "the existing runtime-cycle owner still refuses the actual cycle");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true, "cycle rejection remains before publication");
  });

  test(`C# ${label} absent uses are not a new generic dead-declaration pass`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: 'const unused = "value"; export function run(): boolean { return true; }' });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the unchanged ordinary declaration remains admitted");
    assert.equal(program.records.compileTimeMetadata.get(namedVariable(program, "unused")), false,
      "unused-declaration removal is not inferred from an empty type-use set");
  });

  test(`C# ${label} unproved scalar string encoding stays on its original native path`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: 'const unproved = "\\uD800"; type Metadata = typeof unproved; export function run(): boolean { return true; }' });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the original checked native path is not replaced by a new refusal");
    assert.equal(program.records.compileTimeMetadata.get(namedVariable(program, "unproved")), false,
      "erasure never hides an unproved native string literal; no new source restriction is introduced");
  });
}
