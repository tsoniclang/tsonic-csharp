import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createCsharpProjectTypeCatalog } from "../../../dist/analysis/project-types/catalog.js";
import { projectTypeDefinition } from "../../../dist/policy/types/project/project-types.js";

function fixture(text) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project",
    files: { "/project/index.ts": text },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  const source = createTargetSourceProgram(checked);
  return { source, host: { ast: source.ast, navigation: source.navigation,
    enumConstants: source.semantics.enumConstants, semanticsFor: source.semantics.forNode } };
}

test("the early C# project catalog publishes the one common exact enum width", () => {
  const { source, host } = fixture(`
export enum Empty {}
export enum Small { Low = -2147483648, High = 2147483647 }
export enum Wide { Exact = 9007199254740993, Next = 9007199254740994, Same = 9007199254740993 }
export enum Bounds { Low = -9223372036854775808, High = 9223372036854775807 }
export class Ordinary {}
`);
  const calls = new Map();
  const catalog = createCsharpProjectTypeCatalog({ ...host, enumConstants: Object.freeze({ ...host.enumConstants,
    integerWidth(declaration) {
      calls.set(declaration, (calls.get(declaration) ?? 0) + 1);
      return host.enumConstants.integerWidth(declaration);
    } }) });
  assert.equal(catalog.issues.length, 0, "all admitted exact native enum values have an early definition");
  const widths = new Map(catalog.definitions.map(definition => [definition.sourceName,
    definition.kind === "enum" ? definition.integerWidth : undefined]));
  assert.deepEqual([...widths.entries()].sort(), [["Bounds", 64], ["Empty", 32], ["Ordinary", undefined], ["Small", 32], ["Wide", 64]]);
  for (const definition of catalog.definitions) {
    assert.equal(calls.get(definition.declaration) ?? 0, definition.kind === "enum" ? 1 : 0,
      `${definition.sourceName} reads the common width once at early admission`);
    assert.equal(Object.isFrozen(definition), true, `${definition.sourceName} is sealed metadata`);
    assert.equal(catalog.definitionContainingDeclaration(definition.declaration) === definition, true,
      `${definition.sourceName} has one stored definition identity`);
  }
  const values = source.semantics.enumConstants.entries.filter(entry => entry.kind === "resolved").map(entry => entry.value);
  assert.equal(values.includes(9007199254740993n) && values.includes(9007199254740994n), true, "exact discriminants never pass through Number");
});

test("C# enum rejections preserve the common source or resource refusal before type publication", () => {
  const { source, host } = fixture(`
export enum Text { Value = "value" }
export enum Fraction { Value = 7 / 2 }
export enum Outside { Value = 9223372036854775808 }
export enum Resource { Value = 2 ** 1000000000 }
export enum Incoherent { Exact = 9007199254740993, Next }
export enum Collision { Low = 9007199254740992, High = 9007199254740993 }
`);
  const catalog = createCsharpProjectTypeCatalog(host);
  assert.equal(catalog.definitions.length, 0, "no refused enum acquires a native type definition");
  assert.equal(catalog.issues.length, 6, "one precise issue per refused native declaration");
  for (const entry of source.semantics.enumConstants.entries) {
    const owner = source.ast.parent(entry.declaration);
    const decision = source.semantics.enumConstants.integerWidth(owner);
    assert.equal(decision?.kind, "rejected", "the shared decision precedes native admission");
    const issue = catalog.issues.find(candidate => candidate.node === entry.declaration);
    assert.equal(issue !== undefined, true, "the native issue identifies the exact refused member");
    assert.equal(issue?.message, decision.reason, "native admission preserves the one common rejection reason");
    assert.equal(issue?.code, decision.failure === "resource" ? "CSHARP_ENUM_CONSTANT_RESOURCE_LIMIT" : "CSHARP_ENUM_CONSTANT_NOT_SUPPORTED",
      "resource exhaustion never masquerades as a native range constraint");
    const selected = projectTypeDefinition(host, owner);
    assert.equal(selected.kind === "rejected" && selected.selection === decision, true,
      "the factory carries the identical shared refusal instead of undefined");
    assert.equal(catalog.definitionForDeclaration(owner) === undefined, true, "refused definitions cannot reach operations");
  }
});
