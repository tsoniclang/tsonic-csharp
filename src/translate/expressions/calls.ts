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
import type {
  CsharpSelectedCallArgument,
  CsharpSelectedTargetCall,
  ResolvedSourceCallInfo,
} from "../../policy/members/index.js";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  csharpTargetParameterValueType,
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

export function translateCsharpCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
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
        sourceFile,
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_NOT_CLOSED",
        selection.reason,
        sourceFile,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_IDENTITY_CONFLICT",
        selection.reason,
        sourceFile,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_AMBIGUOUS",
        selection.reason,
        sourceFile,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
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
  if (
    !registerSelectedCallArtifacts(
      node,
      source,
      selection.targetMember,
      sourceFile,
      input,
      diagnostics,
    )
  ) {
    return undefined;
  }
  const arguments_ = translateSelectedTargetArguments(
    node,
    source,
    selection,
    sourceFile,
    input,
    diagnostics,
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
): boolean {
  const requirement = member.csharpCallFinalization;
  if (requirement === undefined) {
    return true;
  }
  const argument = source.sourceArguments[requirement.argumentIndex]?.expression;
  const targetType = input.types.resolveNode(argument, sourceFile);
  if (argument === undefined || targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected target call '${member.id}' requires a closed JSON argument at source index ${requirement.argumentIndex}.`,
    ));
    return false;
  }
  const result = input.artifacts.requireJsonSerialization(
    argument,
    targetType,
    sourceFile,
    requirement.kind === "closed-json-object-shape"
      ? "object-shape"
      : "value",
  );
  if (result.kind === "accepted") {
    return true;
  }
  diagnostics.push(unsupportedNodeDiagnostic(argument, result.reason));
  return false;
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
  const typeArguments = renderCsharpTargetTypeArguments(
    selection.targetMethodTypeArguments,
    node,
    diagnostics,
  );
  if (typeArguments === undefined) {
    return undefined;
  }
  if (selection.receiver.kind === "instance") {
    const receiverNode = source.sourceReceiver?.expression;
    if (receiverNode === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Selected instance target call has no exact checker-selected receiver.",
      ));
      return undefined;
    }
    const receiver = planExpression(
      receiverNode,
      sourceFile,
      input,
      diagnostics,
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
      planCallArgument,
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
  planCallArgument: CallArgumentPlanner,
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
  return planCallArgument(
    expression,
    sourceFile,
    input,
    diagnostics,
    expectedType,
    undefined,
    targetType,
    parameter.passingMode,
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
  const declaration = input.queries(sourceFile).checker
    .getSignatureDeclaration(source.selectedSignature);
  if (!isProjectSourceDeclaration(input, declaration)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source call is external to the project and has no C# target relation.",
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
  const typeArguments = source.sourceSelectedMethodTypeArguments?.map(
    (argument) =>
      input.types.resolveNode(argument.explicitTypeNode, sourceFile) ??
      input.types.resolveType(argument.selectedType, sourceFile),
  ) ?? [];
  if (typeArguments.some((argument) => argument === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Source-owned generic call has a selected method type argument with no closed C# representation.",
    ));
    return undefined;
  }
  callee = applyCalleeTypeArguments(
    callee,
    typeArguments as readonly TargetTypeRef[],
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
    const targetType = input.types.resolveNode(
      parameter?.authoredTypeNode,
      sourceFile,
    ) ?? input.types.resolveType(parameter?.selectedType, sourceFile);
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
      planCallArgument,
    );
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push(plannedArgument);
  }
  return planned;
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
