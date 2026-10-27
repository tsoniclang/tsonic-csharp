import type { TargetTypeRef, CsharpObjectShapeFact, CsharpDelegateSignatureShape } from "../../types/model.js";
import type { CsharpCollectionElementRead } from "../../types/carriers/collection-reads.js";
import { targetTypeRefKey } from "../../types/equality.js";
import { getCsharpLambdaSignature } from "../../types/carriers/delegates.js";
import { getCsharpMethodValue } from "../../types/method-values.js";

export function csharpTypeEmissionKey(carrier: TargetTypeRef): string {
  const active = new Set<TargetTypeRef>();
  return JSON.stringify(encode(carrier));

  function encode(type: TargetTypeRef): unknown {
    const physical = targetTypeRefKey(type);
    if (active.has(type)) return [physical, "recursive"];
    active.add(type);
    const method = getCsharpMethodValue(type);
    const signature = getCsharpLambdaSignature(type);
    const children = type.kind === "target-named" ? type.typeArguments ?? []
      : type.kind === "array" ? [type.element] : type.kind === "tuple" ? type.elements
      : type.kind === "pointer" ? [type.pointee] : type.kind === "function-pointer" ? [...type.args, type.result] : [];
    const result = [physical, children.map(encode), method === undefined ? null
      : [method.method, method.identity, method.typeParameters, method.allowsRefLikeTypeArguments, encode(method.contract)],
      signature === undefined ? null : [signature.parameters.map(targetTypeRefKey), signature.parameterPassingModes,
        targetTypeRefKey(signature.returnType), signature.returnPassing ?? null,
        signature.optionalParameterIndexes ?? [], signature.restParameterIndex ?? null]];
    active.delete(type);
    return result;
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
