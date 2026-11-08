import assert from "node:assert/strict";
import test from "node:test";
import { csharpMethodValueType, csharpMethodValueCoversContract, getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { publishedCallableReturn } from "../../helpers/published-return-contracts.mjs";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpAnalysisTarget, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { getCsharpCallableMembers } from "../../../dist/target-model/types/carriers/delegates.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";

const owner = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "tsonic.shape:environment", csharpRender: { kind: "named", name: "Environment" } };
const protocol = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "tsonic.shape:protocol", csharpRender: { kind: "named", name: "Protocol" } };
const parameter = { kind: "type-parameter", name: "Value", identity: "original-source-binder" };
const signature = csharpDelegateTargetType("System.Func", [parameter], parameter);
const method = csharpMethodValueType(owner, "identity", "source.identity", signature, [parameter.identity]);
const inferred = csharpMethodValueType(protocol, "Invoke", "checked-callable", signature, [parameter.identity]);
const policy = createNativeConversionHost();

test("Native generic callable coverage retains the original method and native environment", () => {
  assert.equal(csharpMethodValueCoversContract(method, inferred), true, "exact quantified baseline is covered");
  assert.equal(getCsharpMethodValue(method).owner === owner, true, "the captured environment is not replaced");
  assert.equal(getCsharpMethodValue(method).contract === signature, true, "the original signature is retained");
  assert.deepEqual(getCsharpMethodValue(method).typeParameters, [parameter.identity], "the original ordered quantifiers are retained");
});

test("C2530 a returned generic method retains its Source binders and actual captured Native receiver", () => {
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
    if (source.ast.is.IsMethodDeclaration(node)) methods.push(node);
    if (source.ast.is.IsFunctionDeclaration(node)) functions.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  assert.equal(methods.length === 1 && functions.length === 1, true, "one exact original method and returned callable owner");
  const publication = publishedCallableReturn(source, functions[0]).publication;
  assert.equal(publication.type.kind === "callable", true,
    "the Host publishes the original quantified callable, not a fabricated Native result");
  assert.equal(publication.type.calls.length, 1);
  const signature = publication.type.calls[0];
  const binders = source.ast.typeParameters(methods[0]);
  assert.equal(signature.identity.declaration === methods[0] && signature.identity.typeParameters.length === 1 && binders.length === 1 &&
    signature.identity.typeParameters[0] === binders[0], true, "the actual published return retains the original method and ordered binder identity");
  assertCsharpCompilationSucceeded(compiled);
  const contract = compiled.result.program.records.returnContract.get(functions[0]);
  assert.equal(contract?.kind, "resolved", "one actual Native returned callable contract");
  const members = getCsharpCallableMembers(contract.type);
  assert.equal(members?.length, 1, "the Native carrier has its actual generic invocation member");
  assert.equal(members[0].typeParameters.some(parameter => parameter.declaration === binders[0]), true,
    "the original quantified method binder remains method-local, not a carrier argument");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(/Invoke\s*<[^>]+>\s*\(/u.test(output), true, "the real Native generic method is emitted, not Func<object,object>");
  assert.equal(/new\s+Box\s*\(/u.test(output), true, "the actual receiver allocation remains in the original returned-method program");
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
  assert.equal(csharpMethodValueType(owner, "identity", "source.identity", parameter, [parameter.identity]) === undefined, true,
    "a missing Native callable contract is not filled by a second Source return inferrer");
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
