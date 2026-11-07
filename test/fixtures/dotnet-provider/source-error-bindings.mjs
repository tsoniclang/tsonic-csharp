import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpExceptionTargetType, csharpRuntimeErrorTargetType, csharpObjectTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../dist/target-model/types/render-shapes.js";
import { csharpSourceErrorNames } from "../../../dist/target-model/identities/source-errors.js";
import { snapshotCsharpMetadata } from "../../../dist/target-model/metadata/immutable.js";

export function createSourceErrorProviderFixture() {
  const bindings = snapshotCsharpMetadata([csharpExceptionTargetType(), csharpObjectTargetType(),
    csharpTargetNamedType("System.Type", undefined, csharpQualifiedTypeRenderShape("System", "Type"), { allowsRefLikeTypeArguments: [] }),
    csharpTargetNamedType("System.Runtime.ExceptionServices.ExceptionDispatchInfo", undefined,
      csharpQualifiedTypeRenderShape("System.Runtime.ExceptionServices", "ExceptionDispatchInfo"), { allowsRefLikeTypeArguments: [] }),
    ...csharpSourceErrorNames.map(name => csharpRuntimeErrorTargetType(name))].map(type => ({
    id: type.id, target: "csharp", kind: "class", sourceName: type.id, targetName: type.id, csharpType: type,
  })));
  const result = binding => binding === undefined ? { kind: "missing" } : { kind: "resolved", binding };
  return createCsharpProviderRelationResolver({ providerPolicies: [], providers: [{
    identity: { id: "fixture.native-source-errors", version: "1" }, validateReferences: () => undefined,
    findTargetBindingByMetadataName: name => result(bindings.find(binding => binding.targetName === name)),
    findTargetBindingByTargetId: identity => result(bindings.find(binding => binding.id === identity)),
  }] });
}
