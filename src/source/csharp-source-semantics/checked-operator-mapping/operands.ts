import {
  runtimeCarrierFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperatorMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../../csharp-facts.js";
import {
  csharpSourcePrimitiveTargetType,
} from "../target-types.js";
import {
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
  isSourceEnumTargetTypeRef,
} from "../target-rules.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import {
  isLiteralRepresentableAsTargetType,
} from "../target-member-selection.js";
import {
  asNodeSubject,
  getNodeField,
  isSemanticTypeQueryableValueExpressionNode,
} from "../ast-utils.js";
import {
  sourceDeclarationTargetType,
} from "../source-declaration-facts.js";
import {
  getReferencedRuntimeCarrierTargetTypeRef,
} from "../runtime-carrier-lifecycle/referenced-facts.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  getLiteralTargetTypeRefForKnownOperatorOperand,
  getNullishTargetTypeRefForKnownOperatorOperand,
} from "./operator-rules.js";

export function getOperatorSourceFile(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): SourceFile | undefined {
  const node = asNodeSubject(subject);
  return node === undefined ? undefined : context.compiler?.ast.getSourceFile(node);
}

export function getCheckedOperatorOperandTargetTypeRefs(
  request: CheckedOperatorMappingRequest,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  operandQuery: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): { readonly left: TargetTypeRef | undefined; readonly right: TargetTypeRef | undefined } {
  const leftType = getCheckedOperandType(request.left, sourceFile, context);
  const rightType = getCheckedOperandType(request.right, sourceFile, context);
  let left = getCheckedOperatorOperandTargetTypeRef(leftType, request.left, sourceFile, context, operandQuery, host);
  let right = getCheckedOperatorOperandTargetTypeRef(rightType, request.right, sourceFile, context, operandQuery, host);
  if (request.right === undefined && left === undefined) {
    left = context.factResolver.resolve(request.expression, runtimeCarrierFactKey)?.carrier;
  }
  if (right === undefined) {
    right = getLiteralTargetTypeRefForKnownOperatorOperand(left, request.right, context) ??
      getNullishTargetTypeRefForKnownOperatorOperand(left, request.right, sourceFile, context);
  }
  if (left === undefined) {
    left = getLiteralTargetTypeRefForKnownOperatorOperand(right, request.left, context) ??
      getNullishTargetTypeRefForKnownOperatorOperand(right, request.left, sourceFile, context);
  }
  if (operatorAllowsLiteralOperandNarrowing(request.operator)) {
    right = getLiteralTargetTypeRefForKnownOperatorOperand(left, request.right, context) ?? right;
    left = getLiteralTargetTypeRefForKnownOperatorOperand(right, request.left, context) ?? left;
  }
  return { left, right };
}

function operatorAllowsLiteralOperandNarrowing(operator: string): boolean {
  switch (operator) {
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
      return true;
    default:
      return false;
  }
}

function getCheckedOperandType(
  subject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
): ExtensionFactSubject | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  return node === undefined || context.compiler === undefined ||
    ast?.is.IsBinaryExpression(node) === true ||
    ast?.is.IsPrefixUnaryExpression(node) === true ||
    ast?.is.IsPostfixUnaryExpression(node) === true
    ? undefined
    : context.compiler.checker.getTypeAtLocation(node, { sourceFile });
}

export function getBitwiseLiteralOperandTargetTypeRefs(
  operator: string,
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
  leftSubject: ExtensionFactSubject | undefined,
  rightSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): { readonly left: TargetTypeRef | undefined; readonly right: TargetTypeRef | undefined } {
  if (!isCsharpBitwiseOperator(operator)) {
    return { left, right };
  }
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const enumLeft = getContainingEnumDeclarationTargetType(leftSubject, context);
  const enumRight = getContainingEnumDeclarationTargetType(rightSubject, context);
  const normalizedLeft = isIntegralTargetTypeRef(left) || isSourceEnumTargetTypeRef(left)
    ? left
    : enumLeft !== undefined
      ? enumLeft
    : isLiteralRepresentableAsTargetType(int32, leftSubject, context)
      ? int32
      : left;
  const normalizedRight = rightSubject === undefined || isIntegralTargetTypeRef(right) || isSourceEnumTargetTypeRef(right)
    ? right
    : enumRight !== undefined
      ? enumRight
    : isLiteralRepresentableAsTargetType(int32, rightSubject, context)
      ? int32
      : right;
  return { left: normalizedLeft, right: normalizedRight };
}

function getCheckedOperatorOperandTargetTypeRef(
  typeSubject: ExtensionFactSubject | undefined,
  expressionSubject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const selectedOperationResult = expressionSubject === undefined
    ? undefined
    : context.facts.get(expressionSubject, csharpTargetOperationFactKey)?.resultType ??
      context.factResolver.resolve(expressionSubject, csharpTargetOperationFactKey)?.resultType;
  if (selectedOperationResult !== undefined) {
    return selectedOperationResult;
  }
  const referencedDeclarationTarget = getReferencedOperandTargetTypeRef(expressionSubject, sourceFile, context);
  if (referencedDeclarationTarget !== undefined) {
    return referencedDeclarationTarget;
  }
  const annotatedDeclarationTarget = getAnnotatedDeclarationOperandTargetTypeRef(expressionSubject, sourceFile, context, options, host);
  if (annotatedDeclarationTarget !== undefined) {
    return annotatedDeclarationTarget;
  }
  const expressionTarget = host.getTargetTypeRefForSubject(expressionSubject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (expressionTarget !== undefined && expressionTarget.kind !== "type-parameter") {
    return expressionTarget;
  }
  const checkedExpressionType = getCheckedExpressionTargetTypeRef(expressionSubject, sourceFile, context, options, host);
  if (checkedExpressionType !== undefined && checkedExpressionType.kind !== "type-parameter") {
    return checkedExpressionType;
  }
  const typedCarrier = getMappedRuntimeCarrierTargetTypeRef(typeSubject, context, host);
  if (typedCarrier !== undefined) {
    return typedCarrier;
  }
  const typed = host.getTargetTypeRefForSubject(typeSubject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (typed !== undefined) {
    return typed;
  }
  return expressionTarget ?? checkedExpressionType;
}

function getAnnotatedDeclarationOperandTargetTypeRef(
  expressionSubject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const node = asNodeSubject(expressionSubject);
  const compiler = context.compiler;
  if (node === undefined || sourceFile === undefined || compiler === undefined || !compiler.ast.is.IsIdentifier(node)) {
    return undefined;
  }
  const symbol = compiler.checker.getSymbolAtLocation(node, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(node, { sourceFile });
  for (const declaration of getSymbolDeclarations(symbol, compiler.checker)) {
    const typeNode = asNodeSubject(getNodeField(declaration, "Type")) ??
      asNodeSubject(getNodeField(declaration, "type"));
    if (typeNode === undefined) {
      continue;
    }
    const typeSourceFile = compiler.ast.getSourceFile(typeNode) ?? sourceFile;
    const typeName = asNodeSubject(getNodeField(typeNode, "TypeName")) ??
      asNodeSubject(getNodeField(typeNode, "typeName")) ??
      compiler.ast.name(typeNode);
    const primitiveSubjects: readonly (ExtensionFactSubject | undefined)[] = [
      typeNode,
      typeName,
    ];
    const primitive = primitiveSubjects
      .map((subject) => subject === undefined ? undefined : context.factResolver.resolve(subject, sourcePrimitiveFactKey) ?? context.facts.get(subject, sourcePrimitiveFactKey))
      .find((fact): fact is NonNullable<typeof fact> => fact !== undefined);
    if (primitive !== undefined) {
      return csharpSourcePrimitiveTargetType(primitive.kind);
    }
    const targetType = host.getTargetTypeRefForSubject(typeNode, context, {
      ...options,
      sourceFile: typeSourceFile,
      allowRuntimeCarrier: false,
    }) ?? host.getTargetTypeRefForSubject(typeNode, context, {
      ...options,
      sourceFile: typeSourceFile,
      allowRuntimeCarrier: true,
    });
    if (targetType !== undefined) {
      return targetType;
    }
  }
  return undefined;
}

function getReferencedOperandTargetTypeRef(
  expressionSubject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const node = asNodeSubject(expressionSubject);
  return node === undefined || sourceFile === undefined
    ? undefined
    : getReferencedRuntimeCarrierTargetTypeRef(context, sourceFile, node);
}

function getCheckedExpressionTargetTypeRef(
  expressionSubject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  if (sourceFile === undefined) {
    return undefined;
  }
  const node = asNodeSubject(expressionSubject);
  const checker = context.compiler?.checker;
  if (
    node === undefined ||
    checker === undefined ||
    context.compiler?.ast === undefined ||
    !isSemanticTypeQueryableValueExpressionNode(context.compiler.ast, node)
  ) {
    return undefined;
  }
  try {
    return host.getTargetTypeRefForSubject(checker.getTypeAtLocation(node, { sourceFile }), context, {
      ...options,
      sourceFile,
    });
  } catch {
    return undefined;
  }
}

function getMappedRuntimeCarrierTargetTypeRef(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const mapped = host.mapRuntimeCarrier({ type: subject }, context as ExtensionObservationContext<"type.resolveRuntimeCarrier">);
  return mapped.kind === "accept" ? mapped.value.carrier : undefined;
}

function getContainingEnumDeclarationTargetType(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  let node = asNodeSubject(subject);
  if (ast === undefined || node === undefined || !ast.is.IsIdentifier(node)) {
    return undefined;
  }
  while (ast !== undefined && node !== undefined) {
    if (ast.kindName(node) === "KindEnumDeclaration") {
      const name = ast.name(node);
      return name === undefined
        ? undefined
        : sourceDeclarationTargetType(ast.text(name), "KindEnumDeclaration");
    }
    if (ast.kindName(node) === "KindSourceFile") {
      return undefined;
    }
    node = ast.parent(node);
  }
  return undefined;
}
