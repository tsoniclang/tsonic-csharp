import { csharpObjectShapeProjectionMethodName } from "../../../../../policy/types/index.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { renderSelectedCsharpTargetMethodTypeArguments } from "../../selected-method-type-arguments.js";
import { sourceCallIsOptional, translateArrayCreationCall } from "./helpers.js";
import { translateCsharpSelectedReceiver } from "../../receivers.js";
import { translateSelectedTargetArguments } from "./arguments.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpArgument, CsharpExpression } from "../../../../roslyn/syntax.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpSelectedTargetCall, ResolvedSourceCallInfo } from "../../../../../policy/members/index.js";
import type { CsharpTargetMember, CsharpObjectShapeProjection } from "../../../../../policy/types/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function translateSelectedTargetCall(
  node: Node,
  source: ResolvedSourceCallInfo,
  selection: CsharpSelectedTargetCall,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  if (
    selection.targetMember.kind !== "method" &&
    selection.targetMember.kind !== "operator"
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Checked call selected C# ${selection.targetMember.kind} '${selection.targetMember.id}', not an invocable method.`,
    ));
    return undefined;
  }
  const registeredArtifacts = registerSelectedCallArtifacts(
      node,
      source,
      selection.targetMember,
      sourceFile,
      input,
      diagnostics,
    );
  if (registeredArtifacts === undefined) {
    return undefined;
  }
  const arguments_ = translateSelectedTargetArguments(
    node,
    source,
    selection,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
  if (arguments_ === undefined) {
    return undefined;
  }
  if (selection.targetMember.csharpInvocation?.kind === "array-creation") {
    return translateArrayCreationCall(
      node,
      selection.targetMember,
      arguments_,
      diagnostics,
    );
  }
  if (
    selection.targetMember.csharpInvocation?.kind ===
      "object-shape-projection"
  ) {
    return translateObjectShapeProjectionCall(
      node,
      selection.targetMember,
      arguments_,
      registeredArtifacts.objectShapeProjection,
      diagnostics,
    );
  }
  const callee = translateSelectedTargetCallee(
    node,
    source,
    selection,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  return callee === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee,
        arguments: arguments_,
      };
}

function registerSelectedCallArtifacts(
  node: Node,
  source: ResolvedSourceCallInfo,
  member: CsharpTargetMember,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): { readonly objectShapeProjection?: CsharpObjectShapeProjection } | undefined {
  const requirements = member.csharpArtifactRequirements;
  if (requirements === undefined || requirements.length === 0) {
    return {};
  }
  let objectShapeProjection: CsharpObjectShapeProjection | undefined;
  for (const requirement of requirements) {
    const subject = requirement.source.kind === "receiver"
      ? source.sourceReceiver?.expression
      : source.sourceArguments[requirement.source.index]?.expression;
    const requirementName = requirement.kind === "object-shape-capability"
      ? requirement.capability
      : requirement.projection;
    if (subject === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Selected target call '${member.id}' requires exact '${requirementName}' source-value evidence.`,
      ));
      return undefined;
    }
    const targetType = input.types.resolveNode(subject, sourceFile);
    if (targetType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Selected target call '${member.id}' requires exact '${requirementName}' source-value type evidence.`,
      ));
      return undefined;
    }
    if (requirement.kind === "object-shape-capability") {
      const result = input.artifacts.requireObjectShapeCapability(
          subject,
          targetType,
          sourceFile,
          requirement.capability,
          requirement.rootKind,
        );
      if (result.kind === "rejected") {
        diagnostics.push(unsupportedNodeDiagnostic(subject, result.reason));
        return undefined;
      }
      continue;
    }
    if (member.returnType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        subject,
        `Selected target call '${member.id}' has no result type for its exact '${requirement.projection}' object projection.`,
      ));
      return undefined;
    }
    const result = input.artifacts.requireObjectShapeProjection(
      subject,
      targetType,
      sourceFile,
      requirement.projection,
      member.returnType,
      requirement.rootKind,
    );
    if (result.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(subject, result.reason));
      return undefined;
    }
    if (
      result.projection === undefined ||
      objectShapeProjection !== undefined
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        subject,
        `Selected target call '${member.id}' does not have one exact object-shape projection artifact.`,
      ));
      return undefined;
    }
    objectShapeProjection = result.projection;
  }
  return objectShapeProjection === undefined
    ? {}
    : { objectShapeProjection };
}

function translateObjectShapeProjectionCall(
  node: Node,
  member: CsharpTargetMember,
  arguments_: readonly CsharpArgument[],
  projection: CsharpObjectShapeProjection | undefined,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const invocation = member.csharpInvocation;
  if (
    invocation?.kind !== "object-shape-projection" ||
    projection === undefined ||
    projection.kind !== invocation.projection ||
    member.returnType === undefined ||
    invocation.targetParameterIndex !== 0 ||
    arguments_.length === 0
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected object-shape projection does not contain one exact receiver parameter and result type.",
    ));
    return undefined;
  }
  const receiver = arguments_[0]!.expression;
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: csharpObjectShapeProjectionMethodName(
        invocation.projection,
        member.returnType,
        projection.propertyOrder,
      ),
    },
    arguments: arguments_.slice(1),
  };
}
function translateSelectedTargetCallee(
  node: Node,
  source: ResolvedSourceCallInfo,
  selection: CsharpSelectedTargetCall,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const typeArguments = renderSelectedCsharpTargetMethodTypeArguments(
    selection,
    node,
    sourceFile,
    input,
    diagnostics,
  );
  if (typeArguments === undefined) {
    return undefined;
  }
  if (selection.receiver.kind === "instance") {
    const sourceReceiver = source.sourceReceiver;
    if (sourceReceiver === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Selected instance target call has no exact checker-selected receiver.",
      ));
      return undefined;
    }
    const receiver = translateCsharpSelectedReceiver(
      sourceReceiver,
      sourceFile,
      input,
      diagnostics,
      planExpression,
    );
    if (receiver === undefined) {
      return undefined;
    }
    return {
      kind: sourceCallIsOptional(input, source)
        ? "ConditionalAccessExpression"
        : "SimpleMemberAccessExpression",
      receiver,
      name: selection.targetMember.targetName,
      ...(typeArguments.length === 0 ? {} : { typeArguments }),
    };
  }
  const declaringType = selection.targetMember.declaringType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(selection.targetMember.declaringType);
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected static target call '${selection.targetMember.id}' has no renderable declaring type.`,
    ));
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: selection.targetMember.targetName,
    ...(typeArguments.length === 0 ? {} : { typeArguments }),
  };
}
