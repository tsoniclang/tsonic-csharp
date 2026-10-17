import type {
  CsharpTargetTypeRenderShape,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpRenderShapeForTargetNamedType,
  csharpSourcePrimitiveCsharpRender,
  isCsharpNeverTargetType,
  isCsharpNullableReferenceTargetType,
} from "../../../target-model/types/index.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { tryCsharpIdentifier } from "../../../target-model/names/identifiers.js";
import { csharpFunctionPointerCallingConvention } from "../../../target-model/syntax/function-pointer-conventions.js";

export type CsharpTargetTypeRenderingRejectionReason =
  | "opaque"
  | "missing-render-shape"
  | "predefined-arity"
  | "nullable-arity"
  | "invalid-name"
  | "using-namespace"
  | "segment-arity"
  | "extern-alias"
  | "type-parameter-name"
  | "function-pointer-abi";

export interface CsharpTargetTypeRenderingRejection {
  readonly reason: CsharpTargetTypeRenderingRejectionReason;
  readonly subject: TargetTypeRef;
  readonly name?: string;
}

type TargetNamedTypeRef = Extract<TargetTypeRef, { readonly kind: "target-named" }>;
type NamedRenderShape = Extract<CsharpTargetTypeRenderShape, { readonly kind: "named" }>;

export function csharpTargetTypeRenderingRejection(type: TargetTypeRef): CsharpTargetTypeRenderingRejection | undefined {
  if (isCsharpNeverTargetType(type)) {
    return undefined;
  }
  const method = getCsharpMethodValue(type);
  if (method !== undefined) {
    return csharpTargetTypeRenderingRejection(method.owner);
  }
  switch (type.kind) {
    case "source-primitive":
      return undefined;
    case "target-named":
      return namedTypeRejection(type);
    case "type-parameter":
      return tryCsharpIdentifier(type.name) === undefined
        ? { reason: "type-parameter-name", subject: type, name: type.name }
        : undefined;
    case "array":
      return csharpTargetTypeRenderingRejection(type.element);
    case "tuple":
      return firstRejection(type.elements);
    case "pointer":
      return csharpTargetTypeRenderingRejection(type.pointee);
    case "function-pointer":
      return firstRejection(type.args) ??
        csharpTargetTypeRenderingRejection(type.result) ??
        (csharpFunctionPointerCallingConvention(type.abi) === undefined
          ? { reason: "function-pointer-abi", subject: type }
          : undefined);
    case "opaque":
      return { reason: "opaque", subject: type };
  }
}

export function csharpTargetTypeRendersAsUnqualifiedIdentifier(type: TargetTypeRef): boolean {
  if (csharpTargetTypeRenderingRejection(type) !== undefined) {
    return false;
  }
  if (isCsharpNeverTargetType(type)) {
    return true;
  }
  if (isCsharpNullableReferenceTargetType(type)) {
    return false;
  }
  const method = getCsharpMethodValue(type);
  if (method !== undefined) {
    return csharpTargetTypeRendersAsUnqualifiedIdentifier(method.owner);
  }
  switch (type.kind) {
    case "source-primitive":
      return csharpSourcePrimitiveCsharpRender(type.name).kind !== "predefined";
    case "type-parameter":
      return true;
    case "target-named": {
      const shape = csharpRenderShapeForTargetNamedType(type);
      return shape?.kind === "named" &&
        (shape.namespace ?? []).length === 0 &&
        (shape.nested ?? []).length === 0 &&
        shape.externAlias === undefined;
    }
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "opaque":
      return false;
  }
}

function firstRejection(types: readonly TargetTypeRef[]): CsharpTargetTypeRenderingRejection | undefined {
  return types.map(csharpTargetTypeRenderingRejection).find(rejection => rejection !== undefined);
}

function namedTypeRejection(type: TargetNamedTypeRef): CsharpTargetTypeRenderingRejection | undefined {
  const typeArguments = type.typeArguments ?? [];
  const argumentRejection = firstRejection(typeArguments);
  if (argumentRejection !== undefined) {
    return argumentRejection;
  }
  const shape = csharpRenderShapeForTargetNamedType(type);
  if (shape === undefined) {
    return { reason: "missing-render-shape", subject: type };
  }
  switch (shape.kind) {
    case "predefined":
      return typeArguments.length === 0 ? undefined : { reason: "predefined-arity", subject: type };
    case "nullable":
      return typeArguments.length === 1 ? undefined : { reason: "nullable-arity", subject: type };
    case "named":
      return namedShapeRejection(type, shape, typeArguments.length);
  }
}

function namedShapeRejection(
  type: TargetNamedTypeRef,
  shape: NamedRenderShape,
  typeArgumentCount: number,
): CsharpTargetTypeRenderingRejection | undefined {
  if (
    shape.usingNamespace !== undefined &&
    (shape.usingNamespace.length === 0 || (shape.namespace ?? []).length > 0 || shape.externAlias !== undefined)
  ) {
    return { reason: "using-namespace", subject: type };
  }
  const segments = [
    { name: shape.name, genericArity: shape.genericArity },
    ...(shape.nested ?? []),
  ];
  const segmentRejection = segmentsRejection(type, segments, shape.nested === undefined, typeArgumentCount, 0);
  if (segmentRejection !== undefined) {
    return segmentRejection;
  }
  if (shape.externAlias !== undefined && tryCsharpIdentifier(shape.externAlias) === undefined) {
    return { reason: "extern-alias", subject: type, name: shape.externAlias };
  }
  return undefined;
}

function segmentsRejection(
  type: TargetNamedTypeRef,
  segments: readonly { readonly name: string; readonly genericArity?: number }[],
  withoutNested: boolean,
  typeArgumentCount: number,
  argumentOffset: number,
): CsharpTargetTypeRenderingRejection | undefined {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    return argumentOffset === typeArgumentCount ? undefined : { reason: "segment-arity", subject: type };
  }
  const arity = segment.genericArity ?? (withoutNested && rest.length === 0 ? typeArgumentCount - argumentOffset : 0);
  const sliced = arity === 0 ? 0 : Math.max(0, Math.min(arity, typeArgumentCount - argumentOffset));
  if (sliced !== arity) {
    return { reason: "segment-arity", subject: type };
  }
  return segmentsRejection(type, rest, withoutNested, typeArgumentCount, argumentOffset + arity);
}

