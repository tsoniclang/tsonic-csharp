import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpExceptionTargetType, csharpRuntimeErrorTargetType, csharpObjectTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../dist/target-model/types/render-shapes.js";
import { csharpSourceErrorNames } from "../../../dist/target-model/identities/source-errors.js";
import { snapshotCsharpMetadata } from "../../../dist/target-model/metadata/immutable.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../dist/policy/identities/selected-source.js";

export function sourceErrorProtocolFixture(source) {
  // nextgen C-2542: profile identities read the published facts and authored syntax (TargetSourceProgramFacts).
  const ast = source.syntax;
  const identities = source.sourceFiles.flatMap(file => {
    return ast.statements(file).filter(statement => statement !== undefined && ast.is.IsInterfaceDeclaration(statement))
      .flatMap(statement => ast.members(statement).map(member =>
        csharpSourceProfileDeclarationIdentity(ast, source.facts, source.sourceFacts, member)))
      .filter(identity => identity !== undefined);
  });
  const stackCaptures = identities.filter(identity => identity.kind === "member" &&
    identity.declaringName === "ErrorConstructor" && identity.name === "captureStackTrace").map(identity => identity.declaration);
  return Object.freeze({
    fields: identities.filter(identity => identity.kind === "member" && identity.declaringName === "Error" &&
      ["name", "message", "stack"].includes(identity.name)).map(identity => identity.declaration),
    constructors: identities.filter(identity => (identity.kind === "call" || identity.kind === "construct") &&
      csharpSourceErrorNames.some(name => identity.declaringName === `${name}Constructor`)).map(identity => identity.declaration),
    stackCaptures,
    storageMutators: stackCaptures.map(signature => ({ signature, sourceParameterIndex: 0 })),
    retention: () => ({ kind: "ordinary" }),
  });
}

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
