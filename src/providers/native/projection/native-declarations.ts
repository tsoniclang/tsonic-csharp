import type { CsharpNativeDeclaration, CsharpNativeDeclarationMember } from "../../../target-model/types/native-declarations.js";
import type { CsharpNativeCallableMember, CsharpRepresentedTypeParameter, CsharpTypeParameterConstraint, TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpTargetMember } from "../../../target-model/types/model.js";
import { snapshotCsharpNativeDeclaration } from "../../../target-model/types/native-declaration-operations.js";
import { csharpTargetNamedType } from "../../../target-model/types/factories.js";
import type { DotnetConstraint, DotnetMemberDeclaration, DotnetSignatureDeclaration, DotnetTypeDeclaration, DotnetTypeParameterDeclaration } from "../model/types.js";
import type { DotnetProviderDiagnostic } from "../model/provider.js";
import { diagnostic } from "../model/diagnostics.js";
import { dotnetMemberToTargetMemberRecords } from "./members.js";
import { csharpTargetMetadataFromDotnetTypeDeclaration, dotnetRenderShapeToCsharpRenderShape, dotnetTypeRefToTargetTypeRef, requireDotnetTargetId } from "./type-ref.js";

export function dotnetTypeToNativeDeclaration(declaration: DotnetTypeDeclaration): CsharpNativeDeclaration | DotnetProviderDiagnostic {
  try {
    if ((declaration.unsupportedMembers?.length ?? 0) !== 0 ||
      (declaration.unsupportedImplementedContracts?.length ?? 0) !== 0) {
      return diagnostic("DOTNET_REFLECTION_NATIVE_DECLARATION_NOT_PROVEN",
        ".NET reflection provider cannot publish an incomplete Native member or implemented-contract inventory.", {
          targetId: declaration.targetId,
          members: declaration.unsupportedMembers ?? [],
          contracts: declaration.unsupportedImplementedContracts ?? [],
        });
    }
    const parameters = Object.freeze((declaration.typeParameters ?? []).map(nativeParameter));
    const carrier = csharpTargetNamedType(requireDotnetTargetId(declaration.targetId, declaration.metadataName), parameters,
      declaration.renderShape === undefined ? undefined : dotnetRenderShapeToCsharpRenderShape(declaration.renderShape),
      csharpTargetMetadataFromDotnetTypeDeclaration(declaration));
    const supertypes = [
      ...declaration.baseType === undefined ? [] : [dotnetTypeRefToTargetTypeRef(declaration.baseType)],
      ...(declaration.implementedContracts ?? []).flatMap(constraint => constraint.kind === "implements"
        ? [dotnetTypeRefToTargetTypeRef(constraint.contract)] : []),
    ];
    return snapshotCsharpNativeDeclaration({ carrier, kind: declaration.typeKind, parameters, supertypes,
      members: (declaration.members ?? []).flatMap(member => nativeMembers(member, carrier)) });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return diagnostic("DOTNET_REFLECTION_NATIVE_DECLARATION_NOT_PROVEN",
      ".NET reflection provider did not prove the complete original Native declaration ABI.", {
        targetId: declaration.targetId, reason: error.message,
      });
  }
}

function nativeParameter(parameter: DotnetTypeParameterDeclaration): CsharpRepresentedTypeParameter {
  if ((parameter.unsupportedConstraints?.length ?? 0) !== 0) {
    throw new TypeError(`Native binder '${parameter.identity}' has an unsupported original constraint.`);
  }
  return Object.freeze({ kind: "type-parameter", identity: parameter.identity, name: parameter.name,
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze((parameter.constraints ?? []).map(nativeConstraint)) }) });
}

function nativeConstraint(constraint: DotnetConstraint): CsharpTypeParameterConstraint {
  switch (constraint.kind) {
    case "implements": return Object.freeze({ kind: "type", type: dotnetTypeRefToTargetTypeRef(constraint.contract) });
    case "value-type": return Object.freeze({ kind: "keyword", keyword: "struct" });
    case "reference-type": return Object.freeze({ kind: "keyword", keyword: "class" });
    case "not-null": return Object.freeze({ kind: "keyword", keyword: "notnull" });
    case "unmanaged": return Object.freeze({ kind: "keyword", keyword: "unmanaged" });
    case "constructible": return Object.freeze({ kind: "constructor" });
    case "target-specific": throw new TypeError(`Native constraint '${constraint.name}' requires an exact physical representation.`);
  }
}

function nativeMembers(original: DotnetMemberDeclaration, carrier: TargetTypeRef): readonly CsharpNativeDeclarationMember[] {
  const signatures = new Map((original.signatures ?? []).map(signature => [signature.id, signature]));
  if (signatures.size !== (original.signatures?.length ?? 0)) {
    throw new TypeError("Every original Native callable signature identity occurs exactly once.");
  }
  const projected = dotnetMemberToTargetMemberRecords(original, carrier);
  const callable = original.kind === "constructor" || original.kind === "method" || original.kind === "operator" || original.kind === "indexer";
  if (projected.length !== (callable ? signatures.size : 1) || projected.length === 0) {
    throw new TypeError("Every original Native member and signature requires its complete physical projection.");
  }
  return Object.freeze(projected.map(entry => {
    const signature = entry.kind === "signature" ? signatures.get(entry.sourceSignatureId) : undefined;
    if (entry.kind === "signature" && signature === undefined) {
      throw new TypeError("A Native signature projection retains its exact original signature identity.");
    }
    const member = original.kind === "constructor" ? Object.freeze({ ...entry.targetMember, returnType: carrier }) : entry.targetMember;
    if (original.kind === "event") return Object.freeze({ kind: "event", member });
    if (original.kind === "property" || original.kind === "field" || original.kind === "indexer") {
      const type = member.returnType;
      if (type === undefined) throw new TypeError("A Native slot requires its exact original physical type.");
      return Object.freeze({ kind: "slot", member,
        storage: original.kind === "field" ? Object.freeze({ type, readonly: original.writable !== true }) : undefined,
        read: original.readable === true ? Object.freeze({ member, type, passingMode: member.csharpReturnPassing ?? "by-value" }) : undefined,
        write: original.writable === true ? Object.freeze({ member, type, passingMode: "by-value" }) : undefined });
    }
    if (signature === undefined) throw new TypeError("A Native callable retains its original signature.");
    return Object.freeze({ kind: "callable", member, method: nativeCallable(member, signature), value: undefined });
  }));
}

function nativeCallable(member: CsharpTargetMember, original: DotnetSignatureDeclaration): CsharpNativeCallableMember {
  const receiver = member.receiverPassing === "target-parameter" ? member.parameters[0]
    : member.kind !== "constructor" && member.static !== true && member.declaringType !== undefined
      ? Object.freeze({ type: member.declaringType, passingMode: "by-value" as const }) : undefined;
  const parameters = member.receiverPassing === "target-parameter" ? member.parameters.slice(1) : member.parameters;
  if (member.returnType === undefined || member.receiverPassing === "target-parameter" && receiver === undefined) {
    throw new TypeError("A Native callable requires its exact physical result and any explicit receiver.");
  }
  const restIndexes = parameters.flatMap((parameter, index) => parameter.paramsArray === true ? [index] : []);
  if (restIndexes.length > 1 || restIndexes.length === 1 && restIndexes[0] !== parameters.length - 1) {
    throw new TypeError("A Native rest parameter retains its one original trailing physical slot.");
  }
  return Object.freeze({ name: member.targetName,
    typeParameters: Object.freeze((original.typeParameters ?? []).map(parameter => {
      const represented = nativeParameter(parameter);
      return Object.freeze({ identity: represented.identity, name: represented.name, constraints: represented.csharpConstraints.constraints });
    })),
    signature: Object.freeze({ kind: member.kind === "constructor" ? "construct" : "call",
      ...(receiver === undefined ? {} : { receiver: Object.freeze({ type: receiver.type, passingMode: receiver.passingMode }) }),
      parameters: Object.freeze(parameters.map(parameter => parameter.type)),
      parameterPassingModes: Object.freeze(parameters.map(parameter => parameter.passingMode)), returnType: member.returnType,
      ...(member.csharpReturnPassing === undefined ? {} : { returnPassing: member.csharpReturnPassing }),
      optionalParameterIndexes: Object.freeze(parameters.flatMap((parameter, index) => parameter.optional === true ? [index] : [])),
      ...(restIndexes.length === 0 ? {} : { restParameterIndex: restIndexes[0]! }) }) });
}
