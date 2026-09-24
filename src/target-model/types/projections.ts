import { createHash } from "node:crypto";
import type { Node, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "./model.js";
import type { CsharpTypeParameterConstraint } from "../declarations/generic-constraints.js";
import { targetTypeRefKey } from "./equality.js";
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
    ? [{ kind: "keyword", keyword: "struct" }, { kind: "type", type: csharpTargetNamedType(
      "Tsonic.CSharp.Runtime.IOptionalStorage`2",
      [projection.arguments[0], csharpProjectedType({ ...projection, part: "storage" })],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "IOptionalStorage"),
    ) }]
    : [];
  const contract = projection.kind === "conditional" ? Object.freeze({ ...projection,
    sourceArguments: Object.freeze([...projection.sourceArguments]), arguments: Object.freeze([...projection.arguments]),
  }) : Object.freeze({ ...projection,
    arguments: Object.freeze([projection.arguments[0]]) as readonly [TargetTypeRef] });
  return Object.freeze({ kind: "type-parameter", name, csharpProjection: contract,
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
