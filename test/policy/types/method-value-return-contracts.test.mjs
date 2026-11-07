import assert from "node:assert/strict";
import test from "node:test";
import { csharpMethodValueType, csharpMethodValueCoversContract, getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { publishedReturnContracts, unrepresentedReturnContract } from "../../helpers/published-return-contracts.mjs";
import { compileCsharpAnalysisTarget, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";

const owner = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "tsonic.shape:environment", csharpRender: { kind: "named", name: "Environment" } };
const protocol = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "tsonic.shape:protocol", csharpRender: { kind: "named", name: "Protocol" } };
const parameter = { kind: "type-parameter", name: "Value", identity: "original-source-binder" };
const signature = csharpDelegateTargetType("System.Func", [parameter], parameter);
const method = csharpMethodValueType(owner, "identity", "source.identity", signature, [parameter.identity]);
const inferred = csharpMethodValueType(protocol, "Invoke", "checked-callable", signature, [parameter.identity]);
const policy = { projectTypes: { directSupertypes() { return []; } }, providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } }, target: {} };

test("Native generic callable coverage retains the original method and native environment", () => {
  assert.equal(csharpMethodValueCoversContract(method, inferred), true, "exact quantified baseline is covered");
  assert.equal(getCsharpMethodValue(method).owner === owner, true, "the captured environment is not replaced");
  assert.equal(getCsharpMethodValue(method).contract === signature, true, "the original signature is retained");
  assert.deepEqual(getCsharpMethodValue(method).typeParameters, [parameter.identity], "the original ordered quantifiers are retained");
});

test("C2530 a returned generic method retains its Source identity and the current precise Native refusal", () => {
  let source;
  const compiled = compileCsharpSource({ sourceText: `class Box {
      identity<Value>(value: Value): Value { return value; }
    }
    export function returnedMethod() { const box = new Box(); return box.identity; }`,
  compileTarget(request, observer) {
    source = request.input.source;
    return compileCsharpAnalysisTarget(request, observer);
  } });
  assert.equal(compiled.sourceDiagnosticsText, "", "the original generic method-return program is valid Source");
  assert.equal(source !== undefined, true, "the actual Host publication reaches Native before its representation refusal");
  const methods = [];
  const functions = [];
  const visit = node => {
    if (source.syntax.is.IsMethodDeclaration(node)) methods.push(node);
    if (source.syntax.is.IsFunctionDeclaration(node)) functions.push(node);
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.syntax.isDeclarationFile(file)) visit(file);
  assert.equal(methods.length === 1 && functions.length === 1, true, "one exact original method and returned callable owner");
  // nextgen C-2542: the target receives TargetSourceProgramFacts; the callable return is facts.values.callableReturn.
  const publication = source.facts.values.callableReturn(functions[0]);
  assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "callable", true,
    "the Host publishes the original quantified callable, not a fabricated Native result");
  assert.equal(publication.type.calls.length, 1);
  const signature = publication.type.calls[0];
  const binders = source.syntax.typeParameters(methods[0]);
  assert.equal(signature.declaration === methods[0] && signature.typeParameters.length === 1 && binders.length === 1 &&
    signature.typeParameters[0] === binders[0], true, "the actual published return retains the original method and ordered binder identity");
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1);
  // nextgen C-2542 (I7): CSHARP_UNSUPPORTED_AST is split into .NET-reason codes; this site (property-admission.ts:68)
  // names its reason. Message, source and site are unchanged.
  assert.equal(issues[0].code, "CSHARP_GENERIC_METHOD_VALUE_NOT_REPRESENTABLE");
  assert.equal(issues[0].source, "tsonic-csharp");
  assert.equal(issues[0].message, "An extracted quantified nominal method has no supported native callable-value owner.",
    "C2530 permits the measured current Native refusal instead of claiming an unrepresented sealed carrier");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "the unsupported Native method-value representation publishes no invalid output");
});

test("inferred callable coverage rejects changed binders, quantified arity and native carriers", () => {
  const otherParameter = { ...parameter, identity: "unrelated-source-binder" };
  const number = { kind: "source-primitive", name: "float64" };
  const changedContracts = [
    csharpMethodValueType(protocol, "Invoke", "checked-callable", signature, [parameter.identity, "unused"]),
    csharpMethodValueType(protocol, "Invoke", "checked-callable", csharpDelegateTargetType("System.Func", [otherParameter], otherParameter), [otherParameter.identity]),
    csharpMethodValueType(protocol, "Invoke", "checked-callable", csharpDelegateTargetType("System.Func", [parameter], number), [parameter.identity]),
    csharpMethodValueType(protocol, "Invoke", "checked-callable", csharpDelegateTargetType("System.Func", [number], parameter), [parameter.identity]),
  ];
  for (const changed of changedContracts) {
    assert.equal(changed !== undefined, true, "the negative control itself has a valid contract");
    assert.equal(csharpMethodValueCoversContract(method, changed), false, "different exact contract is not covered");
    assert.equal(selectCsharpConversion(policy, method, changed, "implicit").kind, "rejected", "incompatible Native storage contracts reject");
  }
  const actual = publishedReturnContracts("export function run(value: number) { return value; }").get("run");
  assert.deepEqual(unrepresentedReturnContract(actual), { kind: "rejected",
    reason: "The Host-published callable return has no closed C# representation." },
  "incomplete Native return representation still rejects without a separate inference path");
});

test("quantified coverage requires exact ordered identities even for unused binders", () => {
  const parameters = [parameter.identity, "original-unused-binder"];
  const selectedMethod = csharpMethodValueType(owner, "identity", "source.identity", signature, parameters);
  const selectedBaseline = csharpMethodValueType(protocol, "Invoke", "checked-callable", signature, parameters);
  assert.equal(selectedMethod !== undefined && selectedBaseline !== undefined, true, "the ordered positive control has valid carriers");
  assert.equal(csharpMethodValueCoversContract(selectedMethod, selectedBaseline), true, "an exact unused source binder is preserved");
  assert.deepEqual(getCsharpMethodValue(selectedMethod).typeParameters, parameters,
    "ordered original quantifiers, including unused binders, belong to the Native carrier");
  for (const [label, changedParameters] of [
    ["swapped binder order", [...parameters].reverse()],
    ["unrelated unused binder", [parameter.identity, "unrelated-unused-binder"]],
  ]) {
    const changed = csharpMethodValueType(protocol, "Invoke", "checked-callable", signature, changedParameters);
    assert.equal(changed !== undefined, true, `${label}: the negative control itself is valid`);
    assert.equal(csharpMethodValueCoversContract(selectedMethod, changed), false, `${label}: identical inner signatures cannot conceal different quantifiers`);
    assert.equal(selectCsharpConversion(policy, selectedMethod, changed, "implicit").kind, "rejected", `${label}: Native storage rejects mismatched ordered identities`);
  }
});

test("coverage does not authorize method identity replacement or captured environment erasure", () => {
  const otherMethod = csharpMethodValueType(owner, "other", "source.other", signature, [parameter.identity]);
  const otherEnvironment = csharpMethodValueType({ ...owner, id: "tsonic.shape:other-environment" }, "identity", "source.identity", signature, [parameter.identity]);
  for (const changed of [inferred, otherMethod, otherEnvironment]) {
    assert.equal(csharpMethodValueCoversContract(method, changed), true, "signature coverage is separate from storage conversion");
    assert.equal(selectCsharpConversion(policy, method, changed, "implicit").kind, "rejected", "concrete storage still requires its original method and environment");
    assert.equal(selectCsharpConversion(policy, method, changed, "explicit").kind, "rejected", "explicit casts cannot replace method identity or environment");
  }
  assert.equal(selectCsharpConversion(policy, method, otherMethod, "implicit").kind, "rejected", "distinct Native method identities cannot be merged");
});
