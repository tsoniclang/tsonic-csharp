import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram, sourceTypeDescriptorSum } from "@tsonic/target-api/source";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { representCsharpSourceType } from "../../../dist/policy/types/source-type-flow/representation.js";
import { resolveCsharpPublishedSourceSum } from "../../../dist/analysis/source-evidence/types/resolution/projection-arguments.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { csharpJsIntlTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpJsIntlPropertyPolicies } from "../../../dist/policy/operations/source-profiles/js/intl.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const unexpected = () => assert.fail("an inferred family lookup cannot reopen checked types or choose a Source arm");
function fixture(sourceText) {
  const checked = checkCsharpSource({ sourceText });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(checked.source.getSourceFile("/project/index.ts"));
  const owner = nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === "f");
  const lookup = descriptor => resolveCsharpPublishedSourceSum({ host: { ast, effectiveTypes: source.effectiveTypes } }, descriptor);
  const represent = descriptor => representCsharpSourceType({ target: checked.target, typeParameterConstraints: {},
    sourceSum: lookup, declaredType: declaration => csharpSourceTypeParameter(declaration, ast) ?? unexpected(),
    retainShape: unexpected, indexType: unexpected, callableType: unexpected, constructorType: unexpected,
    shapeKind: unexpected, memberDeclaration: unexpected, classStaticSide: unexpected, memberTypeParameters: unexpected,
  }, descriptor);
  return { source, ast, nodes, owner, lookup, represent };
}

for (const [name, body, kind] of [
  ["multi-return", 'function f<T>(x:T,b:boolean){if(b)return x;return "s";}', "return"],
  ["array literal", 'function f<T>(x:T){return [x,"s"];}', "array"],
  ["nested array", 'function f<T>(x:T){const values=[x,"s"];const box={values};return box;}', "array"],
  ["indexed anonymous union", 'function f<T>(x:T){const values=[x,"s"];return values[0];}', "return"],
  ["optional input", 'function f<T>(x?:T){return x;}', "return"],
  ["closed await", 'async function f(x:Promise<number>|Promise<string>){return await x;}', "await"],
]) {
  test(`the actual baseline ${name} producer consumes its authenticated published descriptor component`, () => {
    const input = fixture(body);
    const array = input.nodes.find(node => input.ast.is.IsArrayLiteralExpression(node));
    const awaited = input.nodes.find(node => input.ast.is.IsAwaitExpression(node));
    const occurrence = kind === "array" ? array : kind === "await" ? awaited : input.owner;
    const outcome = kind === "return" ? input.source.effectiveTypes.callableReturn(input.owner)
      : input.source.effectiveTypes.get(occurrence);
    assert.equal(outcome !== undefined && outcome.kind !== "refused", true, "the original baseline producer has its Source outcome");
    const descriptor = kind === "array" ? outcome.type.element : outcome.type;
    const record = sourceTypeDescriptorSum(input.ast, descriptor);
    const selected = input.lookup(descriptor);
    assert.equal(record !== undefined && selected?.record === record && input.source.effectiveTypes.sum(record.identity) === record, true,
      "only the identical published family/application and exact result or array-element component are authority");
    assert.equal(input.represent(descriptor) !== undefined, true,
      "Native represents the selected descriptor without treating a callable/array container as a union");
    const parameter = input.ast.typeParameters(input.owner)[0];
    assert.equal(parameter === undefined ? record.identity.application.length === 0
      : record.identity.application.length === 1 && record.identity.application[0].declaration === parameter, true,
    "the exact original generic binder, never a name or Native key, survives inferred family formation");
  });
}

for (const destination of ["object", "unknown"]) {
  test(`the baseline ${destination} return retains its exact published array construction component`, () => {
    const input = fixture(`function f<T>(x:T):${destination}{return [x,"s"];}`);
    const literal = input.nodes.find(node => input.ast.is.IsArrayLiteralExpression(node));
    const outcome = input.source.effectiveTypes.get(literal);
    assert.equal(outcome !== undefined && outcome.kind !== "refused" &&
      outcome.type.kind === "intrinsic" && outcome.type.intrinsic === destination &&
      outcome.construction?.kind === "array", true,
    "the root logical destination remains unchanged and the Host owns the literal construction");
    const descriptor = outcome.construction.element;
    const record = sourceTypeDescriptorSum(input.ast, descriptor);
    assert.equal(record?.identity.family === literal && input.source.effectiveTypes.sum(record.identity) === record, true,
      "the original allocation family is authenticated independently of its broad logical destination");
    assert.equal(input.lookup(descriptor)?.record === record && input.represent(descriptor) !== undefined, true,
      "Native follows only the exact published construction component, never a raw Type or syntax chooser");
  });
}

test("OI4 a later declared destination supplies the exact published array family before Native representation", () => {
  const input = fixture(`declare function take<T>(values:(number|T)[]):void;
    function f<T>(x:T){const values=[x,1];take<T>(values);return values;}`);
  const literal = input.nodes.find(node => input.ast.is.IsArrayLiteralExpression(node));
  const outcome = input.source.effectiveTypes.get(literal);
  assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "array", true);
  const selected = input.lookup(outcome.type.element);
  const declared = input.nodes.find(node => input.ast.is.IsUnionTypeNode(node));
  assert.equal(selected?.record.identity.family === declared && input.represent(outcome.type.element) !== undefined, true,
    "the actual declared family, not an earlier integer default or another inferred family, determines the carrier");
  assert.equal(selected.record.arms.some(arm => arm.type.kind === "primitive" && arm.type.primitive === "float64") &&
    !selected.record.arms.some(arm => arm.type.kind === "primitive" && arm.type.primitive === "int64"), true,
  "the Host slot decision is consumed unchanged, not recomputed from Native widths");
});

test("OI13 Intl's fixed native useGrouping ABI stays boolean then string independently of Source sums", () => {
  const policy = csharpJsIntlPropertyPolicies.find(policy => policy.source.declaringName === "IntlResolvedNumberFormatOptions" &&
    policy.source.name === "useGrouping");
  assert.equal(policy !== undefined, true, "the existing exact provider member owns this physical ABI");
  const selected = policy.select({ receiverType: csharpJsIntlTargetType("IntlResolvedNumberFormatOptions") });
  assert.equal(selected.kind, "resolved", "no Source family is manufactured at fixed provider registration");
  const result = selected.targetMember.returnType;
  const arms = getCsharpRuntimeUnionArms(result);
  assert.equal(result.csharpRuntimeUnionSemantics === "native-ordered" && arms?.length === 2 &&
    targetTypeRefEquals(arms[0], csharpSourcePrimitiveTargetType("bool")) && targetTypeRefEquals(arms[1], csharpStringTargetType()), true,
  "the existing runtime bool/string slot order cannot be sorted or deduplicated as a logical Source family");
});
