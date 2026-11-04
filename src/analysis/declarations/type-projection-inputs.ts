import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpCurrentNativeNodeInput, CsharpCurrentDeclaredBodyInput } from "../source-evidence/model.js";
import type { CsharpDeclaredReceiverBody } from "../source-evidence/types/resolution/declared-receiver-body.js";
import type { CsharpTypeProjectionSource } from "./type-projection-source.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import type { CsharpCallClassification } from "../../target-model/records/operations/operations.js";
import type { CsharpOptionalLocalPlan } from "../storage/optional-locals.js";
import type { CsharpObjectShapeAnalysis } from "../../target-model/records/objects/object-shapes.js";
import { csharpTypeProjectionVectorsEqual } from "../../target-model/types/projections.js";
import { analyzeCsharpTypeProjections } from "./type-projections.js";

export interface CsharpTypeProjectionInputs {
  readonly source: CsharpTypeProjectionSource;
  readonly compileTimeMetadata: { get(node: Node): boolean };
  readonly localTypes: { get(node: Node): readonly (TargetTypeRef | undefined)[] };
  readonly receivers: readonly { readonly node: Node; readonly body: CsharpDeclaredReceiverBody }[];
}

export interface CsharpTypeProjectionOperations {
  readonly selectedCall: { get(node: Node): Pick<CsharpCallClassification, "sourceTypeArguments"> | undefined };
}

export function formCsharpTypeProjectionInputs(
  source: CsharpTypeProjectionSource,
  evidence: Pick<CsharpSourceEvidenceIndex,
    "compileTimeMetadata" | "nodeTargetType" | "storageTargetType" | "bindingProjection">,
  inputs: readonly CsharpCurrentNativeNodeInput[],
  declaredInputs: readonly CsharpCurrentDeclaredBodyInput[],
): CsharpTypeProjectionInputs {
  const bodies = new Map<Node | undefined, { readonly source: CsharpCurrentNativeNodeInput["source"]; readonly body: CsharpDeclaredReceiverBody }>();
  for (const input of inputs) if (input.declaredReceiverBody !== undefined) bodies.set(input.source.node,
    Object.freeze({ source: input.source, body: input.declaredReceiverBody }));
  const callables = new Map<Node | undefined, Extract<CsharpCurrentDeclaredBodyInput, { readonly kind: "callable" }>>();
  const components = new Map<Node | undefined, Extract<CsharpCurrentDeclaredBodyInput, { readonly kind: "node" | "structural" | "project-self" }>>();
  for (const input of declaredInputs) {
    if (input.source.node === undefined || input.source.root.node !== input.source.node) return failTargetAnalysisInvariant("tsonic-csharp",
      "A body contribution requires its exact declared query occurrence.", input.source.node);
    if (input.kind === "receiver") {
      const previous = bodies.get(input.source.node);
      if (previous !== undefined && (previous.source !== input.source || previous.body !== input.body)) {
        return failTargetAnalysisInvariant("tsonic-csharp", "A body has one declared receiver contribution.", input.source.node);
      }
      bodies.set(input.source.node, input);
    } else if (input.kind === "callable") {
      if (callables.has(input.source.node) || input.body.source !== input.source) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body has one exact declared callable contribution.", input.source.node);
      callables.set(input.source.node, input);
    } else {
      if (components.has(input.source.node) || input.body.source !== input.source) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body has one exact declared node contribution.", input.source.node);
      components.set(input.source.node, input);
    }
  }
  const metadata = new Set<Node>();
  const types = new Map<Node, readonly (TargetTypeRef | undefined)[]>();
  const receivers: { readonly node: Node; readonly body: CsharpDeclaredReceiverBody }[] = [];
  for (const occurrence of source.nodes) {
    const { node } = occurrence;
    if (evidence.compileTimeMetadata.get(node)) metadata.add(node);
    const input = bodies.get(node);
    const body = input?.body;
    if (body !== undefined && input !== undefined) {
      const root = input.source.root;
      if (root.kind !== "node" || root.declaredReceiver?.source !== body.source ||
        body.source.context !== occurrence.receiverContext || body.self !== occurrence.declaredReceiver?.self) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "A projection root requires its exact declared receiver and body occurrence.", node);
      }
      types.set(node, body.components);
      receivers.push(Object.freeze({ node, body }));
    } else {
      types.set(node, components.get(node)?.body.components ?? callables.get(node)?.body.components ?? Object.freeze([
        evidence.nodeTargetType.get(node), evidence.storageTargetType.get(node), evidence.bindingProjection.get(node)?.storageCarrier]));
    }
  }
  return Object.freeze({ source, receivers: Object.freeze(receivers),
    compileTimeMetadata: Object.freeze({ get: (node: Node) => metadata.has(node) }),
    localTypes: Object.freeze({ get(node: Node) {
      const selected = types.get(node);
      if (selected === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A projection requires its original captured body roots.", node);
      return selected;
    } }),
  });
}

export function requireCsharpDeclaredReceiverProjectionCompletion(
  inputs: CsharpTypeProjectionInputs,
  expected: CsharpGenericProjectionIndex,
  operations: CsharpTypeProjectionOperations,
  optionalLocals: Pick<CsharpOptionalLocalPlan, "removesProjection">,
  shapes: Pick<CsharpObjectShapeAnalysis, "resolveNode">,
): void {
  if (inputs.receivers.length === 0) return;
  const finalTypes = new Map<Node, readonly TargetTypeRef[]>();
  for (const { node, body } of inputs.receivers) {
    const shape = shapes.resolveNode(body.self.declaration);
    if (shape === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A declared receiver requires its final physical shape for the contribution check.", node);
    finalTypes.set(node, Object.freeze([shape.targetType]));
  }
  const actual = analyzeCsharpTypeProjections(inputs.source, Object.freeze({ ...inputs,
    localTypes: Object.freeze({ get: (node: Node) => finalTypes.get(node) ?? inputs.localTypes.get(node) }),
  }), operations, optionalLocals);
  const changed = expected.entries.find(entry =>
    !csharpTypeProjectionVectorsEqual(entry.parameters, actual.genericProjection.get(entry.declaration)) ||
    !csharpTypeProjectionVectorsEqual(entry.outerParameters, actual.outerGenericProjection.get(entry.declaration))) ??
    actual.entries.find(entry => !expected.entries.some(original => original.declaration === entry.declaration));
  if (actual.entries.length !== expected.entries.length || changed !== undefined) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A declared receiver's self contributions differ from its final physical target; a second A answer is forbidden.",
      changed?.declaration ?? inputs.receivers[0]!.body.source.context.member);
  }
}
