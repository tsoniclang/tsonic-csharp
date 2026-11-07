import { createHash } from "node:crypto";
import type { Node, Type } from "@tsonic/tsts";
import { sourceTypeDescriptorsEqual, type SourceClosedSum, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "./model.js";
import type { CsharpTypeParameterConstraint } from "./generic-constraints.js";
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

interface CsharpSourceUnionProjection {
  readonly kind: "source-union";
  readonly source: SourceTypeDescriptor;
  readonly sum: CsharpSourceSumSelection;
  readonly arguments: readonly TargetTypeRef[];
}

export type CsharpSourceUnionTypeProjection = CsharpSourceUnionProjection & (
  { readonly part: "storage"; readonly roleArguments: readonly TargetTypeRef[] } | { readonly part: "operations" }
);

export interface CsharpSourceSumSelection {
  readonly owner: object;
  readonly record: SourceClosedSum;
  readonly namingIdentity: string;
  readonly roles: readonly { readonly role: number; readonly type: SourceTypeDescriptor }[];
}

const sourceSumProjectionIdentities = new WeakMap<SourceClosedSum, number>();
let nextSourceSumProjectionIdentity = 0;

const sourceStorageProjections = new WeakMap<object, {
  readonly source: SourceTypeDescriptor;
  readonly arguments: readonly TargetTypeRef[];
  readonly identity: number;
  readonly namingIdentity: string;
}[]>();

function sourceStorageProjection(projection: CsharpSourceUnionTypeProjection) {
  const entries = sourceStorageProjections.get(projection.sum.owner) ?? [];
  const selected = entries.find(entry => sourceTypeDescriptorsEqual(entry.source, projection.source) &&
    entry.arguments.length === projection.arguments.length &&
    entry.arguments.every((argument, index) => targetTypeRefEquals(argument, projection.arguments[index]!)));
  if (selected !== undefined) return selected;
  const entry = { source: projection.source, arguments: Object.freeze([...projection.arguments]),
    identity: nextSourceSumProjectionIdentity++, namingIdentity: projection.sum.namingIdentity };
  entries.push(entry);
  sourceStorageProjections.set(projection.sum.owner, entries);
  return entry;
}

function sourceSumProjectionIdentity(record: SourceClosedSum): number {
  let identity = sourceSumProjectionIdentities.get(record);
  if (identity === undefined) {
    identity = nextSourceSumProjectionIdentity++;
    sourceSumProjectionIdentities.set(record, identity);
  }
  return identity;
}

export type CsharpTypeProjection = CsharpConditionalTypeProjection | CsharpOptionalTypeProjection | CsharpSourceUnionTypeProjection;

export type CsharpProjectedType = Extract<TargetTypeRef, { readonly kind: "type-parameter" }> & {
  readonly csharpProjection: CsharpTypeProjection;
  readonly csharpProjectionConstraints: readonly CsharpTypeParameterConstraint[];
};

export function csharpProjectedType(projection: CsharpTypeProjection): CsharpProjectedType {
  if (projection.kind === "source-union" && (projection.sum.roles.length < 2 || projection.sum.roles.length > 8 ||
    (projection.part === "operations" ? projection.arguments.length !== projection.sum.roles.length + 1
      : projection.source.kind !== "union" || projection.arguments.length !== projection.source.types.length ||
        projection.roleArguments.length !== projection.sum.roles.length) ||
    projection.sum.roles.some(role => projection.sum.record.roles[role.role]?.role !== role.role))) {
    throw new TypeError("A Source union projection requires its complete original role and native argument vectors.");
  }
  const storage = projection.kind === "source-union" && projection.part === "storage" ? sourceStorageProjection(projection) : undefined;
  const key = JSON.stringify([projection.kind,
    projection.kind === "conditional" ? projection.identity : projection.kind === "optional" ? "native-optional"
      : storage?.identity ?? sourceSumProjectionIdentity(projection.sum.record),
    projection.arguments.map(targetTypeRefKey)]);
  const namingKey = projection.kind === "source-union"
    ? JSON.stringify([projection.kind, storage?.namingIdentity ?? projection.sum.namingIdentity, projection.arguments.map(targetTypeRefKey)]) : key;
  const identity = createHash("sha256").update(namingKey).digest("hex").slice(0, 16);
  const name = projection.kind === "conditional" ? `${projection.sourceName}Result_${identity}`
    : `${projection.kind === "optional" ? "Optional" : "SourceUnion"}${projection.part === "storage" ? "Storage" : "Operations"}_${identity}`;
  const constraints: readonly CsharpTypeParameterConstraint[] = projection.kind === "optional" && projection.part === "operations"
    ? [{ kind: "keyword", keyword: "struct" }, { kind: "type", type: csharpTargetNamedType("Tsonic.CSharp.Runtime.IOptionalStorage`2", [projection.arguments[0], csharpProjectedType({ ...projection, part: "storage" })], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "IOptionalStorage"), { allowsRefLikeTypeArguments: [false, false],}) }]
    : projection.kind === "source-union" && projection.part === "operations"
    ? [{ kind: "keyword", keyword: "struct" }, { kind: "type", type: csharpTargetNamedType(
      `Tsonic.CSharp.Runtime.ISourceUnion${projection.sum.roles.length}\`${projection.sum.roles.length + 1}`,
      projection.arguments,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", `ISourceUnion${projection.sum.roles.length}`),
      { allowsRefLikeTypeArguments: projection.arguments.map(() => false) }) }]
    : [];
  const contract = projection.kind === "conditional" ? Object.freeze({ ...projection,
    sourceArguments: Object.freeze([...projection.sourceArguments]), arguments: Object.freeze([...projection.arguments]),
  }) : projection.kind === "optional" ? Object.freeze({ ...projection,
    arguments: Object.freeze([projection.arguments[0]]) as readonly [TargetTypeRef] })
    : projection.part === "storage" ? Object.freeze({ ...projection, roleArguments: Object.freeze([...projection.roleArguments]),
      arguments: Object.freeze([...projection.arguments]) }) : Object.freeze({ ...projection, arguments: Object.freeze([...projection.arguments]) });
  return Object.freeze({ kind: "type-parameter", identity: JSON.stringify(["projection", key,
    projection.kind === "conditional" ? "result" : projection.part]), name, csharpProjection: contract,
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

export function getCsharpGenericSourceUnionParts(type: TargetTypeRef | undefined):
    { readonly members: readonly TargetTypeRef[]; readonly operations: CsharpProjectedType } | undefined {
  const projection = csharpTypeProjection(type)?.csharpProjection;
  return type !== undefined && projection?.kind === "source-union" && projection.part === "storage" ? {
    members: projection.arguments,
    operations: csharpProjectedType({ kind: projection.kind, part: "operations", source: projection.source,
      sum: projection.sum, arguments: [type, ...projection.roleArguments] }),
  } : undefined;
}
