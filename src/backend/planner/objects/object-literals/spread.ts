import type { CsharpPlanningContext } from "../../context.js";
import {
  AsSpreadAssignment,
} from "@tsonic/target-api/source";
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
  csharpObjectShapeMemberLookupFailureMessage,
  resolveCsharpObjectShapeMemberBySourceKey,
  getCsharpNullableElementTargetType,
  targetTypeRefEquals,
} from "../../../../target-model/types/index.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import {
  objectShapeStorageMemberName,
} from "../index.js";
import { objectShapeMethodStorageTargetType } from "../object-shape-storage.js";
import { csharpObjectShapeMethodDeclaration } from "../../../../target-model/types/method-values.js";
import { csharpObjectCaptureFields } from "../declarations/authored-methods.js";
import type {
  ExpressionPlanner,
} from "../../expressions/expression-planner-types.js";
import {
  getExpectedObjectShapeFact,
  objectShapeMemberTypesMatch,
} from "./support.js";
import type { CsharpPlannedObjectInitializer } from "../../expressions/planned-initializers.js";

export function planObjectShapeSpreadAssignments(
  spreadNode: Node,
  targetShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedObjectInitializer | undefined {
  const spread = AsSpreadAssignment(input.program.source.ast, spreadNode);
  const expression = spread?.Expression;
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires a source expression."));
    return undefined;
  }
  const sourceShape = getExpectedObjectShapeFact(expression, sourceFile, input);
  if (sourceShape === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Object literal spread requires finalized provider object-shape facts for the spread expression before C# emission."));
    return undefined;
  }
  const sharedImplementation = sourceShape.methodImplementation !== undefined &&
    sourceShape.methodImplementation.identity === targetShape.methodImplementation?.identity &&
    targetTypeRefEquals(sourceShape.targetType, targetShape.targetType);
  if (sourceShape.members.some(member => member.methodValueContract !== undefined &&
    !(sharedImplementation && csharpObjectShapeMethodDeclaration(sourceShape, member) !== undefined))) {
    const required = input.artifacts.requireObjectShapeCapability(undefined, sourceShape.targetType, sourceFile, "method-values", "object-shape");
    if (required.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, required.reason));
      return undefined;
    }
  }
  const sourceExpression = planExpression(expression, sourceFile, input, diagnostics);
  if (sourceExpression === undefined) {
    return undefined;
  }
  const fields: { readonly source: string; readonly target: string; readonly carrier: TargetTypeRef }[] = [];
  for (const sourceMember of sourceShape.members) {
    const targetMemberLookup = resolveCsharpObjectShapeMemberBySourceKey(
      targetShape,
      sourceMember.sourceKey,
      "finalized-object-spread-member",
    );
    if (targetMemberLookup.kind !== "resolved") {
      const message = targetMemberLookup.reason === "not-in-finalized-shape"
        ? `Object literal spread source member '${sourceMember.sourceName}' requires a finalized target object-shape member carrier before C# emission.`
        : csharpObjectShapeMemberLookupFailureMessage(targetMemberLookup, "Object literal spread target shape");
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, message));
      return undefined;
    }
    const targetMember = targetMemberLookup.member;
    if (sharedImplementation && targetMember.methodValueContract !== undefined &&
      csharpObjectShapeMethodDeclaration(targetShape, targetMember) === csharpObjectShapeMethodDeclaration(sourceShape, sourceMember)) continue;
    if (!objectShapeMemberTypesMatch(sourceMember, targetMember)) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Object literal spread member '${sourceMember.sourceName}' requires matching finalized source and target member carriers.`));
      return undefined;
    }
    const carrier = targetMember.memberKind !== "method" ? targetMember.type
      : objectShapeMethodStorageTargetType(targetShape, targetMember, input.artifacts.objectShapeMethodUsesReceiver(targetShape, targetMember));
    if (carrier === undefined) return undefined;
    fields.push({ source: objectShapeStorageMemberName(sourceShape, sourceMember), target: objectShapeStorageMemberName(targetShape, targetMember), carrier });
  }
  if (sharedImplementation) for (const field of csharpObjectCaptureFields(sourceShape, input)) {
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
