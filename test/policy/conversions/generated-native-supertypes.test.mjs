import assert from "node:assert/strict";
import test from "node:test";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpTargetTypeSatisfiesNativeConstraint } from "../../../dist/policy/conversions/carriers.js";
import { csharpNativeTypeImplements } from "../../../dist/policy/types/source-type-flow/relations.js";
import { applyCsharpNativeCallableMember } from "../../../dist/policy/conversions/generic-callable.js";

const named = (id, arguments_ = [], kind = "interface") => csharpTargetNamedType(id, arguments_,
  { kind: "named", name: id.split(".").at(-1).split("`")[0] },
  { sourceDeclarationKind: kind, allowsRefLikeTypeArguments: arguments_.map(() => false),
    ...(kind === "struct" ? { valueType: true } : {}) });
const integer = csharpSourcePrimitiveTargetType("int32");
const text = csharpStringTargetType();
const storage = csharpRuntimeUnionTargetType([integer, text]);
const contract = named("Tsonic.CSharp.Runtime.ISourceUnionRole`2", [storage, integer]);
const witness = named("Generated.Role`2", [storage, integer], "struct");

function fixture(rows) {
  const records = new Map(rows.map(({ carrier, supertypes }) => [targetTypeRefKey(carrier),
    Object.freeze({ carrier, supertypes: Object.freeze([...supertypes]) })]));
  let queries = 0;
  const typeDefinitions = Object.freeze({
    nativeDeclarationKind: carrier => records.get(targetTypeRefKey(carrier))?.carrier.csharpSourceDeclarationKind,
    nativeSupertypes(carrier) {
      queries += 1;
      return records.get(targetTypeRefKey(carrier))?.supertypes;
    },
  });
  return { policy: createNativeConversionHost({ typeDefinitions }), queries: () => queries };
}

test("generated Native constraints consume the exact registered interface rather than project heritage or a name", () => {
  const input = fixture([{ carrier: witness, supertypes: [contract] }]);
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(input.policy, witness, contract), true);
  assert.equal(csharpNativeTypeImplements(input.policy, witness, contract), true);
  assert.equal(input.queries() > 0, true, "the actual Native definition query is required");
  assert.equal(input.policy.projectTypes.directSupertypes(witness), undefined,
    "project inheritance does not pretend to certify the generated Native interface path");
  const missing = createNativeConversionHost();
  assert.equal(missing.typeDefinitions.nativeSupertypes(witness), undefined);
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(missing, witness, contract), false);
  assert.equal(csharpNativeTypeImplements(missing, witness, contract), false);
});

test("foreign same-name reordered and width-changed generated interfaces do not satisfy the required Native ABI", () => {
  const wrong = [
    named("Foreign.ISourceUnionRole`2", [storage, integer]),
    named("Tsonic.CSharp.Runtime.ISourceUnionRole`2", [integer, storage]),
    named("Tsonic.CSharp.Runtime.ISourceUnionRole`2", [storage, csharpSourcePrimitiveTargetType("uint32")]),
    named("Tsonic.CSharp.Runtime.ISourceUnionRole`2", [storage, named("Other.Int32", [], "struct")]),
  ];
  for (const registered of wrong) {
    const input = fixture([{ carrier: witness, supertypes: [registered] }]);
    assert.equal(csharpTargetTypeSatisfiesNativeConstraint(input.policy, witness, contract), false);
    assert.equal(csharpNativeTypeImplements(input.policy, witness, contract), false);
  }
  const foreign = named("Foreign.Role`2", [storage, integer], "struct");
  const input = fixture([{ carrier: witness, supertypes: [contract] }]);
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(input.policy, foreign, contract), false,
    "same physical arguments do not transfer another generated definition's proof");
});

test("generated Native interface traversal terminates on cycles without satisfying a missing contract", () => {
  const other = named("Generated.Other`2", [storage, integer], "struct");
  const missing = fixture([{ carrier: witness, supertypes: [other] }, { carrier: other, supertypes: [witness] }]);
  assert.equal(csharpNativeTypeImplements(missing.policy, witness, contract), false);
  assert.equal(missing.queries() <= 2, true);
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(missing.policy, witness, contract), false);
  const present = fixture([{ carrier: witness, supertypes: [other] }, { carrier: other, supertypes: [witness, contract] }]);
  assert.equal(csharpNativeTypeImplements(present.policy, witness, contract), true);
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(present.policy, witness, contract), true);
});

test("a complete Native method application validates its generated witness constraint through the same owner", () => {
  const parameter = { kind: "type-parameter", identity: "Method/Witness", name: "Witness" };
  const method = Object.freeze({ name: "Invoke", typeParameters: Object.freeze([Object.freeze({
    identity: parameter.identity, name: parameter.name, constraints: Object.freeze([
      Object.freeze({ kind: "keyword", keyword: "struct" }), Object.freeze({ kind: "type", type: contract }),
    ]),
  })]), signature: Object.freeze({ kind: "call", parameters: Object.freeze([parameter]),
    parameterPassingModes: Object.freeze(["by-value"]), returnType: integer }) });
  const input = fixture([{ carrier: witness, supertypes: [contract] }]);
  const applied = applyCsharpNativeCallableMember(input.policy, method, [witness]);
  assert.equal(applied !== undefined, true);
  assert.equal(applied.typeParameters.length, 0);
  assert.equal(targetTypeRefKey(applied.signature.parameters[0]), targetTypeRefKey(witness));
  assert.equal(applyCsharpNativeCallableMember(createNativeConversionHost(), method, [witness]), undefined);
});
