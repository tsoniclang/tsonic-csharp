import type { CsharpCompilationUnit } from "../syntax/index.js";
import { transformCsharpTargetAst } from "./transformation.js";
import type { CsharpObjectShapeDisplayName } from "../../../target-model/records/objects/object-shape-names.js";

export function applyCsharpObjectShapeDisplayNames(
  units: readonly CsharpCompilationUnit[],
  selections: readonly CsharpObjectShapeDisplayName[],
): readonly CsharpCompilationUnit[] {
  const byIdentity = new Map(selections.map(selection => [selection.identity, selection]));
  return units.map(unit => transformCsharpTargetAst(unit, (record, ancestors) => {
    const constructor = record.kind === "ConstructorDeclaration" || record.kind === "StaticConstructorDeclaration";
    if (!constructor && record.kind !== "IdentifierName" && record.kind !== "ClassDeclaration" &&
      record.kind !== "StructDeclaration" && record.kind !== "InterfaceDeclaration") return record;
    const owner = constructor ? ancestors[ancestors.length - 1] : record;
    if (owner === undefined || constructor && owner.kind !== "ClassDeclaration" && owner.kind !== "StructDeclaration" ||
      typeof owner.objectShapeIdentity !== "string") return record;
    const selected = byIdentity.get(owner.objectShapeIdentity);
    return selected === undefined || selected.canonicalName !== record.name || constructor && selected.canonicalName !== owner.name
      ? record : { ...record, name: selected.displayName };
  }));
}

