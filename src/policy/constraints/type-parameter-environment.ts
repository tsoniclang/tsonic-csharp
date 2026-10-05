import type { AstReader, Node } from "@tsonic/tsts";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { csharpTypeProjection } from "../../target-model/types/projections.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeParameterConstraintResolution } from "../../target-model/declarations/generic-constraints.js";
import type { CsharpTypeParameterConstraintResolver } from "../../target-model/types/generic-references.js";
import { snapshotCsharpTargetTypes } from "../../target-model/types/snapshot.js";

export function createCsharpTypeParameterEnvironment(
  ast: AstReader,
  resolve: (declaration: Node, parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>) =>
    CsharpTypeParameterConstraintResolution | undefined,
): CsharpTypeParameterConstraintResolver {
  const cache = new Map<string, CsharpTypeParameterConstraintResolution>();
  const active = new Set<string>();
  return parameter => {
    const declaration = parameter.csharpDeclaration;
    const selected = declaration === undefined ? undefined : csharpSourceTypeParameter(declaration, ast);
    if (declaration !== undefined && selected?.identity !== parameter.identity) return Object.freeze({ kind: "unsupported",
      reason: `Generic binder '${parameter.name}' has inconsistent source declaration identity.` });
    if (parameter.csharpConstraints !== undefined) return parameter.csharpConstraints;
    const projection = csharpTypeProjection(parameter);
    if (projection !== undefined) return Object.freeze({ kind: "resolved", constraints: projection.csharpProjectionConstraints });
    if (selected === undefined || selected.identity !== parameter.identity) return Object.freeze({ kind: "unsupported",
      reason: `Generic binder '${parameter.name}' has no exact source declaration or retained native constraints.` });
    const previous = cache.get(parameter.identity);
    if (previous !== undefined) return previous;
    if (active.has(parameter.identity)) return Object.freeze({ kind: "unsupported",
      reason: `Generic binder '${parameter.name}' constraint resolution reentered an unfinished native contract.` });
    active.add(parameter.identity);
    let resolution: CsharpTypeParameterConstraintResolution;
    try {
      resolution = resolve(declaration!, parameter) ?? { kind: "unsupported",
        reason: `Generic binder '${parameter.name}' has no sealed native constraint evidence.` };
    } finally {
      active.delete(parameter.identity);
    }
    const finalized = snapshotCsharpTargetTypes([{ ...parameter, csharpConstraints: resolution }])[0]!;
    if (finalized.kind !== "type-parameter" || finalized.csharpConstraints === undefined) {
      throw new TypeError("A native generic parameter requires finalized constraint evidence.");
    }
    const immutable = finalized.csharpConstraints;
    cache.set(parameter.identity, immutable);
    return immutable;
  };
}
