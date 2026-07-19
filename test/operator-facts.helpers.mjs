import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeCarrierFactKey, targetOperationFactKey } from "@tsonic/tsts";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import { planExpression, planExpressionWithExpectedType } from "../dist/backend/planner/expressions.js";
import {
  createDestructuringPlannerState,
} from "../dist/backend/planner/bindings.js";
import {
  KindArrowFunction,
  KindArrayLiteralExpression,
  KindAwaitExpression,
  KindBigIntLiteral,
  KindConditionalExpression,
  KindIdentifier,
  KindNoSubstitutionTemplateLiteral,
  KindObjectLiteralExpression,
  KindParameter,
  KindPostfixUnaryExpression,
  KindPropertyAccessExpression,
  KindMethodDeclaration,
  KindPrefixUnaryExpression,
  KindRegularExpressionLiteral,
  KindThisKeyword,
  KindTemplateExpression,
  ModifierFlagsAsync,
  ModifierFlagsStatic,
} from "../dist/backend/planner/source-ast.js";
import { printCsharpExpression } from "../dist/print/csharp-printer.js";
import {
  csharpObjectShapeFactKey,
  csharpRegularExpressionLiteralFactKey,
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpBigIntegerTargetType,
  csharpDelegateTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpStringTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpTaskTargetType,
  csharpVoidTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import {
  mapCsharpCheckedOperator,
} from "../dist/source/csharp-source-semantics/checked-operator-mapping/index.js";
import {
  targetOperationFactsAreStructurallyIdentical,
} from "../dist/source/csharp-source-semantics/operations.js";
export { test, assert, runtimeCarrierFactKey, targetOperationFactKey, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, planExpression, planExpressionWithExpectedType, createDestructuringPlannerState, KindArrowFunction, KindArrayLiteralExpression, KindAwaitExpression, KindBigIntLiteral, KindConditionalExpression, KindIdentifier, KindNoSubstitutionTemplateLiteral, KindObjectLiteralExpression, KindParameter, KindPostfixUnaryExpression, KindPropertyAccessExpression, KindMethodDeclaration, KindPrefixUnaryExpression, KindRegularExpressionLiteral, KindThisKeyword, KindTemplateExpression, ModifierFlagsAsync, ModifierFlagsStatic, printCsharpExpression, csharpObjectShapeFactKey, csharpRegularExpressionLiteralFactKey, csharpTargetOperationFactKey, csharpBigIntegerTargetType, csharpDelegateTargetType, csharpNullableValueTargetType, csharpQualifiedTypeRenderShape, csharpStringTargetType, csharpSourcePrimitiveTargetType, csharpTargetNamedType, csharpTaskTargetType, csharpVoidTargetType, mapCsharpCheckedOperator, targetOperationFactsAreStructurallyIdentical };














































export function binary(left, right, operatorKind = "KindPlusToken") {
  return {
    Kind: "KindBinaryExpression",
    Left: left,
    Right: right,
    OperatorToken: { Kind: operatorKind },
  };
}

export function checkedOperatorRequest({ expression, operator, left, right, target = "csharp" }) {
  const sourceResult = { expression, type: expression };
  if (right !== undefined) {
    return {
      sourceOperationKind: "operator",
      operatorKind: "binary",
      expression,
      operator,
      left,
      right,
      sourceLeft: { expression: left, type: left },
      sourceRight: { expression: right, type: right },
      sourceResult,
      target,
    };
  }
  const operatorKind = expression.Kind === KindPostfixUnaryExpression
    ? "postfix-update"
    : operator === "++" || operator === "--"
      ? "prefix-update"
      : "prefix-unary";
  return {
    sourceOperationKind: "operator",
    operatorKind,
    expression,
    operator,
    operand: left,
    sourceOperand: { expression: left, type: left },
    sourceResult,
    target,
  };
}

export function conditional(condition, whenTrue, whenFalse) {
  return {
    Kind: KindConditionalExpression,
    Condition: condition,
    WhenTrue: whenTrue,
    WhenFalse: whenFalse,
  };
}

export function awaitExpression(expression) {
  return {
    Kind: KindAwaitExpression,
    Expression: expression,
  };
}

export function asyncArrowFunction(body) {
  return {
    Kind: KindArrowFunction,
    ModifierFlags: ModifierFlagsAsync,
    Parameters: { Nodes: [] },
    Body: body,
  };
}

export function asyncArrowFunctionWithParameters(parameters, body) {
  return {
    Kind: KindArrowFunction,
    ModifierFlags: ModifierFlagsAsync,
    Parameters: { Nodes: parameters },
    Body: body,
  };
}

export function block(statements) {
  return {
    Kind: "KindBlock",
    Statements: { Nodes: statements },
  };
}

export function returnStatement(expression) {
  return {
    Kind: "KindReturnStatement",
    Expression: expression,
  };
}

export function objectLiteral(properties) {
  return {
    Kind: KindObjectLiteralExpression,
    Properties: { Nodes: properties },
  };
}

export function propertyAssignment(name, initializer) {
  return {
    Kind: "KindPropertyAssignment",
    name,
    Initializer: initializer,
  };
}

export function objectShape(targetType, members) {
  return {
    targetType,
    members,
    implements: [],
  };
}

export function thisKeyword() {
  return {
    Kind: KindThisKeyword,
  };
}

export function node(kind, properties = {}) {
  return {
    Kind: kind,
    ...properties,
  };
}

export function parented(child, parent) {
  child.Parent = parent;
  return child;
}

export function identifier(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

export function numericLiteral(text) {
  return {
    Kind: "KindNumericLiteral",
    Text: text,
  };
}

export function propertyAccess(receiver, name) {
  return {
    Kind: KindPropertyAccessExpression,
    Expression: receiver,
    name: identifier(name),
  };
}

export function templateExpression(head, expression, tail) {
  return {
    Kind: KindTemplateExpression,
    Head: { Text: head },
    TemplateSpans: {
      Nodes: [{
        Expression: expression,
        Literal: { Text: tail },
      }],
    },
  };
}

export function sourcePrimitiveCarrier(name) {
  return {
    carrier: {
      kind: "source-primitive",
      name,
    },
  };
}

export function fakeOperatorHost(providerType) {
  const binding = {
    id: providerType.id,
    target: "csharp",
    kind: "struct",
    sourceName: "Number",
    targetName: "ProviderOperators.Number",
  };
  return {
    getTargetTypeRefForSubject: (subject) => subject?.Kind === KindIdentifier ? providerType : undefined,
    getCsharpTargetBindingByTargetId: (targetId) => targetId === providerType.id ? binding : undefined,
  };
}

export function fakeOperatorHostWithSubjects(targetTypes) {
  return {
    getTargetTypeRefForSubject: (subject) => targetTypes.get(subject),
    getCsharpTargetBindingByTargetId: () => undefined,
  };
}

export function fakeObservationContext(entries = new Map()) {
  const writes = [];
  return {
    writes,
    extensionId: "tsonic.csharp.operations",
    facts: {
      get: (subject, key) => entries.get(factEntryKey(subject, key)),
      set: (subject, key, value, evidence = []) => {
        writes.push({ subject, key, value, evidence });
        entries.set(factEntryKey(subject, key), value);
        return "inserted";
      },
    },
    factResolver: {
      resolve: (subject, key) => entries.get(factEntryKey(subject, key)),
    },
  };
}

export function factEntryKey(subject, key) {
  return `${subject?.Text ?? subject?.Kind ?? "subject"}:${key.id}`;
}

export function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: (subject) => subject === options.selectedOperatorSubject ? options.selectedOperator : undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: (subject) =>
        options.runtimeCarrierFacts?.get(subject) ??
        (subject === options.runtimeCarrierSubject
          ? options.runtimeCarrier
          : undefined),
      getObjectShapeFact: () => undefined,
      getTargetBindingFact: (subject) => subject !== undefined && subject === options.targetBindingSubject
        ? { target: "csharp", id: "Example.Target", sourceName: "Target", targetName: "Target", kind: "class" }
        : undefined,
      getSourcePrimitiveFact: (subject) => subject === options.sourcePrimitiveSubject
        ? { kind: "int32", runtimeBase: "number", signed: true, width: 32 }
        : undefined,
      getFact: (subject, key) => {
        if (key === csharpObjectShapeFactKey) {
          return options.objectShapeFacts?.get(subject);
        }
        if (subject === options.csharpOperationSubject && key === csharpTargetOperationFactKey) {
          return options.csharpOperation;
        }
        if (subject === options.regexpLiteralSubject && key === csharpRegularExpressionLiteralFactKey) {
          return options.regexpLiteral;
        }
        return undefined;
      },
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getObjectShapeForNode: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolAtLocation: () => undefined,
      getTypeAtLocation: (subject) => options.typeAtLocations?.get(subject) ?? options.typeAtLocation,
      getTypeFromTypeNode: () => options.typeAtLocation,
      describeTypeAtLocation: () => undefined,
      isProjectSourceShapeForNode: () => false,
      isProjectSourceConstructibleObjectForNode: () => false,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => runtimeCarrierResolution(options, subject),
      resolveRuntimeCarrierForNode: (subject) => runtimeCarrierResolution(options, subject),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
    types: {
      isAny: () => false,
      isUnknown: () => false,
      isNumberLike: () => false,
      isStringLike: () => false,
      isBooleanLike: () => false,
      isBigIntLike: () => false,
      isVoidLike: () => false,
      isUnion: () => false,
      isTuple: () => false,
      isArrayLike: () => false,
      isTypeReference: () => false,
      isNullish: (type) => options.nullishTypes?.has(type) === true,
      getCallSignatures: () => [],
      getReturnTypeOfSignature: () => undefined,
      getUnionOrIntersectionTypes: () => [],
      getTupleElementTypes: () => [],
      getTypeArguments: () => [],
      getIndexInfos: () => [],
      getTypeReferenceTarget: (type) => type,
    },
  };
}

export function runtimeCarrierResolution(options, subject) {
  const fact = options.runtimeCarrierFacts?.get(subject) ??
    (subject === options.runtimeCarrierSubject ? options.runtimeCarrier : undefined);
  return fact === undefined
    ? missingCarrierResolution(options.missingRuntimeCarrierReason, options.missingRuntimeCarrierEvidence)
    : resolvedCarrierResolution(fact.carrier);
}

const asKind = (kind) => (node) => node?.Kind === kind ? node : undefined;

export const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  text: (node) => String(node?.Text ?? ""),
  children: (node) => node?.Children ?? node?.Types ?? [],
  typeArguments: (node) => node?.TypeArguments?.Nodes ?? [],
  parent: (node) => node?.Parent,
  name: (node) => node?.name,
  hasModifier: (node, flag) => ((node?.ModifierFlags ?? 0) & flag) !== 0,
  getSourceFile: () => undefined,
  as: {
    AsPropertyAccessExpression: asKind(KindPropertyAccessExpression),
    AsElementAccessExpression: asKind("KindElementAccessExpression"),
    AsCallExpression: asKind("KindCallExpression"),
    AsNewExpression: asKind("KindNewExpression"),
    AsParenthesizedExpression: asKind("KindParenthesizedExpression"),
    AsTypeAssertion: asKind("KindTypeAssertionExpression"),
    AsAsExpression: asKind("KindAsExpression"),
    AsSatisfiesExpression: asKind("KindSatisfiesExpression"),
    AsNonNullExpression: asKind("KindNonNullExpression"),
    AsSpreadElement: asKind("KindSpreadElement"),
    AsDeleteExpression: asKind("KindDeleteExpression"),
    AsTypeOfExpression: asKind("KindTypeOfExpression"),
    AsVoidExpression: asKind("KindVoidExpression"),
    AsAwaitExpression: asKind(KindAwaitExpression),
  },
  is: new Proxy({
    IsKeywordTypeNode: () => false,
    IsTypeReferenceNode: () => false,
    IsUnionTypeNode: () => false,
    IsIntersectionTypeNode: () => false,
    IsConditionalTypeNode: () => false,
    IsInferTypeNode: () => false,
    IsArrayTypeNode: () => false,
    IsIndexedAccessTypeNode: () => false,
    IsLiteralTypeNode: () => false,
    IsThisTypeNode: () => false,
    IsMappedTypeNode: () => false,
    IsTupleTypeNode: () => false,
    IsOptionalTypeNode: () => false,
    IsRestTypeNode: () => false,
    IsParenthesizedTypeNode: () => false,
    IsFunctionTypeNode: () => false,
    IsConstructorTypeNode: () => false,
    IsTemplateLiteralTypeNode: () => false,
    IsImportTypeNode: () => false,
  }, {
    get(target, property) {
      return property in target ? target[property] : () => false;
    },
  }),
};
