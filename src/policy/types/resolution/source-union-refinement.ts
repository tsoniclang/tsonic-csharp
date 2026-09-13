import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpRuntimeUnionTargetTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

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
): { readonly kind: "not-applicable" } | { readonly kind: "rejected" } |
  { readonly kind: "resolved"; readonly type: TargetTypeRef } {
  const base = getCsharpNullableElementTargetType(authored) ?? authored;
  const arms = getCsharpRuntimeUnionArms(base);
  const shapes = (base as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionObjectShapes;
  if (arms === undefined || shapes === undefined) return { kind: "not-applicable" };
  const refinement = queries.types.refinement(declaredType, selectedType);
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
        return resolved !== undefined && targetTypeRefEquals(arm, resolved) ? [index] : [];
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
  const type = selected.length === arms.length ? base : selected.length === 1 ? arms[selected[0]!] :
    csharpRuntimeUnionTargetType(selected.map(index => arms[index]!), selected.map(index => shapes[index]));
  return type === undefined ? { kind: "rejected" } : {
    kind: "resolved", type: nullish ? csharpNullableTargetType(type) : type,
  };
}
