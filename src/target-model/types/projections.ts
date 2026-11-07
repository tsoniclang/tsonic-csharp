import { createHash } from "node:crypto";
import type { TargetTypeRef } from "./model.js";
import type { CsharpTypeParameterConstraint } from "./generic-constraints.js";
import { targetTypeRefKey } from "./equality.js";
import { csharpTargetNamedType } from "./factories.js";
import { csharpQualifiedTypeRenderShape } from "./render-shapes.js";

// Projected generic types: a type parameter that stands for a .NET carrier chosen per instantiation.
// - optional: `T | undefined` over an open T (Nullable<T> or a reference T?), with IOptionalStorage operations;
// - collection-key: the static Set/Map key contract over an open element (ICollectionKey<T, TSelf>);
// A Host sum with open arms is no projection: it is the generic runtime union over its arms, substituted per
// instantiation (Q91; representation/sums.ts).
// There is no conditional-type projection: TS conditional types are resolved by the Host (I6).

export interface CsharpOptionalTypeProjection {
  readonly kind: "optional";
  readonly part: "storage" | "operations";
  readonly arguments: readonly [TargetTypeRef];
}

export interface CsharpCollectionKeyTypeProjection {
  readonly kind: "collection-key";
  readonly arguments: readonly [TargetTypeRef];
}

export type CsharpTypeProjection = CsharpOptionalTypeProjection | CsharpCollectionKeyTypeProjection;

export type CsharpProjectedType = Extract<TargetTypeRef, { readonly kind: "type-parameter" }> & {
  readonly csharpProjection: CsharpTypeProjection;
  readonly csharpProjectionConstraints: readonly CsharpTypeParameterConstraint[];
};

export function csharpProjectedType(projection: CsharpTypeProjection): CsharpProjectedType {
  const key = JSON.stringify([projection.kind,
    projection.kind === "optional" ? "native-optional" : "native-collection-key",
    projection.arguments.map(targetTypeRefKey)]);
  const identity = createHash("sha256").update(key).digest("hex").slice(0, 16);
  const name = projection.kind === "collection-key" ? `CollectionKey_${identity}`
    : `Optional${projection.part === "storage" ? "Storage" : "Operations"}_${identity}`;
  const parameterIdentity = JSON.stringify(["projection", key, projection.kind === "collection-key" ? "result" : projection.part]);
  const constraints: readonly CsharpTypeParameterConstraint[] = projection.kind === "optional" && projection.part === "operations"
    ? [{ kind: "keyword", keyword: "struct" }, { kind: "type", type: csharpTargetNamedType("Tsonic.CSharp.Runtime.IOptionalStorage`2",
      [projection.arguments[0], csharpProjectedType({ ...projection, part: "storage" })],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "IOptionalStorage"), { allowsRefLikeTypeArguments: [false, false] }) }]
    : projection.kind === "collection-key"
    ? [{ kind: "keyword", keyword: "struct" }, { kind: "type", type: csharpTargetNamedType("Tsonic.CSharp.Js.ICollectionKey`2",
      [projection.arguments[0], Object.freeze({ kind: "type-parameter", identity: parameterIdentity, name })],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "ICollectionKey"), { allowsRefLikeTypeArguments: [false, false] }) }]
    : [];
  const contract: CsharpTypeProjection = Object.freeze({ ...projection,
    arguments: Object.freeze([projection.arguments[0]]) as readonly [TargetTypeRef] });
  return Object.freeze({ kind: "type-parameter", identity: parameterIdentity, name, csharpProjection: contract,
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
