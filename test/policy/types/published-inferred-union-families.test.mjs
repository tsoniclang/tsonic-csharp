// Inferred union families (c2529 acceptance, ported to the nextgen facts, C-2542). The Host forms every inferred
// family (return, array element, await) and publishes it as a closed sum; C# represents exactly that published
// descriptor through the one mapping (I6) and never forms, sorts or dedupes a family itself (R6).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations } from "../../representation/host-fixture.mjs";
import { isCsharpRefusal } from "../../../dist/representation/index.js";
import { csharpJsIntlTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpJsIntlPropertyPolicies } from "../../../dist/policy/operations/source-profiles/js/intl.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

function fixture(sourceText) {
  const program = hostProgram(sourceText);
  const owner = program.named("f");
  const represent = representations(representationServices(program));
  return { ...program, owner, represent };
}

for (const [name, body, kind] of [
  ["multi-return", 'function f<T>(x:T,b:boolean){if(b)return x;return "s";}', "return"],
  ["array literal", 'function f<T>(x:T){return [x,"s"];}', "array"],
  ["nested array", 'function f<T>(x:T){const values=[x,"s"];const box={values};return box;}', "array"],
  ["indexed anonymous union", 'function f<T>(x:T){const values=[x,"s"];return values[0];}', "return"],
  ["optional input", 'function f<T>(x?:T){return x;}', "return"],
  ["closed await", 'async function f(x:Promise<number>|Promise<string>){return await x;}', "await"],
]) {
  test(`the ${name} family is the Host's published closed sum and C# represents that descriptor`, () => {
    const input = fixture(body);
    const array = input.nodes.find(node => input.ast.is.IsArrayLiteralExpression(node));
    const awaited = input.nodes.find(node => input.ast.is.IsAwaitExpression(node));
    const occurrence = kind === "array" ? array : kind === "await" ? awaited : input.owner;
    const published = kind === "return" ? input.callableReturn(input.owner) : input.type(occurrence);
    const descriptor = kind === "array" ? published.element : published;
    const record = input.sum(descriptor);
    assert.equal(input.facts.sums.sum(record.identity) === record, true,
      "the same frozen record answers its family/application identity (one Host builder, I6)");
    const represented = input.represent.type(descriptor, occurrence, kind === "return" ? "return" : "value");
    assert.equal(isCsharpRefusal(represented), false,
      "C# represents the published descriptor without treating a callable or array container as a union");
    const parameter = input.ast.typeParameters(input.owner)[0];
    assert.equal(parameter === undefined ? record.identity.application.length === 0
      : record.identity.application.length === 1 && record.identity.application[0].declaration === parameter, true,
    "the original generic binder, never a name or .NET key, survives inferred family formation");
  });
}

test("OI4: a later declared destination supplies the published array family before C# representation", () => {
  const input = fixture(`declare function take<T>(values:(number|T)[]):void;
    function f<T>(x:T){const values=[x,1];take<T>(values);return values;}`);
  const literal = input.nodes.find(node => input.ast.is.IsArrayLiteralExpression(node));
  const published = input.type(literal);
  assert.equal(published.kind, "array");
  const record = input.sum(published.element);
  const declared = input.nodes.find(node => input.ast.is.IsUnionTypeNode(node));
  assert.equal(record.identity.family === declared, true,
    "the declared family, not an earlier integer default or another inferred family, determines the carrier");
  assert.equal(isCsharpRefusal(input.represent.type(published.element, literal, "value")), false);
  assert.equal(record.arms.some(arm => arm.type.kind === "primitive" && arm.type.primitive === "float64") &&
    !record.arms.some(arm => arm.type.kind === "primitive" && arm.type.primitive === "int64"), true,
  "the Host slot decision is consumed unchanged, not recomputed from .NET widths");
});

test("OI13: Intl's fixed native useGrouping ABI stays boolean then string independently of Source sums", () => {
  const policy = csharpJsIntlPropertyPolicies.find(policy => policy.source.declaringName === "IntlResolvedNumberFormatOptions" &&
    policy.source.name === "useGrouping");
  assert.equal(policy !== undefined, true, "the existing exact provider member owns this physical ABI");
  const selected = policy.select({ receiverType: csharpJsIntlTargetType("IntlResolvedNumberFormatOptions") });
  assert.equal(selected.kind, "resolved", "no Source family is manufactured at fixed provider registration");
  const result = selected.targetMember.returnType;
  const arms = getCsharpRuntimeUnionArms(result);
  assert.equal(result.csharpRuntimeUnionSemantics === "native-ordered" && arms?.length === 2 &&
    targetTypeRefEquals(arms[0], csharpSourcePrimitiveTargetType("bool")) && targetTypeRefEquals(arms[1], csharpStringTargetType()), true,
  "the runtime bool/string slot order is a fixed .NET ABI, never sorted or deduplicated as a Source family");
});
