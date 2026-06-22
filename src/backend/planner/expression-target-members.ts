import {
  AsCallExpression,
  AsElementAccessExpression,
  AsPropertyAccessExpression,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
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
  CsharpTargetOperationArgument,
} from "../../source/csharp-facts.js";
import {
  getRequiredCsharpTargetOperation,
  getRequiredCsharpTargetMemberOperationForSelectedSignature,
} from "./csharp-target-operations.js";
import {
  getCsharpObjectShapeFactForNode,
} from "./csharp-fact-queries.js";
import {
  getRuntimeCarrierForExpression,
  getTargetTypeRefForType,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export {
  planSelectedTargetCallArguments,
} from "./expression-selected-target-members.js";

export function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(propertyAccess, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  const sourceName = Node_Text(expression.name!);
  const receiver = expression.Expression;
  const objectShape = getCsharpObjectShapeFactForNode(receiver, sourceFile, input);
  if (objectShape !== undefined) {
    return planObjectShapePropertyAccess(propertyAccess, sourceName, objectShape, sourceFile, input, diagnostics, planExpression);
  }
  const targetOperation = input.facts.getSelectedTargetProperty(propertyAccess);
  if (targetOperation !== undefined && targetOperation.operationKind === "property") {
    const csharpOperation = getRequiredCsharpTargetOperation(input, propertyAccess, targetOperation, diagnostics, "C# property access emission");
    if (csharpOperation === undefined) {
      return invalidExpression("missing C# target property operation fact");
    }
    const staticMember = targetStaticMemberExpression(csharpOperation, diagnostics, propertyAccess);
    if (staticMember !== undefined) {
      return staticMember;
    }
    if (csharpOperation.kind !== "member" || csharpOperation.operationKind !== "property") {
      diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, "C# property access emission requires a finalized C# member property operation fact."));
      return invalidExpression("selected target property operation");
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression),
      name: csharpOperation.memberName,
    };
  }
  if (targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Property access expected a provider property fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return invalidExpression("selected target property");
  }
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, propertyAccess, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`, ownership);
    return invalidExpression("missing target property fact");
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
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
): CsharpExpression {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const member = objectShape.members.find((candidate) => candidate.sourceName === sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Object-shape property access '${sourceName}' must match a finalized object-shape member before C# emission.`));
    return invalidExpression("missing object-shape member fact");
  }
  if (csharpTypeFromTargetTypeRef(member.type) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
    return invalidExpression("unrenderable object-shape member type");
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
    name: member.targetName,
  };
}

export function planElementAccessExpression(
  elementAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  const expression = AsElementAccessExpression(elementAccess)!;
  const tupleElementAccess = planTupleElementAccessExpression(elementAccess, expression.Expression, expression.ArgumentExpression, expression.QuestionDotToken !== undefined, sourceFile, input, diagnostics, planExpression);
  if (tupleElementAccess !== undefined) {
    return tupleElementAccess;
  }
  if (!ensureElementAccessCanBeRendered(elementAccess, expression.Expression, sourceFile, input, diagnostics)) {
    return invalidExpression("missing target element access fact");
  }
  const selectedElementAccess = input.facts.getSelectedTargetElementAccess(elementAccess);
  const csharpOperation = selectedElementAccess === undefined
    ? undefined
    : getRequiredCsharpTargetOperation(input, elementAccess, selectedElementAccess, diagnostics, "C# element access emission");
  if (selectedElementAccess !== undefined && csharpOperation?.operationId !== selectedElementAccess.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "C# element access emission received mismatched or missing finalized C# target operation facts."));
    return invalidExpression("selected target element access operation");
  }
  if (csharpOperation !== undefined && csharpOperation.kind !== "member") {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `C# element access emission requires a finalized member/indexer operation fact, but provider recorded '${csharpOperation.kind}'.`));
    return invalidExpression("selected target element access operation");
  }
  if (csharpOperation?.operationKind === "method" && csharpOperation.argumentProjection !== undefined) {
    const receiver = planExpression(expression.Expression!, sourceFile, input, diagnostics);
    const arguments_ = planCsharpTargetOperationArguments(csharpOperation, elementAccess, expression.ArgumentExpression, sourceFile, input, diagnostics, planExpression);
    if (arguments_ === undefined) {
      return invalidExpression("selected target element access arguments");
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
    return invalidExpression("selected target element access operation");
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "ElementAccessExpression" : "ConditionalElementAccessExpression",
    receiver: selectedElementAccess === undefined
      ? planExpression(expression.Expression!, sourceFile, input, diagnostics)
      : planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression),
    argument: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics),
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
    return invalidExpression("optional tuple element access");
  }
  if (receiverNode === undefined || argumentNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Tuple element access requires finalized receiver and argument facts before C# emission."));
    return invalidExpression("tuple element access source facts");
  }
  const index = getFinalizedTupleElementIndex(argumentNode, sourceFile, input);
  if (index === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Tuple element access requires a finalized numeric-literal index type before C# emission."));
    return invalidExpression("tuple element access index fact");
  }
  const elementCarrier = receiverCarrier.elements[index];
  if (elementCarrier === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `Tuple element access index ${index} requires a finalized tuple element carrier before C# emission.`));
    return invalidExpression("tuple element access carrier fact");
  }
  if (csharpTypeFromTargetTypeRef(elementCarrier) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `Tuple element access index ${index} requires a renderable tuple element carrier type before C# emission.`));
    return invalidExpression("tuple element access element type");
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: planExpression(receiverNode, sourceFile, input, diagnostics),
    name: `Item${index + 1}`,
  };
}

function getFinalizedTupleElementIndex(
  argumentNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): number | undefined {
  const argumentType = input.semantics.getTypeAtLocation(argumentNode, { sourceFile });
  if (argumentType === undefined) {
    return undefined;
  }
  const typeName = input.types.typeToString(argumentType, { sourceFile });
  if (!/^(0|[1-9]\d*)$/.test(typeName)) {
    return undefined;
  }
  const index = Number(typeName);
  return Number.isSafeInteger(index) ? index : undefined;
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
): CsharpExpression {
  const expression = AsCallExpression(node)!;
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  const selectedTargetCall = input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined) {
    const csharpOperation = getRequiredCsharpTargetMemberOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# call emission");
    if (csharpOperation === undefined) {
      return invalidExpression("missing C# target call operation fact");
    }
    const member = csharpOperation.selectedMember;
    if (member === undefined) {
      return invalidExpression("missing selected target call member");
    }
    return {
      kind: "InvocationExpression",
      callee: planSelectedTargetCallee(expression.Expression, csharpOperation, sourceFile, input, diagnostics, planExpression),
      arguments: planSelectedTargetCallArguments(expression.Expression, expression, member, csharpOperation.argumentArrayLiteralElementTypes, sourceFile, input, diagnostics, planCallArgument),
    };
  }
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# call emission requires a source-owned callable or a selected target signature fact.", ownership);
    return invalidExpression("missing target call fact");
  }
  return {
    kind: "InvocationExpression",
    callee: planExpression(expression.Expression!, sourceFile, input, diagnostics),
    arguments: (expression.Arguments?.Nodes ?? [])
      .filter((argument): argument is Node => argument !== undefined)
      .map((argument, index) => {
        const expected = getResolvedSourceCallArgumentExpectation(node, index, sourceFile, input);
        return planCallArgument(argument, sourceFile, input, diagnostics, expected?.type, expected?.subject);
      }),
  };
}

function getResolvedSourceCallArgumentExpectation(
  call: Node,
  argumentIndex: number,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): { readonly type?: CsharpTypeNode; readonly subject?: Node } | undefined {
  const declaration = input.semantics.getResolvedCallParameterDeclarations(call, { sourceFile })?.[argumentIndex];
  const declarationType = getNodeType(declaration);
  const carrier = input.semantics.getResolvedCallParameterRuntimeCarriers(call, { sourceFile })?.[argumentIndex];
  if (carrier !== undefined) {
    const targetType = csharpTypeFromTargetTypeRef(carrier);
    if (targetType !== undefined) {
      return { type: targetType, subject: declarationType ?? declaration };
    }
  }
  const parameterType = input.semantics.getResolvedCallParameterTypes(call, { sourceFile })?.[argumentIndex];
  const targetType = getTargetTypeRefForType(input, parameterType, sourceFile);
  const renderedType = targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
  const subject = declarationType ?? declaration;
  return renderedType === undefined && declaration === undefined
    ? undefined
    : { ...(renderedType !== undefined ? { type: renderedType } : {}), ...(subject !== undefined ? { subject } : {}) };
}

function getNodeType(node: Node | undefined): Node | undefined {
  return (node as { readonly Type?: Node } | undefined)?.Type;
}
