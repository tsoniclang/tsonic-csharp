import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpSourceAnyAdmission } from "../../../dist/analysis/source-evidence/source-any-admission.js";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { assertCanonicalAnyRefusal } from "../../helpers/source-any-refusals.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  for (const [name, sourceText] of [
    ["unused declared value", "export const value: any = 7;"],
    ["parameter", "export function read(value: any): unknown { return value; }"],
    ["return", "export function read(): any { return 7; }"],
    ["alias", "type Value = any; export const value: Value = 7;"],
    ["member", "export interface Holder { value: any; }"],
    ["assertion", "export function read(): unknown { return 7 as any; }"],
    ["union", "export type Value = string | any;"],
    ["generic argument", "export type Values = Array<any>;"],
  ]) {
    test(`canonical source-any admission refuses the checked ${name} on ${surface}`, () => {
      assertCanonicalAnyRefusal(compileCsharpSource({ surface, sourceText }));
    });
  }

  test(`canonical source-any admission preserves typed native identity and unknown narrowing on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
class Box {
  value: int32;
  constructor(value: int32) { this.value = value; }
}
function identity(value: unknown): unknown { return value; }
export function run(): boolean {
  const box = new Box(7 as int32);
  const value: unknown = identity(box);
  if (!(value instanceof Box)) return false;
  value.value = 11 as int32;
  const text: unknown = "native";
  return value === box && box.value === (11 as int32) &&
    typeof text === "string" && text.length === 6;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `canonical-any-typed-identity-${surface}`);
  });

  test(`canonical source-any admission does not classify a member by spelling on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
interface Row { any: string; }
export function preserve(value: Row): string { return value.any; }
` });
    assertCsharpCompilationSucceeded(compiled);
  });

  test(`canonical source-any admission preserves qualified native type names on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type * as Native from "@tsonic/core/types.js";
export function preserve(value: Native.int32): Native.int32 { return value; }
` });
    assertCsharpCompilationSucceeded(compiled);
    assert.match([...compiled.artifacts.values()].join("\n"), /public static int preserve\(int value\)/u,
      "a checked native type qualifier retains its exact width rather than becoming a runtime any value");
  });

  test(`canonical source-any admission preserves generic and Promise components on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export function identity<Value>(value: Value): Value { return value; }
export async function ready(value: Promise<string>): Promise<string> { return await value; }
export function run(): boolean { return identity("native") === "native"; }
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `canonical-any-generic-promise-${surface}`);
  });
}

test("source-any admission uses intrinsic checked types without widening unknown or generic constraints", () => {
  const checked = checkCsharpSource({ sourceText: `
interface Contract<Value> { value: Value; }
interface Derived<Value> extends Contract<Value> {}
class Native implements Derived<string> { value: string = "native"; }
export function identity<Value>(value: Value): Value { return value; }
export function preserve(value: unknown): unknown { return value; }
` });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  let intrinsicChecks = 0;
  const selected = { ...source, semantics: { ...source.semantics, forFile(file) {
    const queries = source.semantics.forFile(file);
    return { ...queries, types: { ...queries.types,
      isAny(type) { intrinsicChecks += 1; return queries.types.isAny(type); },
      apparentType() { throw new Error("an apparent type cannot replace the checked generic or unknown type"); },
      widenedType() { throw new Error("widening is not source-any admission evidence"); },
    } };
  } } };
  assert.equal(analyzeCsharpSourceAnyAdmission(selected, source.navigation.nodes).length, 0,
    "the exact generic, heritage and unknown types are not any");
  assert.equal(intrinsicChecks > 0, true, "the real intrinsic classifier owns the admission decision");
});

test("source-any admission ignores actual declaration-file metadata before requesting its semantics", () => {
  const checked = checkCsharpSource({ sourceText: `
import type { Metadata } from "./metadata.js";
export function preserve(value: Metadata): Metadata { return value; }
`, files: { "metadata.d.ts": "export interface Metadata { hidden: any; label: string; }" } });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const metadata = checked.source.sourceFiles.find(file => file !== undefined &&
    source.ast.getFileName(file) === "/project/metadata.d.ts");
  assert.equal(metadata !== undefined && source.ast.isDeclarationFile(metadata), true,
    "the negative uses an actual checked imported declaration file");
  const metadataNodes = [];
  const visit = node => {
    metadataNodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(metadata);
  const selected = { ...source, semantics: { ...source.semantics, forFile(file) {
    assert.equal(source.ast.isDeclarationFile(file), false,
      "metadata is skipped before any per-file semantic request");
    return source.semantics.forFile(file);
  } } };
  assert.equal(analyzeCsharpSourceAnyAdmission(selected, [...source.navigation.nodes, ...metadataNodes]).length, 0,
    "metadata any does not turn the checked project declaration into a runtime any use");
});

test("source-any admission stops at the first actual checked any declaration", () => {
  const checked = checkCsharpSource({ sourceText: "export const first: any = 1; export const second: any = 2;" });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const declarations = source.navigation.nodes.filter(node => source.ast.is.IsVariableDeclaration(node));
  assert.equal(declarations.length, 2, "both original checked declarations are retained");
  const selected = { ...source, semantics: { ...source.semantics, forFile(file) {
    const queries = source.semantics.forFile(file);
    return { ...queries, types: { ...queries.types, expressionType(node) {
      assert.equal(node === declarations[1], false, "no later declaration is queried after the first refusal");
      return queries.types.expressionType(node);
    } } };
  } } };
  const issues = analyzeCsharpSourceAnyAdmission(selected, source.navigation.nodes);
  assert.equal(issues.length, 1, "one original occurrence owns the gate");
  assert.equal(issues[0].sourceNode === declarations[0], true, "the first identical checked Node owns the refusal");
  assert.equal(Object.isFrozen(issues) && Object.isFrozen(issues[0]), true,
    "the original refusal and its ordered receipt are immutable");
});

test("canonical source-any admission rejects an inferred untyped library result without tracing users", () => {
  assertCanonicalAnyRefusal(compileCsharpSource({ surface: "js", sourceText: `
export function read() { return JSON.parse("{}"); }
` }));
});
