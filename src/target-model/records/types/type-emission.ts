import type { TargetTypeRef, CsharpObjectShapeFact, CsharpDelegateSignatureShape, CsharpNativeCallableMember } from "../../types/model.js";
import type { CsharpCollectionElementRead } from "../../types/carriers/collection-reads.js";
import { targetTypeRefKey } from "../../types/equality.js";
import { getCsharpCallableMembers, getCsharpLambdaSignature } from "../../types/carriers/delegates.js";
import { csharpTargetTypeComponents } from "../../types/components.js";
import { getCsharpMethodValue } from "../../types/method-values.js";

export function csharpTypeEmissionKey(carrier: TargetTypeRef): string {
  const active = new Set<TargetTypeRef>();
  const encoded = new Map<TargetTypeRef, number>();
  const positions = new Map<string, number>();
  const entries: unknown[] = [];
  const root = encode(carrier);
  return JSON.stringify([root, entries]);

  function intern(value: readonly unknown[]): number {
    const key = JSON.stringify(value);
    const previous = positions.get(key);
    if (previous !== undefined) return previous;
    const index = entries.length;
    entries.push(value);
    positions.set(key, index);
    return index;
  }

  function encode(type: TargetTypeRef): number {
    const previous = encoded.get(type);
    if (previous !== undefined) return previous;
    const physical = targetTypeRefKey(type);
    if (active.has(type)) return intern([physical, "recursive"]);
    active.add(type);
    const method = getCsharpMethodValue(type);
    const signature = getCsharpLambdaSignature(type);
    const members = getCsharpCallableMembers(type);
    const constraints = type.kind === "type-parameter" ? type.csharpConstraints : undefined;
    const result = [physical, [...new Set(csharpTargetTypeComponents(type).map(encode))], method === undefined ? null
      : [method.method, method.identity, method.typeParameters, method.allowsRefLikeTypeArguments, encode(method.contract)],
      signature === undefined ? null : encodeSignature(signature),
      members?.map(member => [member.name,
        member.typeParameters.map(parameter => [parameter.identity, parameter.name, encodeConstraints(parameter.constraints)]),
        encodeSignature(member.signature)]) ?? null,
      type.kind === "type-parameter" ? [type.name, constraints === undefined ? null
        : constraints.kind === "resolved" ? [constraints.kind, encodeConstraints(constraints.constraints)]
        : [constraints.kind, constraints.reason]] : null];
    active.delete(type);
    const position = intern(result);
    encoded.set(type, position);
    return position;
  }

  function encodeSignature(signature: CsharpDelegateSignatureShape): unknown {
    return [signature.kind, signature.receiver === undefined ? null
      : [encode(signature.receiver.type), signature.receiver.passingMode],
      signature.parameters.map(encode), signature.parameterPassingModes, encode(signature.returnType), signature.returnPassing ?? null,
      signature.optionalParameterIndexes ?? [], signature.restParameterIndex ?? null];
  }

  function encodeConstraints(constraints: CsharpNativeCallableMember["typeParameters"][number]["constraints"]): readonly unknown[] {
    return constraints.map(constraint => constraint.kind === "type" ? [constraint.kind, encode(constraint.type)]
      : constraint.kind === "keyword" ? [constraint.kind, constraint.keyword] : [constraint.kind]);
  }
}

export type CsharpOptionalStorageEmission =
  | { readonly kind: "generic"; readonly present: TargetTypeRef; readonly operations: TargetTypeRef }
  | { readonly kind: "native"; readonly present: TargetTypeRef; readonly absence: boolean; readonly jsValue: boolean };

export interface CsharpTypeEmission {
  readonly lambda: CsharpDelegateSignatureShape | undefined;
  readonly taskResult: TargetTypeRef | undefined;
  readonly completion: "value" | "void" | "never";
  readonly coalescing: "operator" | "guard";
  readonly nullable: boolean;
  readonly nullableReference: boolean;
  readonly valueType: boolean;
  readonly unionAccess: { readonly kind: "direct" | "nullable" } | { readonly kind: "generic"; readonly operations: TargetTypeRef };
  readonly collectionRead: Exclude<CsharpCollectionElementRead, { readonly kind: "invalid" }> | undefined;
  readonly collectionLength: string | undefined;
  readonly optionalStorage: CsharpOptionalStorageEmission;
  readonly unsafeContext: boolean;
  readonly objectShapes: readonly CsharpObjectShapeFact[];
}

export interface CsharpTypeEmissionRecords {
  readonly typeEmission: { readonly get: (carrier: TargetTypeRef) => CsharpTypeEmission | undefined };
}
