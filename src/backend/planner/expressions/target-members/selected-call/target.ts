import { csharpObjectShapeProjectionMethodName } from "../../../../../target-model/types/index.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { renderSelectedCsharpTargetMethodTypeArguments } from "../../selected-method-type-arguments.js";
import { sourceCallIsOptional, translateArrayCreationCall } from "./helpers.js";
import { translateCsharpSelectedReceiver } from "../../receivers.js";
import { translateSelectedTargetArguments } from "./arguments.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpArgument, CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpSelectedTargetCall, ResolvedSourceCallInfo } from "../../../../../analysis/operations/index.js";
import type { CsharpTargetMember, CsharpObjectShapeProjection } from "../../../../../target-model/types/index.js";
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
  if (
    selection.targetMember.csharpInvocation?.kind ===
      "ecmascript-protocol-dispatch"
  ) {
    return translateEcmascriptProtocolDispatch(
      node,
      source,
      sourceFile,
      input,
      selection.targetMember,
      arguments_,
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

function translateEcmascriptProtocolDispatch(
  node: Node,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  member: CsharpTargetMember,
  arguments_: readonly CsharpArgument[],
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const invocation = member.csharpInvocation;
  const protocolIndex = invocation?.kind === "ecmascript-protocol-dispatch"
    ? invocation.protocolTargetParameterIndex
    : -1;
  const declaringType = member.declaringType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(member.declaringType);
  const protocolType = member.parameters[protocolIndex]?.type;
  const resultType = member.returnType;
  const forwardedParameters = member.parameters.slice(protocolIndex + 1);
  const suppliedForwardedCount = arguments_.length - protocolIndex - 1;
  if (
    invocation?.kind !== "ecmascript-protocol-dispatch" ||
    member.static !== true ||
    protocolIndex !== 1 ||
    arguments_.length < 2 ||
    declaringType === undefined ||
    protocolType === undefined ||
    resultType === undefined ||
    suppliedForwardedCount < 0 ||
    suppliedForwardedCount > forwardedParameters.length ||
    forwardedParameters.slice(suppliedForwardedCount).some((parameter) =>
      parameter.optional !== true &&
      parameter.csharpOmittableOptionalArgument !== true
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected ECMAScript protocol dispatch does not contain one exact source-order receiver, protocol subject, forwarded argument list, and result carrier.",
    ));
    return undefined;
  }
  const selectedForwardedParameters = forwardedParameters.slice(
    0,
    suppliedForwardedCount,
  );
  const genericTypes = [
    protocolType,
    ...selectedForwardedParameters.map((parameter) => parameter.type),
    resultType,
  ].map(csharpTypeFromTargetTypeRef);
  if (genericTypes.some((type) => type === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected ECMAScript protocol dispatch contains an unrenderable protocol, argument, or result carrier.",
    ));
    return undefined;
  }
  const protocolName = "__tsonic_protocol";
  const inputName = "__tsonic_input";
  const forwardedNames = selectedForwardedParameters.map(
    (_parameter, index) => `__tsonic_protocolArgument${index}`,
  );
  const lambda = {
    kind: "LambdaExpression" as const,
    parameters: [protocolName, inputName, ...forwardedNames].map((name) => ({
      kind: "Parameter" as const,
      name,
    })),
    body: {
      kind: "InvocationExpression" as const,
      callee: {
        kind: "SimpleMemberAccessExpression" as const,
        receiver: { kind: "IdentifierName" as const, name: protocolName },
        name: invocation.protocolMemberName,
      },
      arguments: [inputName, ...forwardedNames].map((name) => ({
        kind: "Argument" as const,
        expression: { kind: "IdentifierName" as const, name },
      })),
    },
  };
  const invocationExpression = {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: declaringType,
      name: member.targetName,
      typeArguments: genericTypes as NonNullable<
        Extract<CsharpExpression, {
          readonly kind: "SimpleMemberAccessExpression";
        }>["typeArguments"]
      >,
    },
    arguments: [
      ...arguments_,
      { kind: "Argument", expression: lambda },
    ],
  } satisfies CsharpExpression;
  if (!sourceCallIsOptional(input, source)) {
    return invocationExpression;
  }
  const receiverType = csharpTypeFromTargetTypeRef(member.parameters[0]!.type);
  const optionalResult = input.types.classifications.resolveNode(
    node,
    sourceFile,
  );
  const optionalResultType = optionalResult === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(optionalResult);
  if (receiverType === undefined || optionalResultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Optional ECMAScript protocol dispatch requires exact receiver and lifted result target types.",
    ));
    return undefined;
  }
  const receiverName = `__tsonic_protocolReceiver_${Math.max(0, input.program.source.ast.pos(node))}_${Math.max(0, input.program.source.ast.end(node))}`;
  return {
    kind: "ConditionalExpression",
    condition: {
      kind: "IsPatternExpression",
      expression: arguments_[0]!.expression,
      type: receiverType,
      designation: receiverName,
    },
    whenTrue: {
      ...invocationExpression,
      arguments: [
        {
          kind: "Argument",
          expression: { kind: "IdentifierName", name: receiverName },
        },
        ...invocationExpression.arguments.slice(1),
      ],
    },
    whenFalse: {
      kind: "DefaultExpression",
      type: optionalResultType,
    },
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
    const targetType = input.types.classifications.resolveNode(subject, sourceFile);
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
