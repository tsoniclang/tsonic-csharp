import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import type { Node } from "@tsonic/tsts";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { csharpTypeProjection, getCsharpGenericOptionalParts, type CsharpProjectedType } from "../../target-model/types/projections.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";
import type { CsharpTypeProjectionInputs } from "./type-projection-inputs.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { createCsharpTypeProjectionRecords } from "../program/records/types/type-projections.js";
import type { CsharpOptionalLocalPlan } from "../storage/optional-locals.js";
import type { CsharpTypeProjectionNodeSource, CsharpTypeProjectionSource } from "./type-projection-source.js";

export function analyzeCsharpTypeProjections(
  source: CsharpTypeProjectionSource, evidence: CsharpTypeProjectionInputs,
  operations: Pick<CsharpTargetOperationClassifications, "selectedCall">,
  optionalLocals: Pick<CsharpOptionalLocalPlan, "removesProjection">,
): CsharpGenericProjectionIndex {
  if (evidence.source !== source || evidence.localTypes === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A requires the exact current body-component inputs for its declared source.");
  const byDeclaration = new Map<Node, Map<string, CsharpProjectedType>>();
  const outerByDeclaration = new Map<Node, Map<string, CsharpProjectedType>>();
  const record = (index: Map<Node, Map<string, CsharpProjectedType>>, owner: Node, projection: CsharpProjectedType): void => {
    let parameters = index.get(owner);
    if (parameters === undefined) { parameters = new Map(); index.set(owner, parameters); }
    parameters.set(projection.identity, projection);
  };
  const excluded = new Map<CsharpTypeProjectionNodeSource, boolean>();
  for (const occurrence of source.nodes) {
    const { node } = occurrence;
    const omitted = evidence.compileTimeMetadata.get(node) || occurrence.parent !== undefined && excluded.get(occurrence.parent) === true;
    excluded.set(occurrence, omitted);
    if (omitted) continue;
    const pending = occurrence.name || occurrence.declarationOnly ? [] : [
      ...evidence.localTypes.get(node).map(type => ({ type, local: true })),
      ...(operations.selectedCall.get(node)?.sourceTypeArguments ?? []).map(type => ({ type, local: false })),
    ];
    const visited = new Set<string>();
    for (let index = 0; index < pending.length; index += 1) {
      const { type, local } = pending[index]!;
      if (type === undefined) continue;
      const key = `${local ? "local" : "contract"}:${targetTypeRefKey(type)}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const projection = csharpTypeProjection(type);
      if (projection === undefined) {
        pending.push(...csharpTargetTypeComponents(type).map(type => ({ type, local })));
        continue;
      }
      if (local && optionalLocals.removesProjection(node, projection.identity)) continue;
      pending.push(...projection.csharpProjection.arguments.map(type => ({ type, local })));
      const optional = getCsharpGenericOptionalParts(projection);
      if (optional !== undefined) pending.push({ type: optional.operations, local });
      const free = csharpFreeTypeParameterIdentities(projection.csharpProjection.arguments);
      if (free.size === 0) continue;
      for (let scope = occurrence.scopes; scope !== undefined; scope = scope.parent) {
        if (scope.parameterIdentities.some(identity => free.has(identity))) {
          record(byDeclaration, scope.declaration, projection);
          break;
        }
        if ([...free].every(identity => scope.capturedParameterIdentities.includes(identity)))
          record(outerByDeclaration, scope.declaration, projection);
      }
    }
  }
  const sorted = (parameters: Map<string, CsharpProjectedType> | undefined): readonly CsharpProjectedType[] =>
    Object.freeze([...(parameters?.values() ?? [])].sort((left, right) => left.name.localeCompare(right.name)));
  const entries = [...new Set([...byDeclaration.keys(), ...outerByDeclaration.keys()])].map(declaration => Object.freeze({
    declaration, parameters: sorted(byDeclaration.get(declaration)), outerParameters: sorted(outerByDeclaration.get(declaration)),
  }));
  return createCsharpTypeProjectionRecords(entries);
}

export function csharpTypeProjectionIndexesEqual(left: CsharpGenericProjectionIndex, right: CsharpGenericProjectionIndex): boolean {
  return left.entries.length === right.entries.length && left.entries.every(entry => {
    const parameters = right.genericProjection.get(entry.declaration);
    const outer = right.outerGenericProjection.get(entry.declaration);
    return parameters.length === entry.parameters.length && parameters.every((parameter, index) => parameter.identity === entry.parameters[index]!.identity) &&
      outer.length === entry.outerParameters.length && outer.every((parameter, index) => parameter.identity === entry.outerParameters[index]!.identity);
  });
}
