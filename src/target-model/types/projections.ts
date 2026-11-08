import { createHash } from "node:crypto";
import type { CsharpOptionalProjectedType, CsharpOptionalStorageDefinitions, CsharpOptionalTypeProjection, CsharpTypeParameterConstraint, TargetTypeRef } from "./native-type-data.js";
import { targetTypeRefKey } from "./equality.js";
import { applyCsharpNativeGenericType, csharpOptionalStorageDefinitionNames } from "./native-generics.js";

export function csharpOptionalProjectedType(projection: CsharpOptionalTypeProjection): CsharpOptionalProjectedType {
  const definitions = csharpOptionalStorageDefinitionNames.map(name => {
    const definition = projection.definitions[name];
    return [name, targetTypeRefKey(definition.carrier, "emission"), definition.parameters];
  });
  const key = JSON.stringify(["native-optional", projection.part, targetTypeRefKey(projection.arguments[0], "emission"), definitions]);
  const identity = createHash("sha256").update(key).digest("hex").slice(0, 20);
  const name = `Optional${projection.part === "storage" ? "Storage" : "Operations"}_${identity}`;
  const storage = projection.part === "operations" ? csharpOptionalProjectedType({ ...projection, part: "storage" }) : undefined;
  const constraints: readonly CsharpTypeParameterConstraint[] = projection.part === "operations"
    ? Object.freeze([{ kind: "keyword", keyword: "struct" }, { kind: "type", type: applyCsharpNativeGenericType(projection.definitions.contract,
      [projection.arguments[0], storage!]) }]) : Object.freeze([]);
  return Object.freeze({ kind: "type-parameter", identity: JSON.stringify(["native-optional", key]), name,
    csharpProjection: Object.freeze({ ...projection, arguments: Object.freeze([projection.arguments[0]]) as readonly [TargetTypeRef] }),
    csharpRequirementDependencies: Object.freeze(storage === undefined ? [projection.arguments[0]] : [projection.arguments[0], storage]),
    csharpConstraints: Object.freeze({ kind: "resolved", constraints }) });
}

export function getCsharpOptionalProjection(type: TargetTypeRef | undefined): CsharpOptionalProjectedType | undefined {
  return type?.kind === "type-parameter" && type.csharpProjection !== undefined && type.csharpConstraints?.kind === "resolved"
    ? { ...type, csharpProjection: type.csharpProjection, csharpConstraints: type.csharpConstraints } : undefined;
}

export function csharpOptionalStorageProjection(element: TargetTypeRef, definitions: CsharpOptionalStorageDefinitions): CsharpOptionalProjectedType {
  return csharpOptionalProjectedType({ kind: "optional", part: "storage", arguments: [element], definitions });
}

export function getCsharpGenericOptionalParts(type: TargetTypeRef | undefined):
  { readonly element: TargetTypeRef; readonly operations: CsharpOptionalProjectedType } | undefined {
  const projection = getCsharpOptionalProjection(type)?.csharpProjection;
  return projection?.part === "storage" ? { element: projection.arguments[0],
    operations: csharpOptionalProjectedType({ ...projection, part: "operations" }) } : undefined;
}
