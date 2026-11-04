import { createHash } from "node:crypto";
import type { Node, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "./model.js";
import { csharpTypeParameterConstraintResolutionKey, type CsharpTypeParameterConstraint } from "./generic-constraints.js";
import { targetTypeRefEquals, targetTypeRefKey } from "./equality.js";
import { csharpTargetNamedType } from "./factories.js";
import { csharpQualifiedTypeRenderShape } from "./render-shapes.js";

export interface CsharpConditionalTypeProjection {
  readonly kind: "conditional";
  readonly declaration: Node;
  readonly identity: string;
  readonly sourceName: string;
  readonly sourceArguments: readonly Type[];
  readonly arguments: readonly TargetTypeRef[];
}

export interface CsharpOptionalTypeProjection {
  readonly kind: "optional";
  readonly part: "storage" | "operations";
  readonly arguments: readonly [TargetTypeRef];
}

export type CsharpTypeProjection = CsharpConditionalTypeProjection | CsharpOptionalTypeProjection;

export type CsharpProjectedType = Extract<TargetTypeRef, { readonly kind: "type-parameter" }> & {
  readonly csharpProjection: CsharpTypeProjection;
  readonly csharpProjectionConstraints: readonly CsharpTypeParameterConstraint[];
};

export function csharpProjectedType(projection: CsharpTypeProjection): CsharpProjectedType {
  const key = JSON.stringify([projection.kind,
    projection.kind === "conditional" ? projection.identity : "native-optional",
    projection.arguments.map(targetTypeRefKey)]);
  const identity = createHash("sha256").update(key).digest("hex").slice(0, 16);
  const name = projection.kind === "conditional" ? `${projection.sourceName}Result_${identity}`
    : `Optional${projection.part === "storage" ? "Storage" : "Operations"}_${identity}`;
  const constraints: readonly CsharpTypeParameterConstraint[] = projection.kind === "optional" && projection.part === "operations"
    ? [{ kind: "keyword", keyword: "struct" }, { kind: "type", type: csharpTargetNamedType("Tsonic.CSharp.Runtime.IOptionalStorage`2", [projection.arguments[0], csharpProjectedType({ ...projection, part: "storage" })], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "IOptionalStorage"), { allowsRefLikeTypeArguments: [false, false],}) }]
    : [];
  const contract = projection.kind === "conditional" ? Object.freeze({ ...projection,
    sourceArguments: Object.freeze([...projection.sourceArguments]), arguments: Object.freeze([...projection.arguments]),
  }) : Object.freeze({ ...projection,
    arguments: Object.freeze([projection.arguments[0]]) as readonly [TargetTypeRef] });
  return Object.freeze({ kind: "type-parameter", identity: JSON.stringify(["projection", key,
    projection.kind === "optional" ? projection.part : "result"]), name, csharpProjection: contract,
    csharpProjectionConstraints: Object.freeze(constraints) });
}

export function csharpTypeProjection(type: TargetTypeRef | undefined): CsharpProjectedType | undefined {
  return type?.kind === "type-parameter" && type.csharpProjection !== undefined ? type as CsharpProjectedType : undefined;
}

export function csharpOptionalStorageProjection(element: TargetTypeRef): CsharpProjectedType {
  return csharpProjectedType({ kind: "optional", part: "storage", arguments: [element] });
}

export function getCsharpGenericOptionalParts(type: TargetTypeRef | undefined):
    { readonly element: TargetTypeRef; readonly operations: CsharpProjectedType } | undefined {
  const projection = csharpTypeProjection(type)?.csharpProjection;
  return projection?.kind === "optional" && projection.part === "storage" ? {
    element: projection.arguments[0],
    operations: csharpProjectedType({ ...projection, part: "operations" }),
  } : undefined;
}

export function csharpTypeProjectionVectorsEqual(
  left: readonly CsharpProjectedType[],
  right: readonly CsharpProjectedType[],
): boolean {
  return left.length === right.length && left.every((type, index) => {
    const other = right[index]!;
    const initial = type.csharpProjection;
    const final = other.csharpProjection;
    return type.identity === other.identity && type.name === other.name && initial.kind === final.kind &&
      initial.arguments.length === final.arguments.length && initial.arguments.every((argument, index) =>
        targetTypeRefEquals(argument, final.arguments[index]!)) &&
      csharpTypeParameterConstraintResolutionKey(type.csharpConstraints) ===
        csharpTypeParameterConstraintResolutionKey(other.csharpConstraints) &&
      csharpTypeParameterConstraintResolutionKey({ kind: "resolved", constraints: type.csharpProjectionConstraints }) ===
        csharpTypeParameterConstraintResolutionKey({ kind: "resolved", constraints: other.csharpProjectionConstraints }) &&
      (initial.kind === "optional" ? final.kind === "optional" && initial.part === final.part
        : final.kind === "conditional" && initial.declaration === final.declaration &&
          initial.identity === final.identity && initial.sourceName === final.sourceName &&
          initial.sourceArguments.length === final.sourceArguments.length && initial.sourceArguments.every((argument, index) =>
            argument === final.sourceArguments[index]));
  });
}
