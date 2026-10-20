import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { csharpTypeProjection } from "../../target-model/types/projections.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeParameterConstraintResolution } from "../../target-model/types/generic-constraints.js";
import { snapshotCsharpTargetTypes } from "../../target-model/types/snapshot.js";

import type { CsharpTypeParameterEnvironment, CsharpTypeParameterSourceEvidence } from "../../target-model/records/type-parameter-constraints.js";
type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
export function createCsharpTypeParameterEnvironment(
  ast: AstReader,
  resolve: (declaration: Node, parameter: TypeParameter, source?: CsharpTypeParameterSourceEvidence) =>
    CsharpTypeParameterConstraintResolution | undefined,
): CsharpTypeParameterEnvironment {
  const cache = new Map<string, CsharpTypeParameterConstraintResolution>();
  const active = new Set<string>();
  return (parameter, source) => {
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
    let resolution: CsharpTypeParameterConstraintResolution | undefined;
    try {
      resolution = resolve(declaration!, parameter, source);
    } finally {
      active.delete(parameter.identity);
    }
    if (resolution === undefined) return Object.freeze({ kind: "unsupported",
      reason: `Generic binder '${parameter.name}' has no sealed native constraint evidence.` });
    const finalized = snapshotCsharpTargetTypes([{ ...parameter, csharpConstraints: resolution }])[0]!;
    if (finalized.kind !== "type-parameter" || finalized.csharpConstraints === undefined) {
      failTargetAnalysisInvariant("tsonic-csharp", "A native generic parameter requires finalized constraint evidence.");
    }
    const immutable = finalized.csharpConstraints;
    cache.set(parameter.identity, immutable);
    return immutable;
  };
}
