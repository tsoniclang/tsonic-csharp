import assert from "node:assert/strict";
import test from "node:test";
import { callEvidence, directProviderHost, providerDeclaration, providerFact } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";
import { jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";
import { selectCsharpComposedSourceProfileCall } from "../../../dist/analysis/operations/source-profiles/selection.js";

test("floor policy retains every native integer carrier supplied by exact provider evidence", () => {
  for (const name of ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "int128", "uint128", "native-int", "native-uint", "float32", "float64"]) {
    const carrier = { kind: "source-primitive", name };
    const call = callEvidence({ argumentTypes: [{}], receiver: false });
    const fixture = directProviderHost({
      nodeTypes: [[call.evidence.sourceArguments[0].expression, carrier]],
      semanticTypes: [[call.evidence.sourceSelectedSignatureParameters[0].selectedType, carrier]],
      signatureDeclarations: [[call.evidence.selectedSignature, call.signatureDeclaration]],
      facts: [providerFact(call.signatureDeclaration, providerDeclaration({
        providerId: jsSourceSemanticsIdentity.providerId,
        exportName: "Math",
        memberName: "floor",
        memberKey: { kind: "property-key", name: "floor" },
      }))],
      ast: { kindName: () => "KindMethodSignature", is: { IsSpreadElement: () => false } },
    });
    const host = { ...fixture.host, types: { ...fixture.host.types, resolveSourceCallTypeArguments: () => [],
      resolveSourceCallParameter: (source, index, file, domain) => {
        assert.equal(source === call.evidence && index === 0 && file === fixture.sourceFile, true,
          "the exact selected signature owns its single checked parameter");
        assert.equal(domain, "declared", "native provider evidence is read without source-callee admission");
        return fixture.host.types.resolveType(source.sourceSelectedSignatureParameters[index].selectedType, file);
      },
    } };
    const selected = selectCsharpComposedSourceProfileCall(host, call.evidence, fixture.sourceFile);
    assert.equal(selected.kind, "resolved");
    const integral = !name.startsWith("float");
    assert.deepEqual(selected.call.targetMember.returnType, integral ? carrier : { kind: "source-primitive", name: "float64" });
    assert.equal(selected.call.targetMember.csharpInvocation?.kind, integral ? "numeric-conversion" : undefined);
  }
});
