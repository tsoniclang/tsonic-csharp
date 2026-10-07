import assert from "node:assert/strict";
import test from "node:test";
import { sourceErrorConstructorCostProof, sourceErrorConstructorProof, sourceExplicitErrorInitializationProof,
  sourceJsErrorConstructorProof, sourceOwnedErrorConstructorProof } from "../../../../tsonic/test/fixtures/source-error-constructors.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { selectCsharpInheritedConstructorTarget } from "../../../dist/policy/operations/members/selection/inherited-construction.js";

for (const surface of [undefined, "js"]) {
  const profile = surface ?? "native";
  test(`explicit native error fields preserve owned inputs, reused inputs and absence effects (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: sourceExplicitErrorInitializationProof }),
      `explicit-error-initialization-${profile}`);
  });
  test(`inherited native error constructors retain exact arguments and project types (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: sourceErrorConstructorProof }), `source-error-constructors-${profile}`);
  });
  test(`same-spelled project error constructors retain their own generic contract (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: sourceOwnedErrorConstructorProof }), `source-owned-error-constructors-${profile}`);
  });
}

test("JS error constructor families preserve native optional message parameters", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: sourceJsErrorConstructorProof }),
    "source-js-error-constructors");
});

test("native optional error messages retain handwritten construction costs", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ sourceText: sourceErrorConstructorCostProof }),
    "source-error-constructor-cost", false, false, [], `
using System;
using NativeError = Tsonic.CSharp.Runtime.Error;
using Generated = Tsonic.Generated.Index;

foreach (string? message in new string?[] { null, "", "café😀 message" }) {
    for (var iteration = 0; iteration < 100; iteration++) {
        _ = Generated.makeOptional(message);
        _ = new NativeError(message);
    }
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10_000; iteration++) {
        var value = Generated.makeOptional(message);
        if (value.message != (message ?? "") || value.stack is not null) throw new Exception("optional message");
        GC.KeepAlive(value);
    }
    var actual = GC.GetAllocatedBytesForCurrentThread() - before;
    before = GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10_000; iteration++) {
        var value = new NativeError(message);
        if (value.message != (message ?? "") || value.stack is not null) throw new Exception("native message");
        GC.KeepAlive(value);
    }
    if (actual != GC.GetAllocatedBytesForCurrentThread() - before) throw new Exception("construction cost");
}
var text = "café😀 message";
var required = Generated.makeRequired(text);
if (!ReferenceEquals(required.message, text)) throw new Exception("native string identity");
`);
});

test("inherited native selection requires the exact project callee, signature and base member", () => {
  const declaration = {};
  const signature = {};
  const member = { id: "native.base.constructor", kind: "constructor" };
  const target = { id: "project.derived.constructor", kind: "constructor" };
  const source = { sourceCallee: { selectedDeclaration: declaration }, selectedSignature: signature };
  const constructor = { baseMemberId: member.id, targetMember: target };
  const host = {
    navigation: { isProjectDeclaration: subject => subject === declaration },
    projectTypes: { implicitConstructorForSignature: (subject, selected) => subject === declaration && selected === signature ? constructor : undefined },
  };
  assert.deepEqual(selectCsharpInheritedConstructorTarget(host, source, member), { kind: "resolved", member: target });
  for (const [changedHost, changedSource, changedMember] of [
    [host, { ...source, selectedSignature: {} }, member],
    [host, source, { ...member, id: "native.unrelated.constructor" }],
    [host, source, { ...member, kind: "method" }],
    [{ ...host, projectTypes: { implicitConstructorForSignature: () => undefined } }, source, member],
  ]) assert.equal(selectCsharpInheritedConstructorTarget(changedHost, changedSource, changedMember).kind, "missing");
  for (const selectedDeclaration of [undefined, {}]) {
    assert.deepEqual(selectCsharpInheritedConstructorTarget(host,
      { ...source, sourceCallee: { selectedDeclaration } }, member), { kind: "resolved", member });
  }
  const ordinaryMethod = { id: "project.ordinary.method", kind: "method" };
  assert.deepEqual(selectCsharpInheritedConstructorTarget(host, { ...source, selectedSignature: {} }, ordinaryMethod),
    { kind: "resolved", member: ordinaryMethod }, "an ordinary project method is not a constructor");
});
