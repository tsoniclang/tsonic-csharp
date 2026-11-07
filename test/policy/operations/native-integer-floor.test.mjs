import assert from "node:assert/strict";
import test from "node:test";
import { callEvidence, providerCallSource, providerBinding, providerMethod, targetParameter, directProviderHost, providerDeclaration, providerFact } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";
import { selectCsharpComposedSourceProfileCall } from "../../../dist/analysis/operations/source-profiles/selection.js";

test("floor policy retains every native integer carrier supplied by exact provider evidence", () => {
  for (const name of ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "int128", "uint128", "native-int", "native-uint", "float32", "float64"]) {
    const carrier = { kind: "source-primitive", name };
    const binding = providerBinding();
    const member = providerMethod({ static: true, parameters: [targetParameter("value", carrier)], returnType: carrier });
    const call = callEvidence(providerCallSource({ receiver: false, sourceArgumentTargets: [carrier] }, binding, member));
    // Basis (nextgen C-2542, signed by Claude): the profile reads the Host call selection; the declared parameter is
    // the represented published parameter descriptor (selection.parameters[0].type, R-B-1 shape), the argument its
    // node-keyed carrier. No checker parameter Type and no resolveSourceCallParameter remain.
    const fixture = directProviderHost({
      sourceProgram: call.program, calls: [[call.call, call.evidence]],
      nodeTypes: [[call.evidence.arguments[0].argument, carrier]],
      descriptorTypes: [[call.evidence.parameters[0].type, carrier]],
      facts: [providerFact(call.signatureDeclaration, providerDeclaration({
        providerId: jsSourceSemanticsIdentity.providerId,
        exportName: "Math",
        memberName: "floor",
        memberKey: { kind: "property-key", name: "floor" },
      }))],
    });
    const selected = selectCsharpComposedSourceProfileCall(fixture.host, call.call);
    assert.equal(selected.kind, "resolved");
    const integral = !name.startsWith("float");
    assert.deepEqual(selected.call.targetMember.returnType, integral ? carrier : { kind: "source-primitive", name: "float64" });
    assert.equal(selected.call.targetMember.csharpInvocation?.kind, integral ? "numeric-conversion" : undefined);
  }
});
