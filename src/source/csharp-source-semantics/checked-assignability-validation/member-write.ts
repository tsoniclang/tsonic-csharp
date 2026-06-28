import type {
  ExtensionEvidence,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import type {
  CsharpObservedTargetAssignabilityFact,
  CsharpTargetMemberOperationFact,
} from "../../csharp-facts.js";
import {
  csharpTargetOperationFactKey,
} from "../../csharp-facts.js";
import {
  getNodeField,
} from "../ast-utils.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  asNode,
  subjectIdentity,
} from "./subjects.js";

export function validateObservedAssignmentTargetFact(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.validatePostCheckAssignability">,
): void {
  if (fact.relation !== "assignment") {
    return;
  }
  const expression = asNode(fact.expression);
  const assignmentTarget = getAssignmentTarget(expression, context);
  if (assignmentTarget === undefined) {
    return;
  }
  const operation = context.facts.get(assignmentTarget, csharpTargetOperationFactKey);
  if (operation?.kind !== "member") {
    return;
  }
  const invalidWriteReason = getInvalidTargetMemberWriteReason(operation);
  if (invalidWriteReason === undefined) {
    return;
  }
  context.diagnostics.append({
    ...csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_TARGET_MEMBER_WRITE_INVALID",
      9100134,
      invalidWriteReason.message,
    ),
    nodeOrSpan: assignmentTarget,
    evidence: invalidWriteReason.evidence,
    identity: `csharp-target-member-write:${subjectIdentity(assignmentTarget)}`,
  });
}

function getAssignmentTarget(
  expression: Node | undefined,
  context: ExtensionObservationContext<"target.validatePostCheckAssignability">,
): Node | undefined {
  if (expression === undefined) {
    return undefined;
  }
  return asNode(context.compiler?.ast.as.AsBinaryExpression(expression)?.Left) ??
    asNode(getNodeField(expression, "Left")) ??
    asNode(getNodeField(expression, "left"));
}

function getInvalidTargetMemberWriteReason(
  operation: CsharpTargetMemberOperationFact,
): { readonly message: string; readonly evidence: readonly ExtensionEvidence[] } | undefined {
  const member = operation.selectedMember;
  if (member === undefined) {
    return undefined;
  }
  if (member.kind === "event") {
    return {
      message: `C# target assignment cannot write event '${member.targetName}' because source event add/remove semantics are not modeled.`,
      evidence: [{
        message: "C# target mutability validation reason",
        details: "The left-hand side resolved to a provider-selected event. Events require explicit add/remove source semantics before a target write can be emitted.",
      }],
    };
  }
  if (
    (member.kind === "property" || member.kind === "field" || member.kind === "indexer") &&
    member.readonly === true
  ) {
    return {
      message: `C# target assignment cannot write readonly ${member.kind} '${member.targetName}'.`,
      evidence: [{
        message: "C# target mutability validation reason",
        details: "TSTS accepted the source assignment, but the finalized provider target member fact is readonly and cannot be emitted as a C# write.",
      }],
    };
  }
  return undefined;
}
