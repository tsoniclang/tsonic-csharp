import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpRuntimeUnionTargetTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { csharpAbsenceTargetType, csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms, getCsharpGenericOptionalParts } from "../../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpTypeofRuntimeKind } from "../../../target-model/types/runtime-kind.js";

export function sourceRefinementOnlyRemovesNullish(
  declaredType: Type,
  selectedType: Type,
  queries: SourceFileSemantics,
): boolean {
  const refinement = queries.types.refinement(declaredType, selectedType);
  if (refinement.kind !== "members" || refinement.types.length === 0 ||
    refinement.types.some(type => queries.types.isNullish(type))) return false;
  const declaredMembers = queries.types.unionOrIntersectionTypes(declaredType);
  if (declaredMembers.some(type => type === undefined)) return false;
  const present = declaredMembers.filter((type): type is Type => type !== undefined && !queries.types.isNullish(type));
  return present.length < declaredMembers.length && present.length === refinement.types.length &&
    present.every(type => refinement.types.includes(type));
}

export function retainCsharpUnionObjectShapes(
  type: TargetTypeRef | undefined,
  resolveShape: (type: TargetTypeRef) => CsharpObjectShapeFact | undefined,
): TargetTypeRef | undefined {
  const arms = getCsharpRuntimeUnionArms(type);
  if (type === undefined || arms === undefined) return type;
  const shapes = arms.map(resolveShape);
  return shapes.every(shape => shape === undefined) ? type : {
    ...type,
    csharpRuntimeUnionObjectShapes: Object.freeze(shapes),
  } as CsharpRuntimeUnionTargetTypeRef;
}

export function selectCsharpAuthoredUnionRefinement(
  authored: TargetTypeRef,
  declaredType: Type,
  selectedType: Type,
  queries: SourceFileSemantics,
  resolveType: (type: Type) => TargetTypeRef | undefined,
  resolveShape: (type: TargetTypeRef) => CsharpObjectShapeFact | undefined,
): { readonly kind: "not-applicable" } | { readonly kind: "rejected" } |
  { readonly kind: "resolved"; readonly type: TargetTypeRef } {
  const nullableElement = getCsharpNullableElementTargetType(authored);
  const base = nullableElement ?? authored;
  const optional = getCsharpGenericOptionalParts(base);
  if ((nullableElement !== undefined || optional !== undefined) &&
    sourceRefinementOnlyRemovesNullish(declaredType, selectedType, queries)) {
    const type = nullableElement ?? optional?.element;
    if (type !== undefined) return { kind: "resolved", type };
  }
  const arms = getCsharpRuntimeUnionArms(base);
  if (arms === undefined) return { kind: "not-applicable" };
  const refinement = queries.types.refinement(declaredType, selectedType);
  const shapes = arms.map(resolveShape);
  if (refinement.kind === "exact") return { kind: "resolved", type: authored };
  if (refinement.kind !== "members") return { kind: "not-applicable" };
  const indexes = new Set<number>();
  let nullish = false;
  for (const member of refinement.types) {
    if (queries.types.isNullish(member)) {
      nullish = true;
      continue;
    }
    const properties = queries.types.propertyInfos(member);
    const declarations = properties.map(property => new Set([
      ...queries.declarations.symbolDeclarations(property.symbol),
      ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol)),
    ]));
    const matches = arms.flatMap((arm, index) => {
      const shape = shapes[index];
      if (shape === undefined) {
        const resolved = resolveType(member);
        if (resolved === undefined) return [];
        if (targetTypeRefEquals(arm, resolved)) return [index];
        const primitiveKind = queries.types.isNumberLike(member) ? "number"
          : queries.types.isBigIntLike(member) ? "bigint"
          : queries.types.isStringLike(member) ? "string"
          : queries.types.isBooleanLike(member) ? "boolean" : undefined;
        return arm.kind === "source-primitive" && primitiveKind !== undefined &&
          getCsharpTypeofRuntimeKind(arm) === primitiveKind ? [index] : [];
      }
      if (shape.members.length !== properties.length || declarations.some(nodes => nodes.size === 0)) return [];
      const matched = new Set<number>();
      for (const field of shape.members) {
        const candidates = declarations.flatMap((nodes, position) =>
          field.sourceDeclarations?.some(node => nodes.has(node)) === true ? [position] : []);
        if (candidates.length !== 1 || matched.has(candidates[0]!)) return [];
        matched.add(candidates[0]!);
      }
      return [index];
    });
    if (matches.length !== 1) return { kind: "rejected" };
    indexes.add(matches[0]!);
  }
  const selected = [...indexes].sort((left, right) => left - right);
  if (selected.length === 0 && nullish) return { kind: "resolved", type: csharpAbsenceTargetType() };
  const type = selected.length === arms.length ? base : selected.length === 1 ? arms[selected[0]!] :
    csharpRuntimeUnionTargetType(selected.map(index => arms[index]!), selected.map(index => shapes[index]));
  return type === undefined ? { kind: "rejected" } : {
    kind: "resolved", type: nullish ? csharpNullableTargetType(type) : type,
  };
}
