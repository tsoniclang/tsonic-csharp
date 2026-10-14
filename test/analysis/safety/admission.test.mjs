import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { admitCsharpSafetyApplications } from "../../../dist/analysis/safety/admission.js";
import { compileCsharpTarget } from "../../../dist/backend/compile.js";

const header = `import { safety, unsafecontext, loadnativeptr } from "@tsonic/core/lang.js";
import type { NativePointer, int32 } from "@tsonic/core/types.js";
`;
const preview = { languageDialect: "csharp15-preview", memorySafetyRules: "preview" };
const selected = "export function selected(value: int32): int32 { return value; }\n";
const api = "export class Api { value: int32 = 0; get snapshot(): int32 { return this.value; } }\n";
const shape = "export interface Shape { readonly fixed: int32; open: int32; readonly [key: string]: int32; }\n";

const markerPosition = {
  code: "CSHARP_SAFETY_MARKER_RUNTIME_POSITION_UNSUPPORTED",
  message: "C# declaration safety markers must be complete standalone expression statements.",
};
const blockPosition = {
  code: "CSHARP_UNSAFE_CONTEXT_BLOCK_POSITION_INVALID",
  message: "The no-argument unsafe-context marker must be handled as the first direct statement of a source block.",
};
const expressionDialect = {
  code: "CSHARP_UNSAFE_EXPRESSION_DIALECT_UNSUPPORTED",
  message: "C# unsafe expressions require target option languageDialect='csharp15-preview'.",
};
const noFindings = { get: () => ({ conflicts: [], applications: [] }) };
const contractDialect = {
  code: "CSHARP_SAFETY_CONTRACT_DIALECT_UNSUPPORTED",
  message: "C# declaration caller-safety contracts require target option languageDialect='csharp15-preview'.",
};
const contractRules = {
  code: "CSHARP_SAFETY_CONTRACT_RULES_UNSUPPORTED",
  message: "C# declaration caller-safety contracts require target option memorySafetyRules='preview'; selecting preview syntax alone does not opt the assembly into updated memory-safety rules.",
};
const safeTarget = {
  code: "CSHARP_SAFE_DECLARATION_TARGET_UNSUPPORTED",
  message: "C# 'safe' is only legal on target declarations that require an explicit safe-or-unsafe choice; current Tsonic source declarations do not represent such a boundary.",
};
const conflict = {
  code: "CSHARP_SAFETY_CONTRACT_CONFLICT",
  message: "One exact C# declaration received conflicting finalized safe and requires-unsafe contracts.",
};
const unresolved = {
  code: "CSHARP_SAFETY_APPLICATION_TARGET_NOT_RESOLVED",
  message: "The finalized safety application has no exact emitted C# declaration target.",
};
const accessor = (placement) => ({
  code: "CSHARP_SAFETY_ACCESSOR_TARGET_NOT_EMITTED",
  message: `The selected source ${placement} has no corresponding emitted C# accessor for its explicit safety contract.`,
});

function analyze(body, targetOptions, files) {
  let result;
  const compiled = compileCsharpSource({ sourceText: `${header}${body}\n`, ...(targetOptions === undefined ? {} : { targetOptions }),
    ...(files === undefined ? {} : { files }),
    compileTarget: (request, observer) => {
      result = analyzeCsharpTargetProgram(request);
      return compileCsharpTarget(request, observer);
    } });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  return { compiled, result };
}

function rejectedBeforePublication(body, targetOptions, expected, files) {
  const { compiled, result } = analyze(body, targetOptions, files);
  assert.equal(result.kind, "rejected", "safety admission rejects before the program is published");
  assert.deepEqual(result.diagnostics.map(({ code, message }) => ({ code, message })), expected);
  assert.equal(compiled.result.program === undefined, true, "no program is published");
  assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })), expected,
    "compilation reports the same diagnostics");
  assert.equal(compiled.artifacts.size, 0, "no C# is emitted");
}

test("declaration safety markers in runtime positions are rejected by safety admission", () => {
  rejectedBeforePublication(`${selected}export function g(): void { const s = safety(selected).requiresunsafe(); }`, preview, [markerPosition]);
  rejectedBeforePublication(`${selected}export function g(): unknown { return safety(selected).requiresunsafe(); }`, preview, [markerPosition]);
  rejectedBeforePublication(`${selected}function h(v: unknown): void {} export function g(): void { h(safety(selected).requiresunsafe()); }`, preview, [markerPosition]);
  rejectedBeforePublication(`${selected}export const s = safety(selected).requiresunsafe();`, preview, [markerPosition]);
});

test("unsafe expressions outside the preview dialect are rejected by safety admission", () => {
  const read = "export function read(p: NativePointer<int32>): int32";
  rejectedBeforePublication(`${read} { return unsafecontext(loadnativeptr(p)); }`, undefined, [expressionDialect]);
  rejectedBeforePublication(`${read} { return (unsafecontext(loadnativeptr(p))); }`, undefined, [expressionDialect]);
  rejectedBeforePublication(`export function read(p: NativePointer<int32>): () => int32 { return () => unsafecontext(loadnativeptr(p)); }`, undefined, [expressionDialect]);
  rejectedBeforePublication(`${read} { const a = unsafecontext(loadnativeptr(p)); return a + unsafecontext(loadnativeptr(p)); }`, undefined,
    [expressionDialect, expressionDialect]);
});

test("accessor contracts without an emitted C# accessor are rejected by safety admission", () => {
  rejectedBeforePublication(`${api}safety<Api>().property(a => a.value).setter().requiresunsafe();`, preview, [accessor("setter")]);
  rejectedBeforePublication(`${api}safety<Api>().property(a => a.value).getter().requiresunsafe();`, preview, [accessor("getter")]);
  rejectedBeforePublication(`${shape}safety<Shape>().property(s => s.fixed).setter().requiresunsafe();`, preview, [accessor("setter")]);
  rejectedBeforePublication(`${shape}safety<Shape>().indexer(s => s[""]).setter().requiresunsafe();`, preview, [accessor("setter")]);
  rejectedBeforePublication(`${api}${shape}safety<Api>().property(a => a.value).setter().requiresunsafe();
safety<Shape>().indexer(s => s[""]).setter().requiresunsafe();`, preview, [accessor("setter"), accessor("setter")]);
});

test("safety positions and accessors the planner does not consume stay accepted", () => {
  const read = "export function read(p: NativePointer<int32>): int32";
  for (const [body, targetOptions] of [
    [`${read} { return 1; const a = unsafecontext(loadnativeptr(p)); }`, undefined],
    [`${read} { function g(): int32 { return unsafecontext(loadnativeptr(p)); } return 1; }`, undefined],
    [`${selected}export function g(): void { return; const s = safety(selected).requiresunsafe(); }`, preview],
    [`${selected}export function g(): void { safety(selected).requiresunsafe(); }`, preview],
    [`${shape}safety<Shape>().property(s => s.open).setter().requiresunsafe();`, preview],
    [`${shape}safety<Shape>().indexer(s => s[""]).getter().requiresunsafe();`, preview],
    [`export abstract class A { abstract value: int32; }\nsafety<A>().property(a => a.value).setter().requiresunsafe();`, preview],
    [`${read} { unsafecontext(); return loadnativeptr(p); }`, preview],
    [`${read} { return unsafecontext(loadnativeptr(p)); }`, { languageDialect: "csharp15-preview" }],
  ]) {
    const { compiled, result } = analyze(body, targetOptions);
    assert.equal(result.kind, "resolved");
    assertCsharpCompilationSucceeded(compiled);
  }
});

test("a no-argument unsafe-context fact in an expression position is rejected without reaching the planner", () => {
  const { result } = analyze("export function read(p: NativePointer<int32>): int32 { return unsafecontext(loadnativeptr(p)); }", preview);
  assert.equal(result.kind, "resolved");
  const program = result.value;
  const ast = program.source.ast;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  for (const file of program.sourceNavigation.sourceFiles) visit(file);
  const marker = nodes.find(node => program.records.safetyOperation.get(node)?.kind === "unsafe-context");
  assert.equal(marker !== undefined, true, "the unsafe expression has a safety operation");
  const input = (overrides = {}) => ({
    ast,
    sourceFiles: program.sourceNavigation.sourceFiles,
    navigation: program.sourceNavigation,
    captureClosure: program.records.captureClosure,
    evidence: { compileTimeMetadata: program.records.compileTimeMetadata, sourceField: program.records.sourceField },
    operations: { nativeUnreachable: program.records.nativeUnreachable, classPropertyStorage: program.records.classPropertyStorage },
    languageDialect: "csharp15-preview",
    memorySafetyRules: "preview",
    safety: { safetyApplication: program.records.safetyApplication, safetyOperation: program.records.safetyOperation, findings: noFindings },
    erasedAttribute: program.records.erasedAttribute,
    ...overrides,
  });
  assert.deepEqual(admitCsharpSafetyApplications(input()), []);
  assert.deepEqual(admitCsharpSafetyApplications(input({ safety: {
    safetyApplication: program.records.safetyApplication,
    safetyOperation: { get: node => node === marker ? { kind: "unsafe-context", fact: { kind: "remaining-block" } } : program.records.safetyOperation.get(node) },
    findings: noFindings,
  } })), [blockPosition]);
  assert.deepEqual(admitCsharpSafetyApplications(input({ languageDialect: "csharp14", memorySafetyRules: "csharp14" })), [expressionDialect]);
});

test("application contracts are admitted from the shared findings with their existing diagnostics", () => {
  const snap = "export class Snap { get only(): int32 { return 1; } }\n";
  rejectedBeforePublication(`${selected}safety(selected).requiresunsafe();`, undefined, [contractDialect]);
  rejectedBeforePublication(`${selected}safety(selected).requiresunsafe();`, { languageDialect: "csharp15-preview" }, [contractRules]);
  rejectedBeforePublication(`${selected}safety(selected).safe();`, preview, [safeTarget]);
  rejectedBeforePublication(`${selected}safety(selected).safe();\nsafety(selected).requiresunsafe();`, preview, [conflict]);
  rejectedBeforePublication(`${selected}safety(selected).safe();\nsafety(selected).requiresunsafe();`, undefined, [conflict]);
  rejectedBeforePublication(`${snap}safety<Snap>().property(s => s.only).setter().requiresunsafe();`, preview, [unresolved]);
  rejectedBeforePublication(`${snap}${selected}safety<Snap>().property(s => s.only).setter().requiresunsafe();\nsafety(selected).safe();\nsafety(selected).requiresunsafe();`,
    preview, [conflict, unresolved]);
  rejectedBeforePublication(`${api}${selected}safety<Api>().property(a => a.value).setter().requiresunsafe();\nsafety(selected).safe();`, preview,
    [accessor("setter"), safeTarget]);
});

test("every application in every source file is admitted, including erased and unplanned positions", () => {
  rejectedBeforePublication(`${selected}export function apply(): void { return; safety(selected).requiresunsafe(); }`, undefined, [contractDialect]);
  rejectedBeforePublication(`${selected}export function apply(): void { function inner(): void { safety(selected).requiresunsafe(); } }`, undefined, [contractDialect]);
  rejectedBeforePublication(`${selected}(safety(selected).requiresunsafe());`, undefined, [contractDialect]);
  const apply = { "apply.ts": `${header}import { selected } from "./index.js";\nsafety(selected).requiresunsafe();` };
  rejectedBeforePublication(selected, undefined, [contractDialect], apply);
  rejectedBeforePublication(`${selected}safety(selected).safe();`, preview, [conflict], apply);
  const { compiled, result } = analyze(selected, preview, apply);
  assert.equal(result.kind, "resolved");
  assertCsharpCompilationSucceeded(compiled);
});

test("safety diagnostics follow source-file identity order across files", () => {
  const entry = (name) => `import { other } from "./${name}.js";\n${api}safety<Api>().property(a => a.value).setter().requiresunsafe();\nexport function use(): int32 { return other(1); }`;
  const dependency = `${header}export function other(value: int32): int32 { return value; }\nsafety(other).safe();`;
  rejectedBeforePublication(entry("zeta"), preview, [accessor("setter"), safeTarget], { "zeta.ts": dependency });
  rejectedBeforePublication(entry("alpha"), preview, [safeTarget, accessor("setter")], { "alpha.ts": dependency });
});
