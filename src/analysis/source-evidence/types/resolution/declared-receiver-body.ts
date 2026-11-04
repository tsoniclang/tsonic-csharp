import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpObjectMemberDeclarationSource } from "../../../../target-model/records/objects/member-declarations.js";
import type { CsharpDeclaredObjectReceiverContextSource } from "../../../../target-model/records/native/native-value-carriers.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "./model.js";
import type { CsharpDeclaredObjectReceiverTypeSource } from "./declared-receiver-source.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { formCsharpCallableSignatureInput, type CsharpCallableSignatureInput } from "./callable-signature-completion.js";
import { resolveFormedCsharpCallableDeclarationSignature } from "./source-profiles.js";
import { formCsharpObjectShapePropertySource } from "../../../objects/shapes/member-evidence.js";
import { resolveCsharpStructuralPropertyType, type CsharpStructuralPropertyApplication } from "./structural-applications.js";
import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { closeCsharpOwnerTypeParameterEnvironment, csharpObjectShapeTypeParameters } from "./owner-type-parameter-environment.js";
import { nextState } from "./state.js";
import { csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../../../target-model/types/generic-references.js";
import { createCsharpMetadataBudget } from "../../../../target-model/metadata/immutable.js";

export interface CsharpDeclaredReceiverMemberStorageSource {
  readonly declaration: CsharpObjectMemberDeclarationSource;
  readonly inputState: CsharpTypeResolutionState;
  readonly selection: ReturnType<CsharpTypePolicyBaseHost["sourceStorage"]["memberSubjectFor"]> | undefined;
  readonly state: CsharpTypeResolutionState;
}

export type CsharpDeclaredReceiverBodyMemberSource =
  | { readonly kind: "unavailable"; readonly declaration: CsharpObjectMemberDeclarationSource | undefined }
  | { readonly kind: "method"; readonly declaration: CsharpObjectMemberDeclarationSource;
      readonly storage: CsharpDeclaredReceiverMemberStorageSource; readonly signature: CsharpCallableSignatureInput }
  | { readonly kind: "property"; readonly declaration: CsharpObjectMemberDeclarationSource;
      readonly storage: CsharpDeclaredReceiverMemberStorageSource; readonly property: CsharpStructuralPropertyApplication };

export interface CsharpDeclaredReceiverBody {
  readonly source: CsharpDeclaredObjectReceiverTypeSource;
  readonly self: CsharpDeclaredObjectReceiverContextSource["receiver"]["self"];
  readonly members: readonly Pick<CsharpObjectShapeMemberFact, "type" | "typeParameters">[];
  readonly components: readonly TargetTypeRef[];
}

export function formCsharpDeclaredReceiverBodyMembers(
  host: CsharpTypePolicyBaseHost,
  context: CsharpDeclaredObjectReceiverContextSource,
  state: CsharpTypeResolutionState,
): readonly CsharpDeclaredReceiverBodyMemberSource[] {
  return Object.freeze(Array.from(context.receiver.declaredMembers, (declaration): CsharpDeclaredReceiverBodyMemberSource => {
    if (declaration === undefined) return Object.freeze({ kind: "unavailable", declaration });
    const storage = formCsharpDeclaredReceiverMemberStorage(host, declaration, state);
    if (declaration.method) {
      return declaration.callableSignature === undefined ? Object.freeze({ kind: "unavailable", declaration })
        : Object.freeze({ kind: "method", declaration, storage,
            signature: formCsharpCallableSignatureInput(host, declaration.callableSignature, Object.freeze(nextState(storage.state))) });
    }
    return Object.freeze({ kind: "property", declaration, storage,
      property: formCsharpObjectShapePropertySource(host, declaration.property, declaration.propertyType,
        declaration.queries, storage.state) });
  }));
}

export function formCsharpDeclaredReceiverMemberStorage(
  host: Pick<CsharpTypePolicyBaseHost, "sourceStorage">,
  declaration: CsharpObjectMemberDeclarationSource,
  inputState: CsharpTypeResolutionState,
): CsharpDeclaredReceiverMemberStorageSource {
  const selection = declaration.declarations.length !== 1 ? undefined
    : host.sourceStorage.memberSubjectFor(declaration.declarations[0]!);
  return Object.freeze({ declaration, inputState, selection,
    state: Object.freeze({ ...inputState, sourceStorageSubject: selection?.kind === "resolved" ? selection.subject : undefined }),
  });
}

export function assertCsharpDeclaredReceiverMemberStorage(
  source: CsharpDeclaredReceiverMemberStorageSource,
  declaration: CsharpObjectMemberDeclarationSource,
  inputState: CsharpTypeResolutionState,
): void {
  if (source === undefined || source.declaration !== declaration || source.inputState !== inputState ||
    source.state.depth !== inputState.depth || source.state.sourceBindings !== inputState.sourceBindings ||
    source.state.sourceStorageBindings !== inputState.sourceStorageBindings ||
    source.state.rejectNativeResolution !== inputState.rejectNativeResolution ||
    source.state.sourceStorageSubject !== (source.selection?.kind === "resolved" ? source.selection.subject : undefined)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A declared member requires its exact H0 slot and original binding frame.");
  }
}

export function resolveFormedCsharpDeclaredReceiverBody(
  scope: CsharpTypeResolutionScope,
  source: CsharpDeclaredObjectReceiverTypeSource,
): CsharpDeclaredReceiverBody | undefined {
  if (source.context !== scope.host.declaredObjectReceivers.get(source.node)) return failTargetAnalysisInvariant("tsonic-csharp",
    "A declared body requires its exact receiver occurrence.", source.node);
  const receiver = source.context.receiver;
  if (source.members !== receiver.members || source.declarations !== receiver.declaredMembers ||
    source.body === undefined || source.body.length !== source.declarations.length ||
    source.members.length !== source.declarations.length || Array.from(source.body).some((member, index) =>
      member === undefined || member.declaration !== source.declarations[index] ||
      member.declaration !== undefined && member.declaration.property !== source.members[index])) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A declared body requires every original member and its retained child source.", source.node);
  }
  const members: Pick<CsharpObjectShapeMemberFact, "type" | "typeParameters">[] = [];
  for (const member of source.body) {
    if (member.kind === "unavailable") return failTargetAnalysisInvariant("tsonic-csharp",
      "The declared receiver body has an unavailable authored member.", source.node);
    const declaration = member.declaration;
    assertCsharpDeclaredReceiverMemberStorage(member.storage, declaration, source.state);
    const memberState = member.storage.state;
    if (member.kind === "method") {
      if (!declaration.method || member.signature.source !== declaration.callableSignature ||
        member.signature.source.declaration !== declaration.callableDeclaration ||
        member.signature.state.depth !== memberState.depth + 1 ||
        member.signature.state.sourceBindings !== memberState.sourceBindings ||
        member.signature.state.sourceStorageSubject !== memberState.sourceStorageSubject ||
        member.signature.state.sourceStorageBindings !== memberState.sourceStorageBindings ||
        member.signature.state.rejectNativeResolution !== memberState.rejectNativeResolution) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "A declared body method requires its exact authored signature and bound state.", source.node);
      }
      const completed = resolveFormedCsharpCallableDeclarationSignature(scope, member.signature);
      if (completed === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared receiver signature could not complete before its physical identity.", source.node);
      members.push(Object.freeze({
        type: declaration.property.optional ? csharpNullableTargetType(completed.signature) : completed.signature,
        typeParameters: completed.declaration.typeParameters,
      }));
    } else {
      if (declaration.method || member.property.source.sourceType !== declaration.propertyType ||
        member.property.source.queries !== declaration.queries ||
        member.property.selected.state.depth !== memberState.depth + 1 ||
        member.property.selected.state.sourceBindings !== memberState.sourceBindings ||
        member.property.selected.state.sourceStorageSubject !== memberState.sourceStorageSubject ||
        member.property.selected.state.sourceStorageBindings !== memberState.sourceStorageBindings ||
        member.property.selected.state.rejectNativeResolution !== memberState.rejectNativeResolution) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "A declared body property requires its exact authored type and bound state.", source.node);
      }
      const type = resolveCsharpStructuralPropertyType(scope, member.property);
      if (type === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared receiver member could not complete before its physical identity.", source.node);
      members.push(Object.freeze({ type: declaration.property.optional ? csharpNullableTargetType(type) : type }));
    }
  }
  const declared = Object.freeze(members);
  return Object.freeze({ source, self: receiver.self, members: declared,
    components: csharpDeclaredMemberComponents(declared, scope.host.typeParameterConstraints) });
}

export function csharpDeclaredMemberComponents(
  declared: readonly Pick<CsharpObjectShapeMemberFact, "type" | "typeParameters">[],
  environment: CsharpTypeResolutionScope["host"]["typeParameterConstraints"],
): readonly TargetTypeRef[] {
  const parameters: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[] = [];
  const budget = createCsharpMetadataBudget();
  budget.reserve(declared.length);
  for (const member of declared) {
    const bound = new Set(member.typeParameters?.map(parameter => parameter.identity));
    const pending = [...csharpObjectShapeTypeParameters([member], undefined)];
    const visited = new Set<TargetTypeRef>();
    for (let index = 0; index < pending.length; index += 1) {
      budget.reserve(1);
      const parameter = pending[index]!;
      if (visited.has(parameter) || bound.has(parameter.identity)) continue;
      visited.add(parameter);
      const projection = parameter.csharpProjection;
      if (projection !== undefined && [...csharpFreeTypeParameterIdentities(projection.arguments)]
        .some(identity => bound.has(identity))) {
        for (const argument of projection.arguments) visitCsharpTargetTypeParameters(argument,
          parameter => { budget.reserve(1); pending.push(parameter); }, budget);
        for (const constraint of parameter.csharpProjectionConstraints ?? []) {
          if (constraint.kind === "type") visitCsharpTargetTypeParameters(constraint.type,
            parameter => { budget.reserve(1); pending.push(parameter); }, budget);
        }
      } else {
        parameters.push(parameter);
      }
    }
  }
  return closeCsharpOwnerTypeParameterEnvironment(parameters, environment);
}
