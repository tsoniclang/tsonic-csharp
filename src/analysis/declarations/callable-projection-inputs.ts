import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpGenericProjectionIndex, CsharpPublishedCallableProjections } from "../../target-model/records/types/type-projections.js";
import { csharpTypeProjectionVectorsEqual } from "../../target-model/types/projections.js";
import { createCsharpTypeProjectionRecords } from "../program/records/types/type-projections.js";
import type { CsharpOptionalLocalPlan } from "../storage/optional-locals.js";
import type { CsharpTypeProjectionInputs } from "./type-projection-inputs.js";
import type { CsharpTypeProjectionSource, CsharpTypeProjectionOwnerSource } from "./type-projection-source.js";
import { analyzeCsharpTypeProjections } from "./type-projections.js";
import type { CsharpDeclaredCallableBody } from "../source-evidence/types/resolution/declared-callable-body.js";

export interface CsharpCallableProjectionInput {
  readonly source: CsharpTypeProjectionOwnerSource;
  readonly body: CsharpTypeProjectionSource;
  readonly evidence: CsharpTypeProjectionInputs;
  readonly operations: Pick<CsharpTargetOperationClassifications, "selectedCall">;
  readonly optionalLocals: Pick<CsharpOptionalLocalPlan, "removesProjection">;
  readonly declared: CsharpDeclaredCallableBody | undefined;
}

export function formCsharpCallableProjectionInput(
  source: CsharpTypeProjectionSource,
  owner: CsharpTypeProjectionOwnerSource,
  evidence: CsharpTypeProjectionInputs,
  operations: CsharpCallableProjectionInput["operations"],
  optionalLocals: CsharpCallableProjectionInput["optionalLocals"],
  declaredBodies: readonly CsharpDeclaredCallableBody[],
): CsharpCallableProjectionInput {
  if (evidence.source !== source || source.ownerFor(owner.declaration) !== owner ||
    owner.nodes[0]?.node !== owner.declaration || Array.from(owner.nodes).some(node => node === undefined)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A callable body requires its exact declared source and ordered component inputs.", owner.declaration);
  }
  let omitted = false;
  for (let parent = owner.nodes[0]!.parent; parent !== undefined; parent = parent.parent) {
    if (evidence.compileTimeMetadata.get(parent.node)) { omitted = true; break; }
  }
  const body: CsharpTypeProjectionSource = Object.freeze({ ...source, nodes: owner.nodes });
  const nodes = new Set(owner.nodes.map(occurrence => occurrence.node));
  const bodyInputs = new Map<Node | undefined, CsharpDeclaredCallableBody>();
  for (const input of declaredBodies) {
    if (input.source.node !== input.source.root.node || bodyInputs.has(input.source.node)) return failTargetAnalysisInvariant("tsonic-csharp",
      "A body component vector requires every exact declaration occurrence at most once.", owner.declaration);
    bodyInputs.set(input.source.node, input);
  }
  const declared = bodyInputs.get(owner.declaration);
  const inputs: CsharpTypeProjectionInputs = Object.freeze({ ...evidence, source: body,
    receivers: Object.freeze(evidence.receivers.filter(receiver => nodes.has(receiver.node))),
    compileTimeMetadata: Object.freeze({ get: (node: Node) =>
      node === owner.declaration && omitted || evidence.compileTimeMetadata.get(node) }),
    localTypes: Object.freeze({ get(node: Node) {
      const input = bodyInputs.get(node);
      return input?.kind === "callable" ? input.components : evidence.localTypes.get(node);
    } }),
  });
  return Object.freeze({ source: owner, body, evidence: inputs, operations, optionalLocals, declared });
}

export function analyzeCsharpCallableProjectionInput(input: CsharpCallableProjectionInput): CsharpPublishedCallableProjections {
  if (input.body.nodes !== input.source.nodes || input.evidence.source !== input.body) return failTargetAnalysisInvariant("tsonic-csharp",
    "A callable projection completion requires its exact body-component input.", input.source.declaration);
  const index = analyzeCsharpTypeProjections(input.body, input.evidence, input.operations, input.optionalLocals);
  const declaration = input.source.declaration;
  return Object.freeze({ kind: "source", source: input.source, declaration, index,
    projections: index.genericProjection.get(declaration) });
}

export function joinCsharpCallableProjectionInputs(
  source: CsharpTypeProjectionSource,
  inputs: readonly CsharpPublishedCallableProjections[],
  order: readonly Node[],
): CsharpGenericProjectionIndex {
  if (inputs.length !== source.owners.length || Array.from(inputs).some((input, index) => input === undefined ||
    input.source !== source.owners[index] || input.declaration !== source.owners[index]!.declaration ||
    input.projections !== input.index.genericProjection.get(input.declaration))) return failTargetAnalysisInvariant("tsonic-csharp",
      "A project projection index requires every exact callable body publication once in source order.");
  const byDeclaration = new Map(inputs.map(input => [input.declaration, input]));
  const nonempty = inputs.filter(input => input.projections.length !== 0 ||
    input.index.outerGenericProjection.get(input.declaration).length !== 0);
  if (order.length !== nonempty.length || new Set(order).size !== order.length ||
    Array.from(order).some(declaration => declaration === undefined || !byDeclaration.has(declaration))) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A project projection index requires its checked original declaration order.");
  }
  return createCsharpTypeProjectionRecords(order.map(declaration => {
    const input = byDeclaration.get(declaration)!;
    const parameters = input.projections;
    const outerParameters = input.index.outerGenericProjection.get(input.declaration);
    if (parameters.length === 0 && outerParameters.length === 0) return failTargetAnalysisInvariant("tsonic-csharp",
      "A checked declaration order cannot invent a harvested projection entry.", declaration);
    return Object.freeze({ declaration, parameters, outerParameters });
  }));
}

export function requireCsharpCallableProjectionCompletion(
  source: CsharpTypeProjectionSource,
  expected: readonly CsharpPublishedCallableProjections[],
  evidence: CsharpTypeProjectionInputs,
  operations: CsharpCallableProjectionInput["operations"],
  optionalLocals: CsharpCallableProjectionInput["optionalLocals"],
): readonly Node[] {
  const actual = analyzeCsharpTypeProjections(source, evidence, operations, optionalLocals);
  const changed = expected.find(entry =>
    !csharpTypeProjectionVectorsEqual(entry.projections, actual.genericProjection.get(entry.declaration)) ||
    !csharpTypeProjectionVectorsEqual(entry.index.outerGenericProjection.get(entry.declaration),
      actual.outerGenericProjection.get(entry.declaration))) ??
    actual.entries.find(entry => !expected.some(original => original.declaration === entry.declaration));
  const nonempty = expected.filter(entry => entry.projections.length !== 0 ||
    entry.index.outerGenericProjection.get(entry.declaration).length !== 0);
  if (actual.entries.length !== nonempty.length || changed !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A callable body's published A differs from the unchanged whole-source harvest; a second answer is forbidden.", changed?.declaration);
  return Object.freeze(actual.entries.map(entry => entry.declaration));
}
