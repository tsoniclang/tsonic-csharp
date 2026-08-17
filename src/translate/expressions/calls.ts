import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  sourceFileIdentity,
} from "@tsonic/target-api";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpTargetCall,
} from "../../policy/members/index.js";
import {
  selectCsharpSourceFlowCall,
} from "../../policy/operations/index.js";
import {
  selectCsharpCompatAnyCallOperation,
} from "../../policy/compat/index.js";
import type {
  CsharpSelectedCallArgument,
  CsharpSelectedTargetCall,
  CsharpProviderArgumentMapping,
  ResolvedSourceCallInfo,
} from "../../policy/members/index.js";
import type {
  CsharpTargetMember,
  CsharpObjectShapeProjection,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  csharpObjectShapeProjectionMethodName,
  csharpTargetParameterValueType,
  getCsharpDelegateSignature,
} from "../../policy/types/index.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../../backend/roslyn/syntax.js";
import {
  selectedPolicyDiagnostic,
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../../backend/planner/diagnostics.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../../backend/planner/expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";
import {
  translateCsharpCompatArgumentFactory,
  translateCsharpCompatInvocation,
  translateCsharpCompatValueFactory,
} from "./compat.js";
import {
  renderSelectedCsharpTargetMethodTypeArguments,
} from "./selected-method-type-arguments.js";
import {
  applyCsharpConversionSelection,
} from "./conversions.js";
import {
  translateCsharpSelectedReceiver,
} from "./receivers.js";
import {
  planCsharpSourceUndefinedValue,
} from "./undefined-values.js";

export function translateCsharpCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const expression = input.ast.as.AsCallExpression(node);
  const sourceCall = input.semantics(sourceFile).getResolvedCallInfo(node);
  const sourceFlow = selectCsharpSourceFlowCall(input, node);
  if (sourceFlow.kind === "rejected") {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      sourceFlow.code,
      sourceFlow.reason,
    ));
    return undefined;
  }
  const calleeNode = sourceCall?.sourceCallee.expression ??
    expression?.Expression;
  const compatShape = compatCallShape(input, sourceCall);
  const compat = selectCsharpCompatAnyCallOperation(
    input,
    calleeNode,
    compatShape.receiver,
    sourceFile,
    compatShape.kind,
    expression?.QuestionDotToken !== undefined,
  );
  if (compat.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
    return undefined;
  }
  if (compat.kind === "resolved") {
    const sourceArguments = input.ast.arguments(node)
      .filter((argument): argument is Node => argument !== undefined);
    if (
      sourceArguments.length !== input.ast.arguments(node).length ||
      sourceArguments.some((argument) =>
        input.ast.is.IsSpreadElement(argument)
      )
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# compatibility calls over TypeScript any require exact non-spread source arguments.",
      ));
      return undefined;
    }
    const receiverNode = compatShape.receiver ?? calleeNode;
    const receiver = receiverNode === undefined
      ? undefined
      : planExpression(receiverNode, sourceFile, input, diagnostics);
    const arguments_ = sourceArguments.map((argument) =>
      planExpression(argument, sourceFile, input, diagnostics)
    );
    if (
      receiver === undefined ||
      arguments_.some((argument) => argument === undefined)
    ) {
      return undefined;
    }
    const invocationArguments = compatCallArguments(
      input,
      compatShape,
      expression?.QuestionDotToken !== undefined,
      arguments_ as readonly CsharpExpression[],
      sourceFile,
      diagnostics,
      planExpression,
    );
    if (invocationArguments === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# compatibility member calls require an exact selected property name or element key.",
      ));
      return undefined;
    }
    return translateCsharpCompatInvocation(
      compat,
      receiver,
      invocationArguments,
    );
  }
  const selection = selectCsharpTargetCall(input, node, sourceFile);
  switch (selection.kind) {
    case "resolved":
      return translateSelectedTargetCall(
        node,
        selection.source,
        selection.call,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
    case "source-owned":
      return translateSourceOwnedCall(
        node,
        selection.source,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
    case "rejected":
      diagnostics.push(selectedPolicyDiagnostic(
        node,
        selection.diagnostic,
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_NOT_CLOSED",
        selection.reason,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_IDENTITY_CONFLICT",
        selection.reason,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_AMBIGUOUS",
        selection.reason,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
  }
}

type CompatCallShape =
  | { readonly kind: "direct"; readonly receiver?: undefined }
  | {
      readonly kind: "property";
      readonly receiver: Node | undefined;
      readonly name: Node | undefined;
      readonly optionalReceiver: boolean;
    }
  | {
      readonly kind: "element";
      readonly receiver: Node | undefined;
      readonly key: Node | undefined;
      readonly optionalReceiver: boolean;
    };

function compatCallShape(
  input: CsharpTranslationContext,
  source: ResolvedSourceCallInfo | undefined,
): CompatCallShape {
  const access = source?.sourceCalleeAccess;
  if (
    access?.kind === "property" &&
    input.ast.is.IsPropertyAccessExpression(access.expression)
  ) {
    const property = input.ast.as.AsPropertyAccessExpression(access.expression);
    return {
      kind: "property",
      receiver: access.receiver.expression,
      name: property?.name,
      optionalReceiver: property?.QuestionDotToken !== undefined,
    };
  }
  if (
    access?.kind === "element" &&
    input.ast.is.IsElementAccessExpression(access.expression)
  ) {
    const element = input.ast.as.AsElementAccessExpression(access.expression);
    return {
      kind: "element",
      receiver: access.receiver.expression,
      key: access.argument.expression,
      optionalReceiver: element?.QuestionDotToken !== undefined,
    };
  }
  return { kind: "direct" };
}

function compatCallArguments(
  input: CsharpTranslationContext,
  shape: CompatCallShape,
  optionalCall: boolean,
  arguments_: readonly CsharpExpression[],
  sourceFile: SourceFile,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): readonly CsharpExpression[] | undefined {
  switch (shape.kind) {
    case "direct":
      return optionalCall
        ? [translateCsharpCompatArgumentFactory(arguments_)]
        : arguments_;
    case "property":
      return shape.name === undefined
        ? undefined
        : [
            { kind: "LiteralExpression", value: input.ast.text(shape.name) },
            { kind: "LiteralExpression", value: shape.optionalReceiver },
            { kind: "LiteralExpression", value: optionalCall },
            translateCsharpCompatArgumentFactory(arguments_),
          ];
    case "element": {
      const key = shape.key === undefined
        ? undefined
        : planExpression(
            shape.key,
            sourceFile,
            input,
            diagnostics,
          );
      return key === undefined
        ? undefined
        : [
            translateCsharpCompatValueFactory(key),
            { kind: "LiteralExpression", value: shape.optionalReceiver },
            { kind: "LiteralExpression", value: optionalCall },
            translateCsharpCompatArgumentFactory(arguments_),
          ];
    }
  }
}

function translateSelectedTargetCall(
  node: Node,
  source: ResolvedSourceCallInfo,
  selection: CsharpSelectedTargetCall,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
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

export function translateSelectedTargetArguments(
  node: Node,
  source: ResolvedSourceCallInfo,
  selection: CsharpSelectedTargetCall,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] | undefined {
  const planned: {
    readonly parameterIndex: number;
    readonly effectiveArgumentIndex: number;
    readonly argument: CsharpArgument;
  }[] = [];
  if (selection.receiver.kind === "target-parameter") {
    const receiver = source.sourceReceiver?.expression;
    const parameter = selection.targetMember.parameters[
      selection.receiver.targetParameterIndex
    ];
    if (receiver === undefined || parameter === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Selected first-argument target receiver has no exact source receiver or target parameter.",
      ));
      return undefined;
    }
    const argument = translateCallArgument(
      receiver,
      parameter,
      "value",
      sourceFile,
      input,
      diagnostics,
      planExpression,
      planCallArgument,
    );
    if (argument === undefined) {
      return undefined;
    }
    planned.push({
      parameterIndex: selection.receiver.targetParameterIndex,
      effectiveArgumentIndex: -1,
      argument,
    });
  }
  for (const argumentSelection of selection.arguments) {
    const sourceArgument = source.sourceArguments[
      argumentSelection.sourceArgumentIndex
    ]?.expression;
    if (sourceArgument === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Selected target argument ${argumentSelection.effectiveArgumentIndex} has no exact checker-owned source expression.`,
      ));
      return undefined;
    }
    const argument = translateCallArgument(
      sourceArgument,
      argumentSelection.targetParameter,
      argumentSelection.sourceForm,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      planCallArgument,
      selection.origin === "provider"
        ? selection.argumentMappings.find((mapping) =>
            mapping.effectiveArgumentIndex ===
              argumentSelection.effectiveArgumentIndex)
        : undefined,
    );
    if (argument === undefined) {
      return undefined;
    }
    planned.push({
      parameterIndex: argumentSelection.targetParameterIndex,
      effectiveArgumentIndex: argumentSelection.effectiveArgumentIndex,
      argument,
    });
  }
  planned.sort((left, right) =>
    left.parameterIndex - right.parameterIndex ||
    left.effectiveArgumentIndex - right.effectiveArgumentIndex);
  if (!targetArgumentOrderIsRepresentable(
    planned.map((entry) => entry.parameterIndex),
    selection.targetMember.parameters,
  )) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected target argument relation requires a target argument reorder or omission that cannot be represented positionally.",
    ));
    return undefined;
  }
  return planned.map((entry) => entry.argument);
}

function translateCallArgument(
  expression: Node,
  parameter: CsharpTargetParameter,
  sourceForm: CsharpSelectedCallArgument["sourceForm"],
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
  selectedMapping?: CsharpProviderArgumentMapping,
): CsharpArgument | undefined {
  if (sourceForm === "spread-element") {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      "Tuple-expanded call arguments require an explicit target tuple expansion plan.",
    ));
    return undefined;
  }
  if (sourceForm === "spread-sequence" && parameter.paramsArray !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      "Sequence-spread call arguments require an exact related C# params parameter.",
    ));
    return undefined;
  }
  const targetType = csharpTargetParameterValueType(parameter, sourceForm);
  const expectedType = csharpTypeFromTargetTypeRef(targetType);
  if (expectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      expression,
      `Selected target parameter '${parameter.name}' has no renderable C# type.`,
    ));
    return undefined;
  }
  if (
    selectedMapping?.kind === "by-value" &&
    (
      selectedMapping.conversion.kind === "provider-argument-adapter" ||
      selectedMapping.conversion.kind === "lifted-provider-argument-adapter"
    )
  ) {
    if (
      sourceForm !== "value" ||
      parameter.passingMode !== "by-value"
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        expression,
        `Exact provider argument adapter '${selectedMapping.conversion.adapter.id}' requires an ordinary by-value source argument.`,
      ));
      return undefined;
    }
    const sourceExpression = planExpression(
      expression,
      sourceFile,
      input,
      diagnostics,
    );
    const adapted = applyCsharpConversionSelection(
      expression,
      sourceFile,
      input,
      diagnostics,
      selectedMapping.sourceType,
      selectedMapping.targetType,
      selectedMapping.conversion,
      sourceExpression,
    );
    return adapted === undefined
      ? undefined
      : { kind: "Argument", expression: adapted };
  }
  return planCallArgument(
    expression,
    sourceFile,
    input,
    diagnostics,
    expectedType,
    undefined,
    targetType,
    parameter.passingMode,
    parameter,
  );
}

function translateSourceOwnedCall(
  node: Node,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const signatureDeclaration = input.semantics(sourceFile)
    .getSignatureDeclaration(source.selectedSignature);
  if (
    !isProjectSourceDeclaration(
      input,
      source.sourceCallee.selectedDeclaration,
    ) &&
    !isProjectSourceDeclaration(input, signatureDeclaration)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source callee is external to the project and has no C# target relation.",
    ));
    return undefined;
  }
  let callee = planExpression(
    source.sourceCallee.expression,
    sourceFile,
    input,
    diagnostics,
  );
  if (callee === undefined) {
    return undefined;
  }
  const typeArguments = input.types.resolveSourceCallTypeArguments(
    source,
    sourceFile,
  );
  if (typeArguments === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Source-owned generic call has a selected method type argument with no closed C# representation.",
    ));
    return undefined;
  }
  callee = applyCalleeTypeArguments(
    callee,
    typeArguments,
    node,
    diagnostics,
  );
  if (callee === undefined) {
    return undefined;
  }
  const arguments_ = translateSourceOwnedArguments(
    node,
    source,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
  return arguments_ === undefined
    ? undefined
    : { kind: "InvocationExpression", callee, arguments: arguments_ };
}

export function translateSourceOwnedArguments(
  node: Node,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] | undefined {
  const bindingsBySourceArgument = new Map<
    number,
    ResolvedSourceCallInfo["sourceArgumentBindings"]
  >();
  for (const binding of source.sourceArgumentBindings) {
    const existing = bindingsBySourceArgument.get(binding.sourceArgumentIndex) ??
      [];
    bindingsBySourceArgument.set(
      binding.sourceArgumentIndex,
      [...existing, binding],
    );
  }
  const planned: CsharpArgument[] = [];
  for (
    let sourceArgumentIndex = 0;
    sourceArgumentIndex < source.sourceArguments.length;
    sourceArgumentIndex += 1
  ) {
    const argument = source.sourceArguments[sourceArgumentIndex]?.expression;
    const bindings = bindingsBySourceArgument.get(sourceArgumentIndex) ?? [];
    if (argument === undefined || bindings.length === 0) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Source-owned call argument ${sourceArgumentIndex} has no exact selected parameter binding.`,
      ));
      return undefined;
    }
    const first = bindings[0]!;
    if (
      bindings.some((binding) =>
        binding.sourceParameterIndex !== first.sourceParameterIndex ||
        binding.sourceForm !== first.sourceForm)
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Source-owned tuple-spread arguments require an explicit expansion plan.",
      ));
      return undefined;
    }
    const parameter = source.sourceSelectedSignatureParameters[
      first.sourceParameterIndex
    ];
    const targetType = input.types.resolveSourceCallParameter(
      source,
      first.sourceParameterIndex,
      sourceFile,
    );
    if (parameter === undefined || targetType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Source-owned selected parameter ${first.sourceParameterIndex} has no closed C# type.`,
      ));
      return undefined;
    }
    const targetParameter: CsharpTargetParameter = {
      name: parameter.parameterName,
      type: targetType,
      passingMode: "by-value",
      ...(parameter.acceptsOmission ? { optional: true } : {}),
      ...(parameter.rest ? { paramsArray: true } : {}),
    };
    const plannedArgument = translateCallArgument(
      argument,
      targetParameter,
      first.sourceForm,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      planCallArgument,
    );
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push(plannedArgument);
  }
  const boundParameterIndexes = new Set(
    source.sourceArgumentBindings.map((binding) => binding.sourceParameterIndex),
  );
  for (
    let parameterIndex = 0;
    parameterIndex < source.sourceSelectedSignatureParameters.length;
    parameterIndex += 1
  ) {
    if (boundParameterIndexes.has(parameterIndex)) {
      continue;
    }
    const parameter = source.sourceSelectedSignatureParameters[parameterIndex];
    if (parameter === undefined || parameter.rest) {
      continue;
    }
    if (!parameter.acceptsOmission) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Source-owned selected parameter ${parameterIndex} has no exact source argument and does not accept omission.`,
      ));
      return undefined;
    }
    const exactTargetArity = sourceCalleeRequiresExactTargetArity(
      source,
      input,
    );
    if (
      !exactTargetArity ||
      targetDelegatePreservesOmission(
        source,
        parameterIndex,
        sourceFile,
        input,
      )
    ) {
      continue;
    }
    const declaration = input.ast.as.AsParameterDeclaration(
      parameter.parameterDeclaration,
    );
    if (declaration?.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Omitted source-owned delegate parameter ${parameterIndex} has a default initializer that requires exact callee-side default evaluation before C# emission.`,
      ));
      return undefined;
    }
    const targetType = input.types.resolveSourceCallParameter(
      source,
      parameterIndex,
      sourceFile,
    );
    if (targetType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Omitted source-owned selected parameter ${parameterIndex} has no closed C# type.`,
      ));
      return undefined;
    }
    const omitted = planCsharpSourceUndefinedValue(
      node,
      targetType,
      sourceFile,
      input,
      diagnostics,
    );
    if (omitted.kind !== "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Omitted source-owned selected parameter ${parameterIndex} has no exact C# representation for source undefined.`,
      ));
      return undefined;
    }
    planned.push({ kind: "Argument", expression: omitted.expression });
  }
  return planned;
}

function targetDelegatePreservesOmission(
  source: ResolvedSourceCallInfo,
  parameterIndex: number,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  const targetCalleeType = input.types.resolveNode(
    source.sourceCallee.expression,
    sourceFile,
  );
  const signature = getCsharpDelegateSignature(targetCalleeType);
  return signature?.parameters.length ===
      source.sourceSelectedSignatureParameters.length &&
    signature.optionalParameterIndexes?.includes(parameterIndex) === true;
}

function sourceCalleeRequiresExactTargetArity(
  source: ResolvedSourceCallInfo,
  input: CsharpTranslationContext,
): boolean {
  const declaration = source.sourceCallee.selectedDeclaration;
  return declaration !== undefined &&
    (
      input.ast.is.IsVariableDeclaration(declaration) ||
      input.ast.is.IsParameterDeclaration(declaration) ||
      input.ast.is.IsPropertyDeclaration(declaration) ||
      input.ast.is.IsPropertySignatureDeclaration(declaration) ||
      input.ast.is.IsBindingElement(declaration) ||
      input.ast.is.IsArrowFunction(declaration) ||
      input.ast.is.IsFunctionExpression(declaration)
    );
}

function applyCalleeTypeArguments(
  callee: CsharpExpression,
  typeArguments: readonly TargetTypeRef[],
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const rendered = renderCsharpTargetTypeArguments(
    typeArguments,
    node,
    diagnostics,
  );
  if (rendered === undefined || rendered.length === 0) {
    return rendered === undefined ? undefined : callee;
  }
  switch (callee.kind) {
    case "IdentifierName":
    case "QualifiedName":
    case "SimpleMemberAccessExpression":
    case "ConditionalAccessExpression":
      return {
        ...callee,
        typeArguments: [...(callee.typeArguments ?? []), ...rendered],
      };
    default:
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Selected generic source call requires a C# callee shape that can carry type arguments.",
      ));
      return undefined;
  }
}

export function renderCsharpTargetTypeArguments(
  typeArguments: readonly TargetTypeRef[],
  node: Node,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] | undefined {
  const rendered = typeArguments.map(csharpTypeFromTargetTypeRef);
  if (rendered.some((argument) => argument === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected call contains a target type argument that cannot be rendered in C#.",
    ));
    return undefined;
  }
  return rendered as readonly CsharpTypeNode[];
}

function sourceCallIsOptional(
  input: CsharpTranslationContext,
  source: ResolvedSourceCallInfo,
): boolean {
  const access = source.sourceCalleeAccess?.expression;
  if (access === undefined || !input.ast.is.IsPropertyAccessExpression(access)) {
    return false;
  }
  return input.ast.as.AsPropertyAccessExpression(access)?.QuestionDotToken !==
    undefined;
}

function isProjectSourceDeclaration(
  input: CsharpTranslationContext,
  declaration: Node | undefined,
): boolean {
  const sourceFile = input.ast.getSourceFile(declaration);
  return sourceFile !== undefined &&
    !sourceFile.IsDeclarationFile &&
    input.sourceFiles.some((candidate) =>
      sourceFileIdentity(input.ast, candidate) ===
        sourceFileIdentity(input.ast, sourceFile));
}

function targetArgumentOrderIsRepresentable(
  indexes: readonly number[],
  parameters: readonly CsharpTargetParameter[],
): boolean {
  let previous = -1;
  for (const index of indexes) {
    if (index < previous || index > previous + 1) {
      return false;
    }
    if (
      index === previous &&
      parameters[index]?.paramsArray !== true
    ) {
      return false;
    }
    previous = index;
  }
  return true;
}

function translateArrayCreationCall(
  node: Node,
  member: CsharpTargetMember,
  arguments_: readonly CsharpArgument[],
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const invocation = member.csharpInvocation;
  const resultType = member.returnType;
  if (
    invocation?.kind !== "array-creation" ||
    resultType?.kind !== "array" ||
    arguments_.length !== 1 ||
    invocation.lengthParameterIndex !== 0
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected array-creation relation does not contain one closed element type and one length argument.",
    ));
    return undefined;
  }
  const elementType = csharpTypeFromTargetTypeRef(resultType.element);
  if (elementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected array-creation element type cannot be rendered in C#.",
    ));
    return undefined;
  }
  return {
    kind: "ArrayCreationExpression",
    elementType,
    size: arguments_[0]!.expression,
    elements: [],
  };
}
