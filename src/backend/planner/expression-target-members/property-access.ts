import {
  AsPropertyAccessExpression,
  isAstNode,
  Node_Text,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import type {
  CsharpTargetOperationFact,
} from "../../../source/csharp-facts.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  planIdentifierName,
} from "../names.js";
import {
  getSemanticOwnership,
  pushMissingTargetFactDiagnostic,
} from "../semantic-guards.js";
import {
  planProjectSourceModuleMemberReference,
  tryPlanProjectSourceModuleStaticMemberReference,
} from "../expression-source-references.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  planSelectedTargetReceiverExpression,
  targetStaticMemberExpression,
} from "../expression-selected-target-members.js";
import {
  tryPlanRuntimeUnionProjectionToTargetType,
} from "../runtime-union-projections.js";
import {
  isCsharpSourceOwnedPropertyOperation,
  csharpTargetOperationFactKey,
  csharpObjectShapeMemberLookupFailureMessage,
  resolveCsharpObjectShapeMemberByFinalizedSourceName,
} from "../../../source/csharp-facts.js";
import {
  getRequiredCsharpTargetOperation,
} from "../csharp-target-operations.js";
import {
  getCsharpObjectShapeFactForNode,
} from "../csharp-fact-queries.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  csharpTypeFromTargetTypeRefWithObjectShapeDeclarations,
} from "../target-type-object-shapes.js";
import {
  sameCsharpType,
} from "../csharp-type-equality.js";
import {
  tryPlanCompatRuntimePropertyGet,
} from "../compat-runtime-operations.js";
import {
  getTargetTypeRefForNode,
} from "../runtime-carriers.js";
import {
  targetTypeRefEquals,
} from "../../../source/csharp-source-semantics/target-ref-utils.js";
import {
  unwrapNullableTargetType,
} from "../../../source/csharp-source-semantics/target-rules.js";

export function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const sourceName = Node_Text(input.ast, expression.name!);
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
    return planSourceOwnedPropertyAccess(propertyAccess, expression, sourceName, sourceFile, input, diagnostics, planExpression);
  } else if (targetOperation !== undefined && targetOperation.operationKind === "property") {
    const csharpOperation = getRequiredCsharpTargetOperation(input, propertyAccess, targetOperation, diagnostics, "C# property access emission");
    if (csharpOperation === undefined) {
      return undefined;
    }
    return planFinalizedCsharpPropertyOperation(propertyAccess, expression, csharpOperation, sourceFile, input, diagnostics, planExpression);
  }
  if (!sourceOwnedPropertyOperation && targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Property access '${sourceName}' expected a provider property fact, but provider selected a ${targetOperation.operationKind} operation.`));
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

function planSourceOwnedPropertyAccess(
  propertyAccess: Node,
  expression: NonNullable<ReturnType<typeof AsPropertyAccessExpression>>,
  sourceName: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const receiver = planExpression(expression.Expression!, sourceFile, input, diagnostics);
  if (receiver === undefined) {
    return undefined;
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: applySelectedDeclaringReceiverProjection(propertyAccess, expression.Expression!, receiver, getSelectedSourceOperationDeclaringType(propertyAccess, sourceFile, input), sourceFile, input, diagnostics),
    name: planIdentifierName(expression.name, "InvalidPropertyName", input, diagnostics, `Source-owned property '${sourceName}'`),
  };
}

function applySelectedDeclaringReceiverProjection(
  propertyAccess: Node,
  receiverNode: Node,
  receiver: CsharpExpression,
  operationDeclaringType: ReturnType<typeof getTargetTypeRefForNode>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  if (operationDeclaringType === undefined) {
    return receiver;
  }
  const diagnosticStart = diagnostics.length;
  const runtimeUnionProjection = tryPlanRuntimeUnionProjectionToTargetType(receiverNode, operationDeclaringType, sourceFile, input, diagnostics, receiver);
  if (runtimeUnionProjection !== undefined) {
    return runtimeUnionProjection;
  }
  if (diagnostics.length > diagnosticStart) {
    return receiver;
  }
  const receiverObjectShape = getCsharpObjectShapeFactForNode(receiverNode, sourceFile, input);
  if (
    receiverObjectShape !== undefined &&
    (targetTypeRefEquals(receiverObjectShape.targetType, operationDeclaringType) ||
      receiverRendersAsSelectedDeclaringType(receiverObjectShape.targetType, operationDeclaringType, propertyAccess, input, diagnostics))
  ) {
    return receiver;
  }
  const declaredReceiverType = getDeclaredReceiverTargetType(receiverNode, sourceFile, input);
  const unwrappedDeclaredReceiverType = unwrapNullableTargetType(declaredReceiverType);
  if (
    unwrappedDeclaredReceiverType !== undefined &&
    (targetTypeRefEquals(unwrappedDeclaredReceiverType, operationDeclaringType) ||
      receiverRendersAsSelectedDeclaringType(unwrappedDeclaredReceiverType, operationDeclaringType, propertyAccess, input, diagnostics) ||
      receiverExtendsSelectedDeclaringType(unwrappedDeclaredReceiverType, operationDeclaringType, input) ||
      receiverSatisfiesOpenSelectedDeclaringType(unwrappedDeclaredReceiverType, operationDeclaringType))
  ) {
    return receiver;
  }
  const castType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, operationDeclaringType, diagnostics, propertyAccess);
  if (castType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, "Source-owned narrowed property access requires a renderable selected declaring target type before C# emission."));
    return receiver;
  }
  return {
    kind: "ParenthesizedExpression",
    expression: {
      kind: "CastExpression",
      type: castType,
      expression: receiver,
    },
  };
}

function receiverRendersAsSelectedDeclaringType(
  receiverType: ReturnType<typeof unwrapNullableTargetType>,
  declaringType: ReturnType<typeof getTargetTypeRefForNode>,
  propertyAccess: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): boolean {
  if (receiverType === undefined || declaringType === undefined) {
    return false;
  }
  const receiverCsharpType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, receiverType, diagnostics, propertyAccess);
  const declaringCsharpType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, declaringType, diagnostics, propertyAccess);
  return receiverCsharpType !== undefined &&
    declaringCsharpType !== undefined &&
    sameCsharpType(receiverCsharpType, declaringCsharpType);
}

function receiverSatisfiesOpenSelectedDeclaringType(
  receiverType: ReturnType<typeof unwrapNullableTargetType>,
  declaringType: ReturnType<typeof getTargetTypeRefForNode>,
): boolean {
  if (receiverType === undefined || declaringType === undefined) {
    return false;
  }
  if (receiverType.kind === "array" && declaringType.kind === "array") {
    return declaringType.element.kind === "type-parameter";
  }
  if (receiverType.kind === "target-named" && declaringType.kind === "target-named" && receiverType.id === declaringType.id) {
    const declaringArguments = declaringType.typeArguments ?? [];
    const receiverArguments = receiverType.typeArguments ?? [];
    return declaringArguments.length === receiverArguments.length &&
      declaringArguments.length > 0 &&
      declaringArguments.every((argument) => argument.kind === "type-parameter");
  }
  return false;
}

function receiverExtendsSelectedDeclaringType(
  receiverType: ReturnType<typeof unwrapNullableTargetType>,
  declaringType: ReturnType<typeof getTargetTypeRefForNode>,
  input: TargetCompileInput,
): boolean {
  if (receiverType === undefined || declaringType === undefined) {
    return false;
  }
  for (let baseType = getCsharpBaseTargetType(receiverType, input); baseType !== undefined; baseType = getCsharpBaseTargetType(baseType, input)) {
    if (targetTypeRefEquals(baseType, declaringType)) {
      return true;
    }
  }
  return false;
}

function getCsharpBaseTargetType(
  type: ReturnType<typeof unwrapNullableTargetType>,
  input: TargetCompileInput,
): ReturnType<typeof unwrapNullableTargetType> {
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const metadataBaseType = unwrapNullableTargetType((type as { readonly csharpBaseType?: ReturnType<typeof unwrapNullableTargetType> }).csharpBaseType);
  if (metadataBaseType !== undefined) {
    return metadataBaseType;
  }
  return getSourceClassBaseTargetType(type, input);
}

function getSourceClassBaseTargetType(
  type: Extract<ReturnType<typeof unwrapNullableTargetType>, { readonly kind: "target-named" }>,
  input: TargetCompileInput,
): ReturnType<typeof unwrapNullableTargetType> {
  if ((type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== "class") {
    return undefined;
  }
  const declaration = findSourceClassDeclarationByTargetId(type.id, input);
  const heritage = declaration === undefined ? undefined : input.ast.extendsHeritageElements(declaration)[0];
  if (heritage === undefined) {
    return undefined;
  }
  const expression = getNodeField(heritage, "Expression") ??
    getNodeField(heritage, "expression") ??
    heritage;
  const expressionSourceFile = input.ast.getSourceFile(expression) ?? input.ast.getSourceFile(declaration);
  return expressionSourceFile === undefined
    ? undefined
    : unwrapNullableTargetType(getTargetTypeRefForNode(input, expression, expressionSourceFile));
}

function findSourceClassDeclarationByTargetId(
  targetId: string,
  input: TargetCompileInput,
): Node | undefined {
  for (const sourceFile of input.sourceFiles) {
    const declaration = findSourceClassDeclarationByTargetIdInSubtree(sourceFile, targetId, input);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

function findSourceClassDeclarationByTargetIdInSubtree(
  node: Node,
  targetId: string,
  input: TargetCompileInput,
): Node | undefined {
  if (input.ast.kindName(node) === "KindClassDeclaration" && getSourceClassDeclarationTargetId(node, input) === targetId) {
    return node;
  }
  for (const child of input.ast.children(node)) {
    if (child === undefined) {
      continue;
    }
    const declaration = findSourceClassDeclarationByTargetIdInSubtree(child, targetId, input);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

function getSourceClassDeclarationTargetId(
  declaration: Node,
  input: TargetCompileInput,
): string | undefined {
  const name = getNodeField(declaration, "name");
  if (name === undefined) {
    return undefined;
  }
  const text = input.ast.text(name);
  return text.length === 0 ? undefined : text;
}

function getSelectedSourceOperationDeclaringType(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<typeof getTargetTypeRefForNode> {
  const operation = input.facts.getFact(propertyAccess, csharpTargetOperationFactKey);
  return operation?.kind === "member"
    ? operation.declaringType ?? getSourceDeclaringTargetType(operation.sourceDeclaringType, sourceFile, input)
    : undefined;
}

function getSourceDeclaringTargetType(
  sourceDeclaringType: unknown,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<typeof getTargetTypeRefForNode> {
  if (!isAstNode(sourceDeclaringType)) {
    return undefined;
  }
  return getTargetTypeRefForNode(
    input,
    sourceDeclaringType,
    input.ast.getSourceFile(sourceDeclaringType) ?? sourceFile,
  );
}

function getDeclaredReceiverTargetType(
  receiverNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReturnType<typeof getTargetTypeRefForNode> {
  const reference = input.analysis.getProjectSourceReferenceForNode(receiverNode, { sourceFile });
  const declaration = reference?.declaration;
  const typeNode = declaration === undefined ? undefined : getNodeField(declaration, "Type");
  if (typeNode !== undefined) {
    return getTargetTypeRefForNode(input, typeNode, reference?.sourceFile ?? sourceFile);
  }
  const declarationName = declaration === undefined
    ? undefined
    : getNodeField(declaration, "name") ?? getNodeField(declaration, "Name");
  const declarationNameType = getTargetTypeRefForNode(input, declarationName, reference?.sourceFile ?? sourceFile);
  if (declarationNameType !== undefined) {
    return declarationNameType;
  }
  const receiverType = getTargetTypeRefForNode(input, receiverNode, sourceFile);
  if (receiverType !== undefined) {
    return receiverType;
  }
  return declaration === undefined
    ? undefined
    : getTargetTypeRefForNode(input, declaration, reference?.sourceFile ?? sourceFile);
}

function getNodeField(node: Node, field: string): Node | undefined {
  const value = Object.getOwnPropertyDescriptor(node, field)?.value;
  return isAstNode(value) ? value : undefined;
}

function planFinalizedCsharpPropertyOperation(
  propertyAccess: Node,
  expression: NonNullable<ReturnType<typeof AsPropertyAccessExpression>>,
  csharpOperation: CsharpTargetOperationFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
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
    receiver: applySelectedDeclaringReceiverProjection(propertyAccess, expression.Expression!, receiverExpression, csharpOperation.declaringType, sourceFile, input, diagnostics),
    name: csharpOperation.memberName,
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
  const memberLookup = resolveCsharpObjectShapeMemberByFinalizedSourceName(objectShape, sourceName, "checked-property-access");
  if (memberLookup.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, csharpObjectShapeMemberLookupFailureMessage(memberLookup, "Object-shape property access")));
    return undefined;
  }
  const member = memberLookup.member;
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
