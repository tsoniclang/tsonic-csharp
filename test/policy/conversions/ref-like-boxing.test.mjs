import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpObjectTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { nativeRefLikeFixture } from "../../helpers/native-ref-like-fixture.mjs";
import { createDotnetReflectionTypeDataProvider } from "../../helpers/dotnet-reflection-provider.mjs";
import { completeDotnetProviderContext } from "../../../dist/public/provider-dotnet.js";
import { dotnetExportToTargetBinding } from "../../../dist/providers/native/projection/binding-projection.js";

const carrier = csharpTargetNamedType("Proof.NativeLease", undefined, { kind: "named", name: "NativeLease" },
  { valueType: true, byRefLike: true, allowsRefLikeTypeArguments: [] });
const policy = { providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } };

test("ref-like boxing is refused by the one conversion selector", () => {
  const selected = selectCsharpConversion(policy, carrier, csharpObjectTargetType(), "implicit");
  assert.equal(selected.kind, "rejected", "ordinary object storage cannot box a native ref-like value");
  assert.equal(selected.code, "CSHARP_REFLIKE_BOXING", "native conversion owner preserves its exact rejection code");
  const identity = selectCsharpConversion(policy, carrier, carrier, "implicit");
  assert.equal(identity.kind, "identity", "native value identity is not boxing");
});

for (const target of ["object", "unknown", "Reader", "Span<int32> | int32"]) {
  test(`checked source refuses ref-like boxing to ${target} before publication`, () => {
    const compiled = compileCsharpSource({ sourceText: `import type { int32 } from "@tsonic/core/types.js";
import { Span } from "@tsonic/dotnet/System.js";
interface Reader { readonly Length: int32; }
export function fail(values: int32[]): ${target} { return new Span<int32>(values); }` });
    assert.equal(compiled.sourceDiagnosticsText, "", `${target}: source reaches native conversion admission`);
    assert.equal(compiled.result.diagnostics.some(issue => target === "Span<int32> | int32"
      ? issue.code === "CSHARP_REFLIKE_GENERIC_ARGUMENT" &&
        issue.message === "The selected native generic parameter does not allow ref struct arguments."
      : issue.code === "CSHARP_REFLIKE_BOXING"), true,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(compiled.result.program === undefined, true, `${target}: no boxed native program`);
    assert.equal(compiled.result.artifacts.length, 0, `${target}: no invalid native artifacts`);
  });
}

test("an actual non-boxing native ref-like conversion remains admitted", { timeout: 240_000 }, () => {
  const { assembly } = nativeRefLikeFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [assembly], disablePersistentCache: true });
  const model = provider.getModule("@tsonic/dotnet/RefLikeProof.js",
    completeDotnetProviderContext({ requestedExports: ["ConvertibleLease"] }));
  assert.equal("exports" in model, true, "the actual native conversion declaration is acquired");
  const declaration = model.exports.find(value => value.kind === "type" && value.metadataName === "RefLikeProof.ConvertibleLease");
  assert.equal(declaration !== undefined, true, "one actual native convertible ref-like type");
  const binding = dotnetExportToTargetBinding(declaration);
  const operators = binding.conversionOperators;
  assert.equal(operators.length, 1, "the actual native ref-like conversion operator is retained");
  const selected = selectCsharpConversion({ providers: {
    findTargetBindingByTargetId: id => id === binding.id ? { kind: "resolved", binding } : { kind: "missing" },
  } }, binding.csharpType, operators[0].targetType, "implicit");
  assert.equal(selected.kind, "implicit", "a native ref-like source may convert without boxing");
  assert.equal(selected.proof, "provider-operator", "the one exact native operator owns the conversion");
  assert.equal(selected.providerOperatorId, operators[0].id, "no erased value or wrapper substitutes for the native operator");
});
