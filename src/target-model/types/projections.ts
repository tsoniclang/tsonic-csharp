import { createHash } from "node:crypto";
import type { TargetTypeRef } from "./model.js";
import type { CsharpTypeParameterConstraint } from "./generic-constraints.js";
import type { CsharpRepresentedTypeParameter } from "./representation.js";
import { targetTypeRefKey } from "./equality.js";
import { csharpTargetNamedType } from "./factories.js";
import { csharpQualifiedTypeRenderShape } from "./render-shapes.js";

export interface CsharpOptionalTypeProjection {
  readonly kind: "optional";
  readonly part: "storage" | "operations";
  readonly arguments: readonly [TargetTypeRef];
}

export interface CsharpOptionalStorageLayout {
  readonly payload: TargetTypeRef;
  readonly carrier: TargetTypeRef;
  readonly operations: TargetTypeRef;
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
}

export type CsharpOptionalProjectedType = CsharpRepresentedTypeParameter & {
  readonly csharpProjection: CsharpOptionalTypeProjection;
};

export function csharpOptionalProjectedType(projection: CsharpOptionalTypeProjection): CsharpOptionalProjectedType {
  const key = JSON.stringify(["native-optional", projection.part, targetTypeRefKey(projection.arguments[0])]);
  const identity = createHash("sha256").update(key).digest("hex").slice(0, 20);
  const name = `Optional${projection.part === "storage" ? "Storage" : "Operations"}_${identity}`;
  const constraints: readonly CsharpTypeParameterConstraint[] = projection.part === "operations"
    ? Object.freeze([{ kind: "keyword", keyword: "struct" }, { kind: "type", type: csharpTargetNamedType("Tsonic.CSharp.Runtime.IOptionalStorage`2",
      [projection.arguments[0], csharpOptionalProjectedType({ ...projection, part: "storage" })],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "IOptionalStorage"), { allowsRefLikeTypeArguments: [false, false] }) }]) : Object.freeze([]);
  return Object.freeze({ kind: "type-parameter", identity: JSON.stringify(["native-optional", key]), name,
    csharpProjection: Object.freeze({ ...projection, arguments: Object.freeze([projection.arguments[0]]) as readonly [TargetTypeRef] }),
    csharpConstraints: Object.freeze({ kind: "resolved", constraints }) });
}

export function getCsharpOptionalProjection(type: TargetTypeRef | undefined): CsharpOptionalProjectedType | undefined {
  return type?.kind === "type-parameter" && type.csharpProjection !== undefined && type.csharpConstraints?.kind === "resolved"
    ? { ...type, csharpProjection: type.csharpProjection, csharpConstraints: type.csharpConstraints } : undefined;
}

export function csharpOptionalStorageProjection(element: TargetTypeRef): CsharpOptionalProjectedType {
  return csharpOptionalProjectedType({ kind: "optional", part: "storage", arguments: [element] });
}

export function getCsharpGenericOptionalParts(type: TargetTypeRef | undefined):
  { readonly element: TargetTypeRef; readonly operations: CsharpOptionalProjectedType } | undefined {
  const projection = getCsharpOptionalProjection(type)?.csharpProjection;
  return projection?.part === "storage" ? { element: projection.arguments[0],
    operations: csharpOptionalProjectedType({ ...projection, part: "operations" }) } : undefined;
}
