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
  if (
    selection.targetMember.csharpInvocation?.kind === "native-indexer-get" ||
    selection.targetMember.csharpInvocation?.kind === "native-indexer-set"
  ) {
    return translateNativeIndexerCall(
      node,
      source,
      sourceFile,
      input,
      selection.targetMember,
      arguments_,
      diagnostics,
      planExpression,
    );
  }
  if (
    selection.targetMember.csharpInvocation?.kind === "native-event-add" ||
    selection.targetMember.csharpInvocation?.kind === "native-event-remove"
  ) {
    return translateNativeEventSubscription(
      node,
      source,
      sourceFile,
      input,
      selection.targetMember,
      arguments_,
      diagnostics,
      planExpression,
    );
  }
  if (selection.targetMember.csharpInvocation?.kind === "native-operator") {
    return translateNativeOperatorCall(
      node,
      selection.targetMember,
      arguments_,
      diagnostics,
    );
  }
  if (
    selection.targetMember.csharpInvocation?.kind ===
      "static-member"
  ) {
    return translateStaticMemberCall(
      node,
      selection,
      arguments_,
      sourceFile,
      input,
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

function translateStaticMemberCall(
  node: Node,
  selection: CsharpSelectedTargetCall,
  arguments_: readonly CsharpArgument[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const member = selection.targetMember;
  const invocation = member.csharpInvocation;
  if (invocation?.kind !== "static-member") {
    return undefined;
  }
  const receiverTargetType = invocation.receiver.kind === "declaring-type"
    ? member.declaringType
    : selection.targetInvocationTypeArguments[invocation.receiver.index]
      ?.targetType;
  const receiverType = receiverTargetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(receiverTargetType);
  const expectedInvocationArity = invocation.receiver.kind ===
      "invocation-type-argument"
    ? 1
    : 0;
  if (
    receiverType === undefined ||
    selection.targetInvocationTypeArguments.length !== expectedInvocationArity ||
    (invocation.receiver.kind === "invocation-type-argument" &&
      invocation.receiver.index !== 0)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The selected static operation has no exact renderable receiver type.",
    ));
    return undefined;
  }
  const access: CsharpExpression = {
    kind: "SimpleMemberAccessExpression",
    receiver: receiverType,
    name: member.targetName,
  };
  if (invocation.operation === "call") {
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
    return {
      kind: "InvocationExpression",
      callee: typeArguments.length === 0
        ? access
        : {
            kind: "SimpleMemberAccessExpression",
            receiver: receiverType,
            name: member.targetName,
            typeArguments,
          },
      arguments: arguments_,
    };
  }
  if (invocation.operation === "property-get") {
    if (arguments_.length === 0 && invocation.valueParameterIndex === undefined) {
      return access;
    }
  } else {
    const valueIndex = invocation.valueParameterIndex;
    const value = valueIndex === undefined ? undefined : arguments_[valueIndex];
    if (
      arguments_.length === 1 &&
      valueIndex === 0 &&
      value !== undefined &&
      value.passing === undefined
    ) {
      return {
        kind: "AssignmentExpression",
        left: access,
        operatorToken: {
          kind: invocation.operation === "event-add"
            ? "PlusEqualsToken"
            : invocation.operation === "event-remove"
              ? "MinusEqualsToken"
              : "EqualsToken",
        },
        right: value.expression,
      };
    }
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    node,
    "The selected static operation arguments contradict its exact call/property/event contract.",
  ));
  return undefined;
}

function translateNativeOperatorCall(
  node: Node,
  member: CsharpTargetMember,
  arguments_: readonly CsharpArgument[],
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const invocation = member.csharpInvocation;
  if (invocation?.kind !== "native-operator") {
    return undefined;
  }
  const expectedArity = invocation.form === "prefix" ? 1 : 2;
  const indexes = new Set(invocation.operandParameterIndexes);
  if (
    invocation.operandParameterIndexes.length !== expectedArity ||
    indexes.size !== expectedArity ||
    arguments_.length !== member.parameters.length ||
    invocation.operandParameterIndexes.some((index) =>
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= arguments_.length ||
      arguments_[index]?.passing !== undefined
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The selected native C# operator relation does not cover one exact operand vector.",
    ));
    return undefined;
  }
  const operands = invocation.operandParameterIndexes.map((index) =>
    arguments_[index]!.expression);
  const expression: CsharpExpression | undefined = invocation.form === "prefix"
    ? nativePrefixOperatorExpression(invocation.operator, operands[0]!)
    : nativeBinaryOperatorExpression(
        invocation.operator,
        operands[0]!,
        operands[1]!,
      );
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `The selected native C# operator '${invocation.operator}' does not match its declared unary/binary form.`,
    ));
    return undefined;
  }
  return invocation.checked === true
    ? { kind: "CheckedExpression", expression }
    : expression;
}

function nativePrefixOperatorExpression(
  operator: Extract<
    NonNullable<CsharpTargetMember["csharpInvocation"]>,
    { readonly kind: "native-operator" }
  >["operator"],
  operand: CsharpExpression,
): CsharpExpression | undefined {
  const token = operator === "unary-plus"
    ? "PlusToken" as const
    : operator === "unary-negation"
      ? "MinusToken" as const
      : operator === "logical-not"
        ? "ExclamationToken" as const
        : operator === "ones-complement"
          ? "TildeToken" as const
          : undefined;
  return token === undefined
    ? undefined
    : { kind: "PrefixUnaryExpression", operatorToken: { kind: token }, operand };
}

function nativeBinaryOperatorExpression(
  operator: Extract<
    NonNullable<CsharpTargetMember["csharpInvocation"]>,
    { readonly kind: "native-operator" }
  >["operator"],
  left: CsharpExpression,
  right: CsharpExpression,
): CsharpExpression | undefined {
  const tokens = {
    addition: "PlusToken",
    subtraction: "MinusToken",
    multiplication: "AsteriskToken",
    division: "SlashToken",
    modulus: "PercentToken",
    "bitwise-and": "AmpersandToken",
    "bitwise-or": "BarToken",
    "exclusive-or": "CaretToken",
    "left-shift": "LessThanLessThanToken",
    "right-shift": "GreaterThanGreaterThanToken",
    "unsigned-right-shift": "GreaterThanGreaterThanGreaterThanToken",
    equality: "EqualsEqualsToken",
    inequality: "ExclamationEqualsToken",
    "less-than": "LessThanToken",
    "less-than-or-equal": "LessThanEqualsToken",
    "greater-than": "GreaterThanToken",
    "greater-than-or-equal": "GreaterThanEqualsToken",
  } as const;
  const token = tokens[operator as keyof typeof tokens];
  return token === undefined
    ? undefined
    : {
        kind: "BinaryExpression",
        left,
        operatorToken: { kind: token },
        right,
      };
}

function translateNativeEventSubscription(
  node: Node,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  member: CsharpTargetMember,
  arguments_: readonly CsharpArgument[],
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const invocation = member.csharpInvocation;
  if (
    (invocation?.kind !== "native-event-add" &&
      invocation?.kind !== "native-event-remove") ||
    sourceCallIsOptional(input, source) ||
    arguments_.length !== 1 ||
    invocation.handlerParameterIndex !== 0 ||
    arguments_[0]?.passing !== undefined
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A selected native C# event operation requires one exact non-optional handler argument.",
    ));
    return undefined;
  }
  const receiver = member.static === true
    ? member.declaringType === undefined
      ? undefined
      : csharpTypeFromTargetTypeRef(member.declaringType)
    : source.sourceReceiver === undefined
      ? undefined
      : translateCsharpSelectedReceiver(
          source.sourceReceiver,
          sourceFile,
          input,
          diagnostics,
          planExpression,
        );
  if (receiver === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The selected native C# event operation has no exact renderable instance or declaring-type receiver.",
    ));
    return undefined;
  }
  return {
    kind: "AssignmentExpression",
    left: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: member.targetName,
    },
    operatorToken: {
      kind: invocation.kind === "native-event-add"
        ? "PlusEqualsToken"
        : "MinusEqualsToken",
    },
    right: arguments_[0]!.expression,
  };
}

function translateNativeIndexerCall(
  node: Node,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  member: CsharpTargetMember,
  arguments_: readonly CsharpArgument[],
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const invocation = member.csharpInvocation;
  const sourceReceiver = source.sourceReceiver;
  if (
    (invocation?.kind !== "native-indexer-get" &&
      invocation?.kind !== "native-indexer-set") ||
    member.static === true ||
    sourceReceiver === undefined ||
    sourceCallIsOptional(input, source)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A selected native C# indexer call requires one non-optional instance receiver and an explicit indexer invocation relation.",
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
  const indexSet = new Set(invocation.indexParameterIndexes);
  const valueParameterIndex = invocation.kind === "native-indexer-set"
    ? invocation.valueParameterIndex
    : undefined;
  if (
    receiver === undefined ||
    invocation.indexParameterIndexes.length === 0 ||
    indexSet.size !== invocation.indexParameterIndexes.length ||
    invocation.indexParameterIndexes.some((index) =>
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= member.parameters.length ||
      arguments_[index] === undefined ||
      arguments_[index]!.passing !== undefined
    ) ||
    (valueParameterIndex !== undefined && (
      !Number.isSafeInteger(valueParameterIndex) ||
      valueParameterIndex < 0 ||
      valueParameterIndex >= member.parameters.length ||
      indexSet.has(valueParameterIndex) ||
      arguments_[valueParameterIndex] === undefined ||
      arguments_[valueParameterIndex]!.passing !== undefined
    )) ||
    arguments_.length !== invocation.indexParameterIndexes.length +
      (valueParameterIndex === undefined ? 0 : 1)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The selected native C# indexer relation does not cover one exact index argument vector and optional assigned value.",
    ));
    return undefined;
  }
  const indexer: CsharpExpression = {
    kind: "ElementAccessExpression",
    receiver,
    arguments: invocation.indexParameterIndexes.map((index) =>
      arguments_[index]!.expression),
  };
  return valueParameterIndex === undefined
    ? indexer
    : {
        kind: "AssignmentExpression",
        left: indexer,
        operatorToken: { kind: "EqualsToken" },
        right: arguments_[valueParameterIndex]!.expression,
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
    const assignmentSubject = requirement.projection === "assign"
      ? source.sourceArguments[requirement.assignmentSource.index]?.expression
      : undefined;
    const assignmentType = assignmentSubject === undefined
      ? undefined
      : input.types.classifications.resolveNode(assignmentSubject, sourceFile);
    if (requirement.projection === "assign" &&
      (assignmentSubject === undefined || assignmentType === undefined)) {
      diagnostics.push(unsupportedNodeDiagnostic(
        subject,
        `Selected target call '${member.id}' requires exact assignment-source value and type evidence.`,
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
      assignmentSubject === undefined || assignmentType === undefined
        ? undefined
        : { node: assignmentSubject, type: assignmentType },
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
        projection,
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
