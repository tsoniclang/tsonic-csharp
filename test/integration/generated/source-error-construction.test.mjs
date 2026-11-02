import assert from "node:assert/strict";
import test from "node:test";
import { sourceErrorConstructorCostProof, sourceErrorConstructorProof, sourceExplicitErrorInitializationProof,
  sourceJsErrorConstructorProof, sourceOwnedErrorConstructorProof } from "../../../../tsonic/test/fixtures/source-error-constructors.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { selectCsharpInheritedConstructorTarget } from "../../../dist/analysis/operations/members/calls/implicit-super.js";

for (const surface of [undefined, "js"]) {
  const profile = surface ?? "native";
  test(`explicit native error fields preserve owned inputs, reused inputs and absence effects (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: sourceExplicitErrorInitializationProof + "\nexport function exactCalls(): number { return calls; }" }),
      `explicit-error-initialization-${profile}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
if (Generated.run()) throw new Exception("removed JavaScript empty-message contract");
if (Generated.exactCalls() != 1) throw new Exception("original absent argument evaluated exactly once");
var absentTemplate = new Exception((string?)null).Message;
string ExpectedAbsence(Exception value) => absentTemplate.Replace(typeof(Exception).FullName!, value.GetType().FullName!, StringComparison.Ordinal);
var required = new Tsonic.Generated.RequiredFailure("café😀");
var optional = new Tsonic.Generated.OptionalFailure("optional");
var omitted = new Tsonic.Generated.OptionalFailure();
var missing = new Tsonic.Generated.OptionalFailure(null);
var retained = new Tsonic.Generated.RetainedFailure("retained");
var effect = new Tsonic.Generated.EffectFailure();
if (Generated.exactCalls() != 2) throw new Exception("native absent argument evaluated exactly once");
if (required.Message != "café😀" || optional.Message != "optional" || omitted.Message != ExpectedAbsence(omitted) ||
    missing.Message != ExpectedAbsence(missing) || effect.Message != ExpectedAbsence(effect) || retained.Message != "retained" ||
    !ReferenceEquals(retained.saved, retained.Message) || required.StackTrace is not null)
    throw new Exception("native explicit arguments, retained input and absence");
`);
  });
  test(`inherited native error constructors retain exact arguments and project types (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: sourceErrorConstructorProof }), `source-error-constructors-${profile}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
if (Generated.run()) throw new Exception("removed JavaScript Error name/default-message contract");
var absentTemplate = new Exception((string?)null).Message;
string ExpectedAbsence(Exception value) => absentTemplate.Replace(typeof(Exception).FullName!, value.GetType().FullName!, StringComparison.Ordinal);
var omitted = new Tsonic.Generated.ImplicitFailure();
var absent = new Tsonic.Generated.ImplicitFailure(null);
var present = Generated.makeImplicit("implicit message");
var explicitValue = Generated.makeExplicit("explicit message");
var explicitOmitted = Generated.makeExplicit();
var child = new Tsonic.Generated.ChildFailure("child message");
var childOmitted = new Tsonic.Generated.ChildFailure();
if (omitted.Message != ExpectedAbsence(omitted) || absent.Message != ExpectedAbsence(absent) || present.Message != "implicit message" ||
    explicitValue.Message != "explicit message" || explicitOmitted.Message != ExpectedAbsence(explicitOmitted) || child.Message != "child message" ||
    childOmitted.Message != ExpectedAbsence(childOmitted) || present.GetType().Name != "ImplicitFailure" || child.GetType().Name != "ChildFailure" ||
    present.tag != "implicit" || explicitValue.tag != "explicit" || child.detail != "child" ||
    omitted.StackTrace is not null || explicitValue.StackTrace is not null || child.StackTrace is not null)
    throw new Exception("native inherited arguments and project members");
try { throw child; } catch (Tsonic.Generated.ChildFailure failure) {
    if (!ReferenceEquals(failure, child) || failure.detail != "child" || failure.Message != "child message")
        throw new Exception("native inherited catch identity");
}
`);
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
using NativeError = System.Exception;
using Generated = Tsonic.Generated.Index;

foreach (string? message in new string?[] { null, "", "café😀 message" }) {
    var expectedMessage = new NativeError(message).Message;
    for (var iteration = 0; iteration < 100; iteration++) {
        _ = Generated.makeOptional(message);
        _ = new NativeError(message);
    }
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10_000; iteration++) {
        var value = Generated.makeOptional(message);
        if (value.Message != expectedMessage || value.StackTrace is not null) throw new Exception("optional message");
        GC.KeepAlive(value);
    }
    var actual = GC.GetAllocatedBytesForCurrentThread() - before;
    before = GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10_000; iteration++) {
        var value = new NativeError(message);
        if (value.Message != expectedMessage || value.StackTrace is not null) throw new Exception("native message");
        GC.KeepAlive(value);
    }
    if (actual != GC.GetAllocatedBytesForCurrentThread() - before) throw new Exception("construction cost");
}
var text = "café😀 message";
var required = Generated.makeRequired(text);
if (!ReferenceEquals(required.Message, text)) throw new Exception("native string identity");
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
