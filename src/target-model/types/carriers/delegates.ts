import type { TargetTypeRef } from "../native-type-data.js";
import type { CsharpDelegateTargetTypeRef, CsharpTaskTargetTypeRef, CsharpTargetNamedTypeRef } from "../model.js";
import type { CsharpDelegateSignatureShape, CsharpNativeCallableMember } from "../native-type-data.js";
import { isCsharpVoidTargetType } from "../identity.js";

import { scopedTargetTypeRefKey, targetTypeRefEquals } from "../equality.js";
import type { CsharpNativeTypeIdentity } from "../equality.js";
import { csharpQualifiedTypeRenderShape } from "../render-shapes.js";
import { csharpVoidTargetType } from "./scalar-types.js";
import { csharpTargetNamedType } from "../factories.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";

export function csharpDelegateTargetType(
  kind: "System.Action" | "System.Func",
  parameters: readonly TargetTypeRef[],
  returnType?: TargetTypeRef,
  options: {
    readonly optionalParameterIndexes?: readonly number[];
    readonly restParameterIndex?: number;
  } = {},
): CsharpDelegateTargetTypeRef {
  const typeArguments = returnType === undefined
    ? parameters
    : [...parameters, returnType];
  const id = kind === "System.Action"
    ? parameters.length === 0 ? "System.Action" : `System.Action\`${parameters.length}`
    : `System.Func\`${parameters.length + 1}`;
  const targetType = csharpTargetNamedType(id, typeArguments, {
    kind: "named",
    name: kind === "System.Action" ? "Action" : "Func",
    usingNamespace: ["System"],
  }, { allowsRefLikeTypeArguments: typeArguments.map(() => true), constraintRequiresReferenceType: true });
  return {
    ...targetType,
    csharpDelegateSignature: {
      kind: "call",
      parameters,
      parameterPassingModes: Object.freeze(parameters.map(() => "by-value" as const)),
      returnType: returnType ?? csharpVoidTargetType(),
      ...(options.optionalParameterIndexes === undefined ||
          options.optionalParameterIndexes.length === 0
        ? {}
        : {
            optionalParameterIndexes: Object.freeze([
              ...options.optionalParameterIndexes,
            ]),
          }),
      ...(options.restParameterIndex === undefined
        ? {}
        : { restParameterIndex: options.restParameterIndex }),
    },
  } satisfies CsharpDelegateTargetTypeRef;
}

export function csharpTaskTargetType(resultType: TargetTypeRef): CsharpTaskTargetTypeRef {
  const targetType = isCsharpVoidTargetType(resultType)
    ? csharpTargetNamedType("System.Threading.Tasks.Task", undefined, csharpQualifiedTypeRenderShape("System.Threading.Tasks", "Task"), { sourceDeclarationKind: "class", constraintRequiresReferenceType: true, allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" })
    : csharpTargetNamedType("System.Threading.Tasks.Task`1", [resultType], csharpQualifiedTypeRenderShape("System.Threading.Tasks", "Task"), { sourceDeclarationKind: "class", constraintRequiresReferenceType: true, allowsRefLikeTypeArguments: [false], typeofRuntimeKind: "object" });
  return {
    ...targetType,
    csharpTaskResultType: resultType,
    ...(!isCsharpVoidTargetType(resultType)
      ? { csharpBaseType: csharpTaskTargetType(csharpVoidTargetType()) } : {}),
  } satisfies CsharpTaskTargetTypeRef;
}

export function getCsharpTaskResultTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType
    : undefined;
}

export function getCsharpDelegateSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  return type?.kind === "target-named"
    ? (type as Partial<CsharpDelegateTargetTypeRef>).csharpDelegateSignature
    : undefined;
}

export function getCsharpCallableValueSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  const members = getCsharpCallableMembers(type);
  return members?.length === 1 ? members[0]!.signature : undefined;
}

export function getCsharpCallableMembers(type: TargetTypeRef | undefined): readonly CsharpNativeCallableMember[] | undefined {
  const contract = type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpMethodValue?.contract : undefined;
  const physical = contract ?? type;
  if (physical?.kind !== "target-named") return undefined;
  const native = physical as CsharpTargetNamedTypeRef;
  if (native.csharpCallableMembers !== undefined && native.csharpDelegateSignature !== undefined) {
    throw new TypeError("A Native callable has either a delegate Invoke ABI or a complete member ABI, never both.");
  }
  return native.csharpCallableMembers ?? (native.csharpDelegateSignature === undefined ? undefined
    : Object.freeze([Object.freeze({ name: "Invoke", typeParameters: Object.freeze([]), signature: native.csharpDelegateSignature })]));
}

export function getCsharpExpressionTreeDelegateType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpExpressionTreeDelegateType : undefined;
}

export function csharpNativeCallableMemberKey(identity: CsharpNativeTypeIdentity, member: CsharpNativeCallableMember,
  enclosingParameters: ReadonlyMap<string, number> = new Map()): string {
  const bound = new Map(enclosingParameters);
  for (const [index, parameter] of member.typeParameters.entries()) bound.set(parameter.identity, enclosingParameters.size + index);
  const key = (type: TargetTypeRef): string => scopedTargetTypeRefKey(identity, type, bound);
  const signature = member.signature;
  return JSON.stringify([member.name,
    member.typeParameters.map(parameter => parameter.constraints.map(constraint => constraint.kind === "type"
      ? [constraint.kind, key(constraint.type)] : constraint.kind === "keyword" ? [constraint.kind, constraint.keyword] : [constraint.kind])),
    signature.kind, signature.receiver === undefined ? null : [key(signature.receiver.type), signature.receiver.passingMode],
    signature.parameters.map(key), signature.parameterPassingModes, key(signature.returnType), signature.returnPassing ?? null,
    signature.optionalParameterIndexes ?? [], signature.restParameterIndex ?? null,
  ]);
}

export function csharpNativeCallableMembersEqual(identity: CsharpNativeTypeIdentity,
  left: readonly CsharpNativeCallableMember[], right: readonly CsharpNativeCallableMember[]): boolean {
  return left.length === right.length && left.every((member, index) => csharpNativeCallableMemberKey(identity, member) === csharpNativeCallableMemberKey(identity, right[index]!));
}

export function getCsharpLambdaSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  return getCsharpCallableValueSignature(getCsharpExpressionTreeDelegateType(type) ?? type);
}

export function csharpDelegateSignatureHasSupportedPassingModes(signature: CsharpDelegateSignatureShape): boolean {
  if ((signature.kind !== "call" && signature.kind !== "construct") ||
    signature.receiver !== undefined && !["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"].includes(signature.receiver.passingMode) ||
    !Array.isArray(signature.parameters) || !Array.isArray(signature.parameterPassingModes) ||
    signature.parameterPassingModes.length !== signature.parameters.length ||
    signature.returnPassing !== undefined && signature.returnPassing !== "byref-readwrite" &&
      signature.returnPassing !== "byref-readonly") return false;
  for (const [index, parameter] of signature.parameters.entries()) {
    const mode = signature.parameterPassingModes[index];
    if (parameter === undefined || mode !== "by-value" && mode !== "byref-readonly" &&
      mode !== "byref-readwrite" && mode !== "byref-writeonly-must-init") return false;
  }
  return true;
}

export function csharpDelegateSignaturesMatchNativeBinding(
  identity: CsharpNativeTypeIdentity,
  source: CsharpDelegateSignatureShape,
  target: CsharpDelegateSignatureShape,
): boolean {
  return csharpDelegateSignatureHasSupportedPassingModes(source) &&
    csharpDelegateSignatureHasSupportedPassingModes(target) &&
    source.kind === target.kind &&
    (source.receiver === undefined ? target.receiver === undefined : target.receiver !== undefined &&
      source.receiver.passingMode === target.receiver.passingMode && targetTypeRefEquals(identity, source.receiver.type, target.receiver.type)) &&
    source.parameters.length === target.parameters.length &&
    source.returnPassing === target.returnPassing &&
    source.parameters.every((parameter, index) => targetTypeRefEquals(identity, parameter, target.parameters[index]!) &&
      source.parameterPassingModes[index] === target.parameterPassingModes[index]) &&
    targetTypeRefEquals(identity, source.returnType, target.returnType);
}

export function isCsharpSourceDelegateTargetType(identity: CsharpNativeTypeIdentity, type: TargetTypeRef | undefined): boolean {
  const value = getCsharpNullableElementTargetType(type) ?? type;
  const signature = getCsharpDelegateSignature(value);
  if (value === undefined || signature === undefined || signature.kind !== "call" || signature.receiver !== undefined || signature.returnPassing !== undefined ||
    !csharpDelegateSignatureHasSupportedPassingModes(signature) ||
    signature.parameterPassingModes.some(mode => mode !== "by-value")) return false;
  return targetTypeRefEquals(identity, value, csharpDelegateTargetType(
    isCsharpVoidTargetType(signature.returnType) ? "System.Action" : "System.Func",
    signature.parameters,
    isCsharpVoidTargetType(signature.returnType) ? undefined : signature.returnType,
    signature,
  ));
}
