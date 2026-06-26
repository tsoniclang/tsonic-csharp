import {
  AsCallExpression,
  AsElementAccessExpression,
  AsNumericLiteral,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindNumericLiteral,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  getCsharpTypeForNode,
} from "./csharp-types.js";
import {
  getSourceCallTypeParameterSubstitutions,
  substituteCsharpTypeNode,
} from "./csharp-type-node/source-generic-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  planIdentifierName,
} from "./names.js";
import {
  getCallableSemanticOwnership,
  getSemanticOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import {
  planProjectSourceModuleMemberReference,
  tryPlanProjectSourceModuleStaticMemberReference,
} from "./expression-source-references.js";
import {
  ensureElementAccessCanBeRendered,
} from "./expression-element-access-rules.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  planSelectedTargetCallee,
  planSelectedTargetCallArguments,
  planSelectedTargetReceiverExpression,
  targetStaticMemberExpression,
} from "./expression-selected-target-members.js";
import type {
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationFact,
  CsharpTargetOperationArgument,
} from "../../source/csharp-facts.js";
import {
  isCsharpSourceOwnedPropertyOperation,
} from "../../source/csharp-facts.js";
import {
  getRequiredCsharpTargetOperation,
  getRequiredCsharpTargetOperationForSelectedSignature,
  getRequiredCsharpTargetMemberOperationForSelectedSignature,
} from "./csharp-target-operations.js";
import {
  getCsharpObjectShapeFactForNode,
} from "./csharp-fact-queries.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  tryPlanCompatRuntimeCall,
  tryPlanCompatRuntimeElementGet,
  tryPlanCompatRuntimePropertyGet,
} from "./compat-runtime-operations.js";
import {
  parseFiniteNumberLiteral,
} from "../../source/source-literal-values.js";

export {
  planSelectedTargetCallArguments,
} from "./expression-selected-target-members.js";

export function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const sourceName = Node_Text(expression.name!);
  const sourceModuleStaticMemberReference = tryPlanProjectSourceModuleStaticMemberReference(propertyAccess, sourceFile, input, diagnostics);
  if (sourceModuleStaticMemberReference !== undefined) {
    return sourceModuleStaticMemberReference;
  }
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimePropertyGet = tryPlanCompatRuntimePropertyGet(propertyAccess, expression.Expression, expression.QuestionDotToken !== undefined, sourceFile, input, diagnostics, planExpression);
  if (compatRuntimePropertyGet !== undefined) {
    return compatRuntimePropertyGet;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  const targetOperation = input.facts.getSelectedTargetProperty(propertyAccess);
  const sourceOwnedPropertyOperation = isCsharpSourceOwnedPropertyOperation(targetOperation);
  if (sourceOwnedPropertyOperation) {
    const sourceModuleMemberReference = planProjectSourceModuleMemberReference(propertyAccess, sourceFile, input, diagnostics);
    if (sourceModuleMemberReference !== undefined) {
      return sourceModuleMemberReference;
    }
  } else if (targetOperation !== undefined && targetOperation.operationKind === "property") {
    const csharpOperation = getRequiredCsharpTargetOperation(input, propertyAccess, targetOperation, diagnostics, "C# property access emission");
    if (csharpOperation === undefined) {
      return undefined;
    }
    if (csharpOperation.kind !== "member" || csharpOperation.operationKind !== "property") {
      diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, "C# property access emission requires a finalized C# member property operation fact."));
      return undefined;
    }
    if (csharpOperation.static === true) {
      const staticMember = targetStaticMemberExpression(csharpOperation, diagnostics, propertyAccess);
      if (staticMember !== undefined) {
        return staticMember;
      }
      return undefined;
    }
    const receiverExpression = planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression);
    if (receiverExpression === undefined) {
      return undefined;
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: receiverExpression,
      name: csharpOperation.memberName,
    };
  }
  if (!sourceOwnedPropertyOperation && targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Property access expected a provider property fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return undefined;
  }
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(propertyAccess, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  const receiver = expression.Expression;
  const objectShape = getCsharpObjectShapeFactForNode(receiver, sourceFile, input);
  if (objectShape !== undefined) {
    return planObjectShapePropertyAccess(propertyAccess, sourceName, objectShape, sourceFile, input, diagnostics, planExpression);
  }
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, propertyAccess, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`, ownership);
    return undefined;
  }
  const receiverExpression = planExpression(expression.Expression!, sourceFile, input, diagnostics);
  if (receiverExpression === undefined) {
    return undefined;
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: receiverExpression,
    name: planIdentifierName(expression.name, "InvalidPropertyName", input, diagnostics, "Source-owned property name"),
  };
}

function planObjectShapePropertyAccess(
  propertyAccess: Node,
  sourceName: string,
  objectShape: NonNullable<ReturnType<typeof getCsharpObjectShapeFactForNode>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const member = objectShape.members.find((candidate) => candidate.sourceName === sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Object-shape property access '${sourceName}' must match a finalized object-shape member before C# emission.`));
    return undefined;
  }
  if (csharpTypeFromTargetTypeRef(member.type) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
    return undefined;
  }
  const receiverExpression = planExpression(expression.Expression!, sourceFile, input, diagnostics);
  if (receiverExpression === undefined) {
    return undefined;
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: receiverExpression,
    name: member.targetName,
  };
}

export function planElementAccessExpression(
  elementAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsElementAccessExpression(elementAccess)!;
  const tupleDiagnosticsStart = diagnostics.length;
  const tupleElementAccess = planTupleElementAccessExpression(elementAccess, expression.Expression, expression.ArgumentExpression, expression.QuestionDotToken !== undefined, sourceFile, input, diagnostics, planExpression);
  if (tupleElementAccess !== undefined) {
    return tupleElementAccess;
  }
  if (diagnostics.length > tupleDiagnosticsStart) {
    return undefined;
  }
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimeElementGet = tryPlanCompatRuntimeElementGet(elementAccess, expression.Expression, expression.ArgumentExpression, expression.QuestionDotToken !== undefined, sourceFile, input, diagnostics, planExpression);
  if (compatRuntimeElementGet !== undefined) {
    return compatRuntimeElementGet;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  if (!ensureElementAccessCanBeRendered(elementAccess, expression.Expression, sourceFile, input, diagnostics)) {
    return undefined;
  }
  const selectedElementAccess = input.facts.getSelectedTargetElementAccess(elementAccess);
  const csharpOperation = selectedElementAccess === undefined
    ? undefined
    : getRequiredCsharpTargetOperation(input, elementAccess, selectedElementAccess, diagnostics, "C# element access emission");
  if (selectedElementAccess !== undefined && csharpOperation === undefined) {
    return undefined;
  }
  if (selectedElementAccess !== undefined && csharpOperation?.operationId !== selectedElementAccess.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "C# element access emission received mismatched or missing finalized C# target operation facts."));
    return undefined;
  }
  if (csharpOperation !== undefined && csharpOperation.kind !== "member") {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `C# element access emission requires a finalized member/indexer operation fact, but provider recorded '${csharpOperation.kind}'.`));
    return undefined;
  }
  if (csharpOperation?.operationKind === "method" && csharpOperation.argumentProjection !== undefined) {
    const receiver = planExpression(expression.Expression!, sourceFile, input, diagnostics);
    if (receiver === undefined) {
      return undefined;
    }
    const arguments_ = planCsharpTargetOperationArguments(csharpOperation, elementAccess, expression.ArgumentExpression, sourceFile, input, diagnostics, planExpression);
    if (arguments_ === undefined) {
      return undefined;
    }
    return {
      kind: "InvocationExpression",
      callee: {
        kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
        receiver,
        name: csharpOperation.memberName,
      },
      arguments: arguments_,
    };
  }
  if (csharpOperation !== undefined && csharpOperation.operationKind !== "indexer") {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `C# element access emission expected an indexer operation fact or projected member call, but provider recorded '${csharpOperation.operationKind}'.`));
    return undefined;
  }
  const receiverExpression = selectedElementAccess === undefined
    ? planExpression(expression.Expression!, sourceFile, input, diagnostics)
    : planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression);
  const argumentExpression = planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics);
  if (receiverExpression === undefined || argumentExpression === undefined) {
    return undefined;
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "ElementAccessExpression" : "ConditionalElementAccessExpression",
    receiver: receiverExpression,
    argument: argumentExpression,
  };
}

function planTupleElementAccessExpression(
  elementAccess: Node,
  receiverNode: Node | undefined,
  argumentNode: Node | undefined,
  optional: boolean,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const receiverCarrier = getRuntimeCarrierForExpression(input, receiverNode, sourceFile);
  if (receiverCarrier?.kind !== "tuple") {
    return undefined;
  }
  if (optional) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Optional tuple element access requires finalized nullable tuple carrier facts before C# emission."));
    return undefined;
  }
  if (receiverNode === undefined || argumentNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Tuple element access requires finalized receiver and argument facts before C# emission."));
    return undefined;
  }
  const index = getFinalizedTupleElementIndex(argumentNode, sourceFile, input);
  if (index === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Tuple element access requires a numeric-literal source index; non-literal tuple indexing needs finalized target element-access facts before C# emission."));
    return undefined;
  }
  const elementCarrier = receiverCarrier.elements[index];
  if (elementCarrier === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `Tuple element access index ${index} requires a finalized tuple element carrier before C# emission.`));
    return undefined;
  }
  if (csharpTypeFromTargetTypeRef(elementCarrier) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `Tuple element access index ${index} requires a renderable tuple element carrier type before C# emission.`));
    return undefined;
  }
  const receiver = planExpression(receiverNode, sourceFile, input, diagnostics);
  if (receiver === undefined) {
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver,
    name: `Item${index + 1}`,
  };
}

function getFinalizedTupleElementIndex(
  argumentNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): number | undefined {
  if (HasSourceKind(input.ast, argumentNode, KindNumericLiteral)) {
    return getNonNegativeSafeIntegerIndex(parseFiniteNumberLiteral(Node_Text(AsNumericLiteral(argumentNode))));
  }
  if (input.types === undefined) {
    return undefined;
  }
  const literalValue = input.types.getLiteralValue(input.analysis.getTypeAtLocation(argumentNode, { sourceFile }));
  return typeof literalValue === "number"
    ? getNonNegativeSafeIntegerIndex(literalValue)
    : undefined;
}

function getNonNegativeSafeIntegerIndex(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isSafeInteger(value) || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function planCsharpTargetOperationArguments(
  operation: CsharpTargetMemberOperationFact,
  diagnosticNode: Node,
  sourceArgument: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): readonly CsharpArgument[] | undefined {
  const projection = operation.argumentProjection;
  if (projection === undefined) {
    return [];
  }
  const planned: CsharpArgument[] = [];
  for (const argument of projection) {
    const expression = planCsharpTargetOperationArgument(argument, diagnosticNode, sourceArgument, sourceFile, input, diagnostics, planExpression);
    if (expression === undefined) {
      return undefined;
    }
    planned.push({ kind: "Argument", expression });
  }
  return planned;
}

function planCsharpTargetOperationArgument(
  argument: CsharpTargetOperationArgument,
  diagnosticNode: Node,
  sourceArgument: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  switch (argument.kind) {
    case "source-argument":
      if (argument.index !== 0 || sourceArgument === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `C# target operation argument projection requires source argument index ${argument.index}, but element access provides only index 0.`));
        return undefined;
      }
      return planExpression(sourceArgument, sourceFile, input, diagnostics);
    case "literal":
      return { kind: "LiteralExpression", value: argument.value };
  }
}

export function planCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const expression = AsCallExpression(node)!;
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimeCall = tryPlanCompatRuntimeCall(node, expression.Expression, expression.Arguments?.Nodes ?? [], sourceFile, input, diagnostics, planExpression);
  if (compatRuntimeCall !== undefined) {
    return compatRuntimeCall;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  const selectedTargetCall = input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined) {
    const targetOperation = getRequiredCsharpTargetOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# call emission");
    if (targetOperation?.kind === "array-creation") {
      return planNativeArrayCreationCall(node, expression, targetOperation, selectedTargetCall, sourceFile, input, diagnostics, planCallArgument);
    }
    const csharpOperation = getRequiredCsharpTargetMemberOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# call emission");
    if (csharpOperation === undefined) {
      return undefined;
    }
    const member = csharpOperation.selectedMember;
    if (member === undefined) {
      return undefined;
    }
    const callee = planSelectedTargetCallee(expression.Expression, csharpOperation, sourceFile, input, diagnostics, planExpression);
    const arguments_ = planSelectedTargetCallArguments(expression.Expression, expression, member, csharpOperation.argumentArrayLiteralElementTypes, sourceFile, input, diagnostics, planCallArgument);
    if (callee === undefined || arguments_ === undefined) {
      return undefined;
    }
    return {
      kind: "InvocationExpression",
      callee,
      arguments: arguments_,
    };
  }
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# call emission requires a source-owned callable or a selected target signature fact.", ownership);
    return undefined;
  }
  const callee = planSourceOwnedCallCallee(node, expression.Expression!, sourceFile, input, diagnostics, planExpression);
  const arguments_ = planSourceOwnedCallArguments(node, expression.Arguments?.Nodes ?? [], sourceFile, input, diagnostics, planCallArgument);
  if (callee === undefined || arguments_ === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee,
    arguments: arguments_,
  };
}

function planSourceOwnedCallArguments(
  call: Node,
  argumentsNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] | undefined {
  const planned: CsharpArgument[] = [];
  let index = 0;
  for (const argument of argumentsNodes) {
    if (argument === undefined) {
      continue;
    }
    const expected = getResolvedSourceCallArgumentExpectation(call, argument, index, sourceFile, input, diagnostics);
    if (expected?.kind === "failed") {
      return undefined;
    }
    const plannedArgument = planCallArgument(argument, sourceFile, input, diagnostics, expected?.type, expected?.subject);
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push(plannedArgument);
    index += 1;
  }
  return planned;
}

function planSourceOwnedCallCallee(
  callNode: Node,
  calleeNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const callee = planExpression(calleeNode, sourceFile, input, diagnostics);
  if (callee === undefined) {
    return undefined;
  }
  const typeArguments = input.ast.typeArguments(callNode)
    .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, undefined, diagnostics));
  if (typeArguments.length === 0) {
    return callee;
  }
  switch (callee.kind) {
    case "IdentifierName":
    case "QualifiedName":
      return {
        ...callee,
        typeArguments: [...(callee.typeArguments ?? []), ...typeArguments],
      };
    case "SimpleMemberAccessExpression":
    case "ConditionalAccessExpression":
      return {
        ...callee,
        typeArguments: [...(callee.typeArguments ?? []), ...typeArguments],
      };
    default:
      diagnostics.push(unsupportedNodeDiagnostic(callNode, "Source-owned generic call emission requires a callee that can carry finalized C# type arguments."));
      return undefined;
  }
}

function planNativeArrayCreationCall(
  node: Node,
  expression: NonNullable<ReturnType<typeof AsCallExpression>>,
  operation: Extract<CsharpTargetOperationFact, { readonly kind: "array-creation" }>,
  selectedTargetCall: NonNullable<ReturnType<TargetCompileInput["facts"]["getSelectedTargetCall"]>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const lengthArgumentNode = expression.Arguments?.Nodes?.[operation.lengthArgumentIndex];
  if (lengthArgumentNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# native array creation requires the finalized length argument."));
    return undefined;
  }
  const elementType = substituteSelectedTargetTypeParameters(operation.elementType, selectedTargetCall);
  const csharpElementType = csharpTypeFromTargetTypeRef(elementType);
  if (csharpElementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# native array creation requires a renderable finalized array element target type."));
    return undefined;
  }
  const size = planCallArgument(lengthArgumentNode, sourceFile, input, diagnostics);
  if (size === undefined) {
    return undefined;
  }
  return {
    kind: "ArrayCreationExpression",
    elementType: csharpElementType,
    size: size.expression,
    elements: [],
  };
}

function substituteSelectedTargetTypeParameters(
  type: TargetTypeRef,
  selectedTargetCall: NonNullable<ReturnType<TargetCompileInput["facts"]["getSelectedTargetCall"]>>,
): TargetTypeRef {
  const substitutions = new Map<string, TargetTypeRef>();
  const typeParameters = selectedTargetCall.member.typeParameters ?? [];
  const typeArguments = selectedTargetCall.targetTypeArguments ?? [];
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      substitutions.set(parameter.name, argument);
    }
  }
  return substituteTargetTypeParameterReferences(type, substitutions);
}

function substituteTargetTypeParameterReferences(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameterReferences(argument, substitutions)) }),
      };
    case "array":
      return { ...type, element: substituteTargetTypeParameterReferences(type.element, substitutions) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeParameterReferences(element, substitutions)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeParameterReferences(type.pointee, substitutions) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeParameterReferences(argument, substitutions)),
        result: substituteTargetTypeParameterReferences(type.result, substitutions),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeParameterReferences(type.owner, substitutions) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}

function getResolvedSourceCallArgumentExpectation(
  call: Node,
  argument: Node,
  argumentIndex: number,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly kind?: "expectation"; readonly type?: CsharpTypeNode; readonly subject?: Node } | { readonly kind: "failed" } | undefined {
  const sourceCall = AsCallExpression(call);
  const declaration = input.analysis.getResolvedCallParameterDeclarations(call, { sourceFile })?.[argumentIndex];
  const declarationType = getNodeType(declaration);
  const substitutedDeclarationType = getSubstitutedSourceCallParameterType(call, sourceCall, declarationType, sourceFile, input);
  if (substitutedDeclarationType !== undefined) {
    return {
      type: substitutedDeclarationType,
      subject: declarationType ?? declaration,
    };
  }
  const parameterCarrierResolution = input.targetFacts.resolveCallParameterRuntimeCarriers(call, { sourceFile });
  if (parameterCarrierResolution.kind === "resolved-parameters") {
    const carrierResolution = parameterCarrierResolution.parameters[argumentIndex];
    const carrier = probeCarrierFromResolution(carrierResolution);
    if (carrier === undefined && declaration !== undefined) {
      const detail = missingCarrierDiagnosticDetail(carrierResolution, "Parameter runtime carrier fact is missing for the TSTS-selected source call parameter.");
      diagnostics.push(unsupportedNodeDiagnostic(argument, `Source-owned call argument emission requires a finalized parameter carrier fact: ${detail.reason}`, detail.evidence));
      return { kind: "failed" };
    }
    if (carrier === undefined) {
      return undefined;
    }
    const targetType = csharpTypeFromTargetTypeRef(carrier);
    if (targetType !== undefined) {
      return { type: targetType, subject: declarationType ?? declaration };
    }
    diagnostics.push(unsupportedNodeDiagnostic(argument, "Source-owned call argument emission requires a renderable finalized parameter carrier fact."));
    return { kind: "failed" };
  }
  if (declaration !== undefined) {
    const detail = missingCarrierDiagnosticDetail(parameterCarrierResolution, "Parameter carrier resolution is missing for the TSTS-selected source call signature.");
    diagnostics.push(unsupportedNodeDiagnostic(argument, `Source-owned call argument emission requires finalized parameter carrier facts: ${detail.reason}`, detail.evidence));
    return { kind: "failed" };
  }
  return undefined;
}

function getSubstitutedSourceCallParameterType(
  callNode: Node,
  call: ReturnType<typeof AsCallExpression>,
  declarationType: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  if (call === undefined || declarationType === undefined) {
    return undefined;
  }
  const sourceReference = input.analysis.getProjectSourceReferenceForNode(call.Expression, { sourceFile });
  if (sourceReference === undefined) {
    return undefined;
  }
  const substitutions = getSourceCallTypeParameterSubstitutions(
    callNode,
    call,
    sourceReference.declaration,
    sourceFile,
    input,
    getCsharpTypeForNode,
  );
  if (substitutions.size === 0) {
    return undefined;
  }
  const declarationSourceFile = input.ast.getSourceFile(declarationType) ?? sourceReference.sourceFile;
  return substituteCsharpTypeNode(
    getCsharpTypeForNode(declarationType, declarationSourceFile, input),
    substitutions,
  );
}

function getNodeType(node: Node | undefined): Node | undefined {
  return (node as { readonly Type?: Node } | undefined)?.Type;
}
