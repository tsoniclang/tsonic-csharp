import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { sealCsharpDelegateAdapterIdentities } from "../../../dist/analysis/conversions/delegate-identities.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";

const sourceType = csharpDelegateTargetType("System.Action", [{ kind: "source-primitive", name: "float64" }]);
const targetType = csharpDelegateTargetType("System.Action", [{ kind: "source-primitive", name: "int32" }]);

function fixture(text) {
  const session = createCompilerSessionFromFiles({ currentDirectory: "/project", files: { "/project/index.ts": text },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" } });
  const checked = session.checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.slice(0, 3)).slice(0, 1024));
  const source = createTargetSourceProgram(checked);
  const sourceFile = checked.getSourceFile("/project/index.ts");
  const expressions = new Map();
  const policy = { ast: source.ast, navigation: source.navigation, sourceFiles: [sourceFile],
    types: { resolveNode: () => sourceType }, projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => undefined }, target: {} };
  const conversion = selectCsharpConversion(policy, sourceType, targetType, "implicit");
  assert.equal(conversion.kind, "delegate-adapter");
  assert.equal(conversion.strategy, "adaptation");
  const visit = node => {
    if (source.ast.is.IsCallExpression(node)) {
      const argument = source.ast.as.AsCallExpression(node)?.Arguments?.Nodes?.[0];
      if (argument !== undefined) expressions.set(argument, new Map([["exact", Object.freeze({
        source: sourceType, target: targetType, selection: conversion, identityRequired: true,
      })]]));
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(sourceFile);
  return { session, policy, sourceFile, expressions, seal() {
    const issues = [];
    const scopes = sealCsharpDelegateAdapterIdentities(policy, expressions, issues);
    return { scopes, issues };
  } };
}

test("sealing reuses exact immutable binding and alias identities without creating another conversion table", () => {
  const input = fixture("function consume(callback: (value: number) => void): void {} export function use(callback: (value: number) => void): void { const alias = callback; consume(callback); consume(alias); }");
  const { scopes, issues } = input.seal();
  assert.equal(issues.length, 0);
  assert.equal(scopes.size, 1);
  const records = [...input.expressions.values()].map(classifications => classifications.get("exact"));
  assert.equal(records.length, 2);
  assert.equal(records[0].delegateIdentity === records[1].delegateIdentity, true);
  assert.equal(Object.isFrozen(records[0].delegateIdentity), true);
  assert.equal(Object.isFrozen([...scopes.values()][0]), true);
});

test("sealing does not conflate same-spelled distinct declarations or separate callable activations", () => {
  const input = fixture("function consume(callback: (value: number) => void): void {} export function first(callback: (value: number) => void): void { consume(callback); } export function second(callback: (value: number) => void): void { consume(callback); }");
  const selected = input.seal();
  assert.equal(selected.scopes.size, 0);
  assert.equal(selected.issues.length, 2);
});

test("mutable and nested-activation evidence cannot authorize stable adapter identity", () => {
  for (const body of [
    "consume(callback); callback = next; consume(callback);",
    "const invoke = () => { consume(callback); consume(callback); }; invoke();",
  ]) {
    const input = fixture(`function consume(callback: (value: number) => void): void {} export function use(callback: (value: number) => void, next: (value: number) => void): void { ${body} }`);
    const selected = input.seal();
    assert.equal(selected.scopes.size, 0);
    assert.equal(selected.issues.length >= 2, true);
  }
});

test("stale source ownership, actual-node mismatch and mismatched conversion carriers reject identity proof", () => {
  for (const mutation of ["reference", "declaration-file", "target"]) {
    const input = fixture("function consume(callback: (value: number) => void): void {} export function use(callback: (value: number) => void): void { consume(callback); consume(callback); }");
    if (mutation === "reference") {
      const referenceFor = input.policy.navigation.referenceFor.bind(input.policy.navigation);
      input.policy.navigation = { ...input.policy.navigation, referenceFor: node => {
        const selected = referenceFor(node);
        return selected === undefined ? undefined : { ...selected, sourceFile: {} };
      } };
    } else if (mutation === "declaration-file") {
      const getSourceFile = input.policy.ast.getSourceFile.bind(input.policy.ast);
      input.policy.ast = { ...input.policy.ast, getSourceFile: node => {
        const selected = getSourceFile(node);
        return node === input.sourceFile ? selected : { ...selected };
      } };
    } else {
      const classifications = [...input.expressions.values()][1];
      classifications.set("exact", { ...classifications.get("exact"), target: csharpDelegateTargetType("System.Action", [{ kind: "source-primitive", name: "int64" }]) });
    }
    const selected = input.seal();
    assert.equal(selected.scopes.size, 0, mutation);
    assert.equal(selected.issues.length, 2, mutation);
  }
});
