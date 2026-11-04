import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import type { Node } from "@tsonic/tsts";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { csharpTypeProjection, getCsharpGenericOptionalParts, csharpTypeProjectionVectorsEqual,
  type CsharpProjectedType } from "../../target-model/types/projections.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";
import type { CsharpTypeProjectionInputs, CsharpTypeProjectionOperations } from "./type-projection-inputs.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { createCsharpTypeProjectionRecords } from "../program/records/types/type-projections.js";
import type { CsharpOptionalLocalPlan } from "../storage/optional-locals.js";
import type { CsharpTypeProjectionNodeSource, CsharpTypeProjectionSource } from "./type-projection-source.js";

export function analyzeCsharpTypeProjections(
  source: CsharpTypeProjectionSource, evidence: CsharpTypeProjectionInputs,
  operations: CsharpTypeProjectionOperations,
  optionalLocals: Pick<CsharpOptionalLocalPlan, "removesProjection">,
): CsharpGenericProjectionIndex {
  const byDeclaration = new Map<Node, Map<string, CsharpProjectedType>>();
  const outerByDeclaration = new Map<Node, Map<string, CsharpProjectedType>>();
  const record = (index: Map<Node, Map<string, CsharpProjectedType>>, owner: Node, projection: CsharpProjectedType): void => {
    let parameters = index.get(owner);
    if (parameters === undefined) { parameters = new Map(); index.set(owner, parameters); }
    parameters.set(projection.identity, projection);
  };
  visitCsharpTypeProjectionContributions(source, evidence, operations, optionalLocals,
    (kind, declaration, projection) => record(kind === "own" ? byDeclaration : outerByDeclaration, declaration, projection));
  const sorted = (parameters: Map<string, CsharpProjectedType> | undefined): readonly CsharpProjectedType[] =>
    Object.freeze([...(parameters?.values() ?? [])].sort((left, right) => left.name.localeCompare(right.name)));
  const entries = [...new Set([...byDeclaration.keys(), ...outerByDeclaration.keys()])].map(declaration => Object.freeze({
    declaration, parameters: sorted(byDeclaration.get(declaration)), outerParameters: sorted(outerByDeclaration.get(declaration)),
  }));
  return createCsharpTypeProjectionRecords(entries);
}

export function requireCsharpTypeProjectionIndependence(
  source: CsharpTypeProjectionSource,
  evidence: CsharpTypeProjectionInputs,
  operations: CsharpTypeProjectionOperations,
  optionalLocals: Pick<CsharpOptionalLocalPlan, "removesProjection">,
  expected: CsharpGenericProjectionIndex,
  localTypes: CsharpTypeProjectionInputs["localTypes"],
): void {
  visitCsharpTypeProjectionContributions(source, Object.freeze({ ...evidence, localTypes }), operations, optionalLocals,
    (kind, declaration, projection, node) => {
      const parameters = kind === "own" ? expected.genericProjection.get(declaration) : expected.outerGenericProjection.get(declaration);
      if (!parameters.some(existing => csharpTypeProjectionVectorsEqual([projection], [existing]))) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "A callable's generic projection depends on its recursive body dependency; no replay or fixpoint is allowed.", node);
      }
    });
}

function visitCsharpTypeProjectionContributions(
  source: CsharpTypeProjectionSource,
  evidence: CsharpTypeProjectionInputs,
  operations: CsharpTypeProjectionOperations,
  optionalLocals: Pick<CsharpOptionalLocalPlan, "removesProjection">,
  record: (kind: "own" | "outer", declaration: Node, projection: CsharpProjectedType, node: Node) => void,
): void {
  if (evidence.source !== source || evidence.localTypes === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A requires the exact current body-component inputs for its declared source.");
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
          record("own", scope.declaration, projection, node);
          break;
        }
        if ([...free].every(identity => scope.capturedParameterIdentities.includes(identity)))
          record("outer", scope.declaration, projection, node);
      }
    }
  }
}

export function csharpTypeProjectionIndexesEqual(left: CsharpGenericProjectionIndex, right: CsharpGenericProjectionIndex): boolean {
  return left.entries.length === right.entries.length && left.entries.every(entry =>
    csharpTypeProjectionVectorsEqual(entry.parameters, right.genericProjection.get(entry.declaration)) &&
    csharpTypeProjectionVectorsEqual(entry.outerParameters, right.outerGenericProjection.get(entry.declaration)));
}
