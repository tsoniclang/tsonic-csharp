import { createHash } from "node:crypto";
import type { Node, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "./model.js";
import { targetTypeRefKey } from "./equality.js";

export interface CsharpTypeProjection {
  readonly declaration: Node;
  readonly identity: string;
  readonly sourceName: string;
  readonly sourceArguments: readonly Type[];
  readonly arguments: readonly TargetTypeRef[];
}

export type CsharpProjectedType = Extract<TargetTypeRef, { readonly kind: "type-parameter" }> & {
  readonly csharpProjection: CsharpTypeProjection;
};

export function csharpProjectedType(projection: CsharpTypeProjection): CsharpProjectedType {
  const key = JSON.stringify([projection.identity, projection.arguments.map(targetTypeRefKey)]);
  const identity = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return Object.freeze({ kind: "type-parameter", name: `${projection.sourceName}Result_${identity}`,
    csharpProjection: Object.freeze({ ...projection, sourceArguments: Object.freeze([...projection.sourceArguments]),
      arguments: Object.freeze([...projection.arguments]) }) });
}

export function csharpTypeProjection(type: TargetTypeRef | undefined): CsharpProjectedType | undefined {
  return type?.kind === "type-parameter" && type.csharpProjection !== undefined ? type as CsharpProjectedType : undefined;
}
