import type { CsharpPlanningContext } from "../../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import {
  getCsharpNullableElementTargetType,
  targetTypeRefEquals,
} from "../../../../target-model/types/index.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { failTargetPlannerInvariant } from "@tsonic/target-api/artifacts";
import {
  objectShapeStorageMemberName,
} from "../index.js";
import { objectShapeMethodStorageTargetType } from "../object-shape-storage.js";
import { csharpObjectCaptureFields } from "../declarations/authored-methods.js";
import type {
  ExpressionPlanner,
} from "../../expressions/expression-planner-types.js";
import type { CsharpPlannedObjectInitializer } from "../../expressions/planned-initializers.js";

export function planObjectShapeSpreadAssignments(
  spreadNode: Node,
  targetShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedObjectInitializer | undefined {
  const spread = input.program.records.objectShapeArtifact.spread(spreadNode);
  if (spread === undefined || !targetTypeRefEquals(spread.target.targetType, targetShape.targetType)) failTargetPlannerInvariant("tsonic-csharp",
    "An object literal spread requires its exact admitted source-to-target member correspondence.", spreadNode);
  const sourceShape = spread.source;
  const sourceExpression = planExpression(spread.expression, sourceFile, input, diagnostics);
  if (sourceExpression === undefined) {
    return undefined;
  }
  const fields: { readonly source: string; readonly target: string; readonly carrier: TargetTypeRef }[] = [];
  for (const { source: sourceMember, target: targetMember } of spread.memberBindings) {
    const carrier = targetMember.memberKind !== "method" ? targetMember.type
      : objectShapeMethodStorageTargetType(spread.target, targetMember, input.artifacts.objectShapeMethodUsesReceiver(spread.target, targetMember));
    if (carrier === undefined) return undefined;
    fields.push({ source: objectShapeStorageMemberName(sourceShape, sourceMember), target: objectShapeStorageMemberName(spread.target, targetMember), carrier });
  }
  if (spread.sharedImplementation) for (const field of csharpObjectCaptureFields(sourceShape, input)) {
    fields.push({ source: field.name, target: field.name, carrier: field.type });
  }
  const carrier = sourceExpression.completion.kind === "value" ? sourceExpression.completion.carrier : undefined;
  const present = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier);
  return { value: sourceExpression, presence: present === undefined ? { kind: "required" } : { kind: "optional", carrier: present },
    assignments: receiver => fields.map(field => ({
      kind: "AssignmentExpression",
      name: field.target,
      carrier: field.carrier,
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver,
        name: field.source,
      },
    })) };
}
