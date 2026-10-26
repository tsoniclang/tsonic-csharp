import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpTargetTypeSatisfiesNativeConstraint,
  implementedConstraintType,
  namedTargetTypeImplicitlyAccepts,
} from "../../../dist/policy/conversions/carriers.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpSourcePrimitiveDotnetMetadataName } from "../../../dist/target-model/types/carriers/scalar-types.js";

const contractId = "checked.core::ExactNativeContract`1";
const parentId = "checked.core::ExactNativeParent`1";
const primitive = name => Object.freeze({ kind: "source-primitive", name });
const named = (id, arguments_ = []) => csharpTargetNamedType(id, arguments_, undefined,
  { allowsRefLikeTypeArguments: arguments_.map(() => false) });

function fixture(source, options = {}) {
  const parameter = Object.freeze({ kind: "type-parameter", identity: "checked.native.Value", name: "Value" });
  const typeParameter = Object.freeze({ identity: parameter.identity, name: parameter.name,
    csharpAllowsRefLike: false });
  const contract = Object.freeze({ id: contractId, target: "csharp", kind: "interface",
    sourceName: "ExactNativeContract", targetName: "ExactNativeContract",
    typeParameters: Object.freeze([typeParameter]), csharpType: named(contractId, [parameter]) });
  const parent = Object.freeze({ id: parentId, target: "csharp", kind: "interface",
    sourceName: "ExactNativeParent", targetName: "ExactNativeParent",
    typeParameters: Object.freeze([typeParameter]), csharpType: named(parentId, [parameter]),
    implementedContracts: Object.freeze([{ kind: "implements", contract: contractId, typeArguments: [parameter] }]) });
  const native = Object.freeze({ id: "checked.core::ExactNativeValue", target: "csharp", kind: "struct",
    sourceName: "ExactNativeValue", targetName: "ExactNativeValue", csharpType: source,
    implementedContracts: Object.freeze(options.implemented === false ? [] : [{
      kind: "implements", contract: options.inherited ? parentId : contractId,
      typeArguments: Object.freeze([source]),
    }]) });
  const bindings = new Map([[contractId, contract], [parentId, parent], [native.id, native]]);
  const metadataQueries = [];
  const host = {
    projectTypes: { directSupertypes: () => [], catalog: { definitionForId: () => undefined } },
    providers: {
      findTargetBindingByMetadataName(metadataName, purpose) {
        assert.equal(metadataName, csharpSourcePrimitiveDotnetMetadataName(source.name),
          "the exact native primitive metadata identity owns the lookup");
        assert.equal(purpose, "inheritance", "constraint proof requires compiler-native heritage evidence");
        metadataQueries.push(metadataName);
        return options.metadata === "rejected"
          ? { kind: "rejected", diagnostic: { code: "NATIVE_METADATA_REJECTED", message: "native metadata refused" } }
          : options.metadata === "missing" ? { kind: "missing", reason: "native metadata unavailable" }
          : { kind: "resolved", binding: native };
      },
      findTargetBindingByTargetId(id, purpose) {
        assert.equal(purpose, "ordinary", "resolved native contracts retain exact target-id lookup");
        const binding = bindings.get(id);
        return binding === undefined ? { kind: "missing", reason: "no exact registered target identity" }
          : { kind: "resolved", binding };
      },
    },
  };
  return { host, source, native, target: named(contractId, [source]), metadataQueries, bindings };
}

for (const name of ["int32", "int64", "uint64", "float32", "float64", "decimal"]) {
  test(`native ${name} constraint satisfaction preserves its actual primitive carrier`, () => {
    const source = primitive(name);
    const value = fixture(source);
    assert.equal(csharpTargetTypeSatisfiesNativeConstraint(value.host, source, value.target), true,
      "the actual native heritage, not a reference conversion, proves the generic constraint");
    assert.equal(value.native.csharpType === source, true, "the primitive carrier is not replaced or boxed");
    assert.equal(source.kind, "source-primitive", "constraint proof creates no native runtime wrapper");
    assert.equal(value.metadataQueries.length, 1, "one existing native metadata selection is sufficient");
  });
}

test("native primitive constraints retain complete transitive generic arguments", () => {
  const source = primitive("int32");
  const value = fixture(source, { inherited: true });
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(value.host, source, value.target), true,
    "the single existing heritage walker substitutes the inherited interface argument");
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(value.host, source, named(contractId, [primitive("int64")])), false,
    "an invariant native interface cannot widen its primitive payload");
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(value.host, source, named(contractId, [named(parentId, [source])])), false,
    "a nested native generic payload cannot match a different exact argument");
});

test("absent and refused native metadata never manufacture primitive constraint authority", () => {
  for (const metadata of ["missing", "rejected"]) {
    const source = primitive("int32");
    const value = fixture(source, { metadata });
    assert.equal(csharpTargetTypeSatisfiesNativeConstraint(value.host, source, value.target), false,
      `${metadata}: a native metadata failure remains an unproved constraint`);
  }
  const source = primitive("bool");
  const value = fixture(source, { implemented: false });
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(value.host, source, value.target), false,
    "a known primitive name is not an interface implementation whitelist");
});

test("primitive constraint proof does not enable implicit reference conversion or boxing", () => {
  const source = primitive("int32");
  const value = fixture(source);
  assert.equal(namedTargetTypeImplicitlyAccepts(value.host, source, value.target, new Set()), false,
    "the unchanged physical reference-conversion owner still refuses a primitive interface conversion");
  assert.equal(value.metadataQueries.length, 0, "ordinary reference conversion does not borrow constraint proof");
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(value.host, source, value.target), true,
    "the distinct compile-time native constraint is nevertheless satisfied");
  assert.equal(namedTargetTypeImplicitlyAccepts(value.host, source, value.target, new Set()), false,
    "constraint selection cannot mutate a later runtime conversion decision");
});

test("native constraint admission never interprets an unresolved metadata name as a target identity", () => {
  const source = primitive("int32");
  const value = fixture(source);
  assert.equal(implementedConstraintType(value.host, {
    kind: "implements", contract: "ExactNativeContract`1", typeArguments: [source],
  }, new Map()) === undefined, true, "an exact-target contract has no metadata-name fallback");
  assert.equal(value.metadataQueries.length, 0, "a failed exact-target lookup is not silently retried by name");
  assert.equal(implementedConstraintType(value.host, {
    kind: "implements", contract: contractId, typeArguments: [source],
  }, new Map())?.id, contractId, "the real provider-qualified native identity remains admitted");
});

test("named native types retain the same single inherited contract algorithm", () => {
  const source = primitive("int32");
  const value = fixture(source, { inherited: true });
  assert.equal(csharpTargetTypeSatisfiesNativeConstraint(value.host, named(value.native.id), value.target), true,
    "a named native representation consumes the same exact heritage and generic substitution");
  assert.equal(value.metadataQueries.length, 0, "a named native source keeps its existing qualified identity");
});
