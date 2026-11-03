import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpRuntimeUnionTargetTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpAbsenceTargetType, csharpCarrierAdmitsSourceAbsence, csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpTypeDefinitions } from "../../../../target-model/types/source-union-definitions.js";

export function sourceRefinementOnlyRemovesNullish(
  declaredType: Type,
  selectedType: Type,
  queries: SourceFileSemantics,
): boolean {
  const refinement = queries.types.refinement(declaredType, selectedType);
  return refinementOnlyRemovesNullish(declaredType, refinement, queries);
}

function refinementOnlyRemovesNullish(
  declaredType: Type,
  refinement: ReturnType<SourceFileSemantics["types"]["refinement"]>,
  queries: SourceFileSemantics,
): boolean {
  if (refinement.kind !== "members" || refinement.types.length === 0 ||
    refinement.types.some(type => queries.types.isNullish(type))) return false;
  const declaredMembers = queries.types.unionOrIntersectionTypes(declaredType);
  if (declaredMembers.some(type => type === undefined)) return false;
  const present = declaredMembers.filter((type): type is Type => type !== undefined && !queries.types.isNullish(type));
  return present.length < declaredMembers.length && present.length === refinement.types.length &&
    present.every(type => refinement.types.includes(type));
}

export interface CsharpAuthoredUnionRefinementEvidence {
  readonly kind: "exact" | "members" | "not-applicable";
  readonly onlyRemovesNullish: boolean;
  readonly members: readonly {
    readonly sourceType: Type;
    readonly nullish: boolean;
    readonly voidLike: boolean;
    readonly declarations: readonly ReadonlySet<Node>[];
  }[];
}

export function formCsharpAuthoredUnionRefinement(
  declaredType: Type,
  selectedType: Type,
  queries: SourceFileSemantics,
): CsharpAuthoredUnionRefinementEvidence {
  const refinement = queries.types.refinement(declaredType, selectedType);
  return Object.freeze({
    kind: refinement.kind === "exact" ? "exact" : refinement.kind === "members" ? "members" : "not-applicable",
    onlyRemovesNullish: refinementOnlyRemovesNullish(declaredType, refinement, queries),
    members: Object.freeze(refinement.kind !== "members" ? [] : refinement.types.map(sourceType => Object.freeze({
      sourceType,
      nullish: queries.types.isNullish(sourceType),
      voidLike: queries.types.isVoidLike(sourceType),
      declarations: Object.freeze(queries.types.propertyInfos(sourceType).map(property => new Set([
        ...queries.declarations.symbolDeclarations(property.symbol),
        ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol)),
      ]))),
    }))),
  });
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
  definitions?: CsharpTypeDefinitions,
): { readonly kind: "not-applicable" } | { readonly kind: "rejected" } |
  { readonly kind: "resolved"; readonly type: TargetTypeRef } {
  return completeCsharpAuthoredUnionRefinement(authored,
    formCsharpAuthoredUnionRefinement(declaredType, selectedType, queries), resolveType, resolveShape, definitions);
}

export function completeCsharpAuthoredUnionRefinement(
  authored: TargetTypeRef,
  evidence: CsharpAuthoredUnionRefinementEvidence,
  resolveType: (type: Type) => TargetTypeRef | undefined,
  resolveShape: (type: TargetTypeRef) => CsharpObjectShapeFact | undefined,
  definitions?: CsharpTypeDefinitions,
): { readonly kind: "not-applicable" } | { readonly kind: "rejected" } |
  { readonly kind: "resolved"; readonly type: TargetTypeRef } {
  const nullableElement = getCsharpNullableElementTargetType(authored);
  const base = nullableElement ?? authored;
  const optional = getCsharpGenericOptionalParts(base);
  if ((nullableElement !== undefined || optional !== undefined) &&
    evidence.onlyRemovesNullish) {
    const type = nullableElement ?? optional?.element;
    if (type !== undefined) {
      const presentArms = getCsharpRuntimeUnionArms(type, definitions);
      return { kind: "resolved", type: presentArms?.length === 1 ? presentArms[0]! : type };
    }
  }
  const arms = getCsharpRuntimeUnionArms(base, definitions);
  if (arms === undefined) return { kind: "not-applicable" };
  const shapes = arms.map(resolveShape);
  if (evidence.kind === "exact") return { kind: "resolved", type: authored };
  if (evidence.kind !== "members") return { kind: "not-applicable" };
  const indexes = new Set<number>();
  let nullish = false;
  for (const member of evidence.members) {
    if (member.nullish || csharpCarrierAdmitsSourceAbsence(authored) && member.voidLike) {
      nullish = true;
      continue;
    }
    const declarations = member.declarations;
    const resolved = resolveType(member.sourceType);
    const matches = arms.flatMap((arm, index) => {
      const shape = shapes[index];
      if (shape === undefined) {
        return resolved !== undefined && targetTypeRefEquals(arm, resolved) ? [index] : [];
      }
      if (shape.members.length !== declarations.length || declarations.some(nodes => nodes.size === 0)) return [];
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
