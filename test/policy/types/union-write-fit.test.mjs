import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSourceTypeFlowObligation } from "../../../dist/policy/types/source-type-flow/obligations.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";

const primitive = primitive => Object.freeze({ kind: "primitive", primitive });
const unexpected = () => assert.fail("a closed union write never reopens unrelated Source or Native evidence");
const site = {};
const host = {
  target: { id: "csharp" }, typeParameterConstraints: {}, declaredType: () => undefined,
  retainShape: unexpected, shapeKind: unexpected, memberBound: unexpected,
  literalValues: { literalValue: { get: () => undefined } }, valueType: () => undefined,
  providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  projectTypes: { directSupertypes: () => [] },
};
const sum = (...types) => Object.freeze({ kind: "union", types: Object.freeze(types) });

test("native write-fit retains the selected exact union arm conversion", () => {
  const type = sum(primitive("int32"), primitive("uint32"));
  for (const name of ["int32", "uint32"]) {
    const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site,
      value: site, valueType: primitive(name), type });
    assert.equal(issue === undefined, true, `${name}: the actual source has one exact admitted destination arm`);
  }
});

test("union write-fit preserves missing foreign and narrowing refusals", () => {
  for (const [name, valueType, type] of [
    ["missing", undefined, sum(primitive("int32"), primitive("uint32"))],
    ["foreign", primitive("int32"), { kind: "declared", declaration: {}, typeArguments: [] }],
    ["narrowing", primitive("float64"), sum(primitive("int8"), primitive("uint8"))],
    ["unrelated", primitive("bool"), sum(primitive("int32"), primitive("uint32"))],
    ["absence loss", { kind: "optional", value: primitive("int32") }, sum(primitive("int32"), primitive("uint32"))],
  ]) {
    const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site,
      value: site, ...(valueType === undefined ? {} : { valueType }), type });
    assert.equal(issue?.code === "CSHARP_UNSUPPORTED_AST" && issue.sourceNode === site, true,
      `${name}: a missing or incompatible source never obtains union admission`);
  }
});
