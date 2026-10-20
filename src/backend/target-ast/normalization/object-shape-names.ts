import type { CsharpCompilationUnit } from "../syntax/index.js";
import { transformCsharpTargetAst } from "./transformation.js";
import type { CsharpObjectShapeDisplayName } from "../../../target-model/records/object-shape-names.js";

export function applyCsharpObjectShapeDisplayNames(
  units: readonly CsharpCompilationUnit[],
  selections: readonly CsharpObjectShapeDisplayName[],
): readonly CsharpCompilationUnit[] {
  const byIdentity = new Map(selections.map(selection => [selection.identity, selection]));
  return units.map(unit => transformCsharpTargetAst(unit, record => {
    if (record.kind !== "IdentifierName" && record.kind !== "ClassDeclaration" &&
      record.kind !== "StructDeclaration" && record.kind !== "InterfaceDeclaration") return record;
    if (typeof record.objectShapeIdentity !== "string") return record;
    const selected = byIdentity.get(record.objectShapeIdentity);
    return selected === undefined || selected.canonicalName !== record.name
      ? record : { ...record, name: selected.displayName };
  }));
}

