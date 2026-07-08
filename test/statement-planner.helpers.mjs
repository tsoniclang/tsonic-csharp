import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import {
  createDestructuringPlannerState,
} from "../dist/backend/planner/bindings.js";
import {
  planStatements,
} from "../dist/backend/planner/statements.js";
import {
  planLocalDeclaration,
} from "../dist/backend/planner/locals.js";
import {
  printCsharpType,
} from "../dist/print/csharp-printer.js";
import {
  KindBlock,
  KindBreakStatement,
  KindContinueStatement,
  KindDefaultClause,
  KindDoStatement,
  KindArrayLiteralExpression,
  KindAwaitExpression,
  KindBinaryExpression,
  KindEqualsToken,
  KindExpressionStatement,
  KindForStatement,
  KindForInStatement,
  KindForOfStatement,
  KindIdentifier,
  KindLabeledStatement,
  KindNumericLiteral,
  KindObjectBindingPattern,
  KindObjectLiteralExpression,
  KindSpreadElement,
  KindStringLiteral,
  KindSwitchStatement,
  KindTryStatement,
  KindTrueKeyword,
  KindVariableDeclaration,
  KindVariableDeclarationList,
  KindWhileStatement,
} from "../dist/backend/planner/source-ast.js";
import {
  csharpObjectShapeFactKey,
  csharpTargetOperationFactKey,
  csharpTargetIterationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpExceptionTargetType,
  csharpListTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpTaskTargetType,
  csharpVoidTargetType,
  csharpTsValueTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import {
  csharpJsArrayCarrierTargetType,
} from "../dist/source/csharp-source-semantics/surfaces/js/array-target-type.js";
export { test, assert, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, createDestructuringPlannerState, planStatements, planLocalDeclaration, printCsharpType, KindBlock, KindBreakStatement, KindContinueStatement, KindDefaultClause, KindDoStatement, KindArrayLiteralExpression, KindAwaitExpression, KindBinaryExpression, KindEqualsToken, KindExpressionStatement, KindForStatement, KindForInStatement, KindForOfStatement, KindIdentifier, KindLabeledStatement, KindNumericLiteral, KindObjectBindingPattern, KindObjectLiteralExpression, KindSpreadElement, KindStringLiteral, KindSwitchStatement, KindTryStatement, KindTrueKeyword, KindVariableDeclaration, KindVariableDeclarationList, KindWhileStatement, csharpObjectShapeFactKey, csharpTargetOperationFactKey, csharpTargetIterationFactKey, csharpExceptionTargetType, csharpListTargetType, csharpNullableValueTargetType, csharpQualifiedTypeRenderShape, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType, csharpTaskTargetType, csharpVoidTargetType, csharpTsValueTargetType, csharpJsArrayCarrierTargetType };










































export function switchStatement(expression, clauses) {
  return {
    Kind: KindSwitchStatement,
    Expression: expression,
    CaseBlock: {
      Kind: "KindCaseBlock",
      Clauses: { Nodes: clauses },
    },
  };
}

export function caseClause(expression, statements) {
  return {
    Kind: "KindCaseClause",
    Expression: expression,
    Statements: { Nodes: statements },
  };
}

export function defaultClause(statements) {
  return {
    Kind: KindDefaultClause,
    Statements: { Nodes: statements },
  };
}

export function labeledStatement(label, statement) {
  return {
    Kind: KindLabeledStatement,
    Label: identifier(label),
    Statement: statement,
  };
}

export function whileStatement(expression, statement) {
  return {
    Kind: KindWhileStatement,
    Expression: expression,
    Statement: statement,
  };
}

export function doStatement(expression, statement) {
  return {
    Kind: KindDoStatement,
    Expression: expression,
    Statement: statement,
  };
}

export function forStatement(initializer, condition, incrementor, statement) {
  return {
    Kind: KindForStatement,
    Initializer: initializer,
    Condition: condition,
    Incrementor: incrementor,
    Statement: statement,
  };
}

export function forOfStatement(initializer, expression, statement) {
  return {
    Kind: KindForOfStatement,
    Initializer: initializer,
    Expression: expression,
    Statement: statement,
  };
}

export function forInStatement(initializer, expression, statement) {
  return {
    Kind: KindForInStatement,
    Initializer: initializer,
    Expression: expression,
    Statement: statement,
  };
}

export function tryStatement(tryBlock, catchClauseNode, finallyBlock) {
  return {
    Kind: KindTryStatement,
    TryBlock: tryBlock,
    ...(catchClauseNode === undefined ? {} : { CatchClause: catchClauseNode }),
    ...(finallyBlock === undefined ? {} : { FinallyBlock: finallyBlock }),
  };
}

export function expressionStatement(expression) {
  return {
    Kind: KindExpressionStatement,
    Expression: expression,
  };
}

export function awaitExpression(expression) {
  return {
    Kind: KindAwaitExpression,
    Expression: expression,
  };
}

export function binaryExpression(left, right) {
  return {
    Kind: KindBinaryExpression,
    Left: left,
    Right: right,
    OperatorToken: { Kind: KindEqualsToken },
  };
}

export function catchClause(variableDeclarationNode, blockNode) {
  return {
    Kind: "KindCatchClause",
    ...(variableDeclarationNode === undefined ? {} : { VariableDeclaration: variableDeclarationNode }),
    Block: blockNode,
  };
}

export function variableDeclarationList(declarations) {
  return {
    Kind: KindVariableDeclarationList,
    Declarations: { Nodes: declarations },
  };
}

export function variableDeclaration(name, type) {
  return {
    Kind: KindVariableDeclaration,
    name: identifier(name),
    Type: type,
  };
}

export function block(statements) {
  return {
    Kind: KindBlock,
    Statements: { Nodes: statements },
  };
}

export function breakStatement(label) {
  return {
    Kind: KindBreakStatement,
    ...(label === undefined ? {} : { Label: label }),
  };
}

export function continueStatement(label) {
  return {
    Kind: KindContinueStatement,
    ...(label === undefined ? {} : { Label: label }),
  };
}

export function identifier(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

export function numeric(text) {
  return {
    Kind: KindNumericLiteral,
    Text: text,
  };
}

export function stringLiteral(text) {
  return {
    Kind: KindStringLiteral,
    Text: text,
  };
}

export function trueKeyword() {
  return {
    Kind: KindTrueKeyword,
  };
}

export function throwStatement(expression) {
  return {
    Kind: "KindThrowStatement",
    Expression: expression,
  };
}

export function typeNode(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

export function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: [],
    target: options.target ?? { id: "csharp", options: { typescriptCompatibility: "strict-native" } },
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: (subject) => options.selectedOperatorFacts?.get(subject),
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: (subject) => options.runtimeCarrierFacts?.get(subject),
      getObjectShapeFact: () => undefined,
      getTargetBindingFact: () => undefined,
      getSourcePrimitiveFact: () => undefined,
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
      getFact: (subject, key) => {
        if (key === csharpTargetIterationFactKey) {
          return options.iterationFacts?.get(subject);
        }
        if (key === csharpObjectShapeFactKey) {
          return options.objectShapeFacts?.get(subject);
        }
        if (key === csharpTargetOperationFactKey) {
          return options.csharpOperationFacts?.get(subject);
        }
        return undefined;
      },
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
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      describeTypeAtLocation: () => undefined,
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
      isNullish: () => false,
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
  const fact = options.resolvedRuntimeCarrierFacts?.get(subject) ??
    options.runtimeCarrierFacts?.get(subject);
  return fact === undefined
    ? missingCarrierResolution(options.missingRuntimeCarrierReason, options.missingRuntimeCarrierEvidence)
    : resolvedCarrierResolution(fact.carrier);
}

export const sourceFile = {
  FileName: "/src/index.ts",
  IsDeclarationFile: false,
};

export function providerReadOnlyIndexableTargetType(elementType) {
  return csharpTargetNamedType(
    "Example.ProviderReadOnlyIndexable`1",
    [elementType],
    csharpQualifiedTypeRenderShape("Example", "ProviderReadOnlyIndexable"),
    { readOnlyIndexableElementType: elementType },
  );
}

export const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  getSourceFile: () => sourceFile,
  is: {
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
  },
};

export function stringCodePointIterationFact() {
  return {
    operationId: "test.string.codePoints",
    iterationKind: "sync",
    lowering: {
      kind: "string-code-point",
      lengthMember: "Length",
      substringMember: "Substring",
      highSurrogateOperation: charSurrogateOperation("IsHighSurrogate"),
      lowSurrogateOperation: charSurrogateOperation("IsLowSurrogate"),
    },
    elementType: csharpStringTargetType(),
  };
}

export function charSurrogateOperation(memberName) {
  return {
    kind: "member",
    operationId: `System.Char.${memberName}`,
    operationKind: "method",
    memberName,
    static: true,
    declaringType: {
      kind: "target-named",
      id: "System.Char",
      csharpRender: { kind: "predefined", name: "char" },
    },
    resultType: csharpSourcePrimitiveTargetType("bool"),
  };
}

export function objectShapeFact(name, members) {
  return {
    targetType: {
      kind: "target-named",
      id: `Test.${name}`,
      csharpRender: { kind: "named", namespace: ["Test"], name },
    },
    members,
  };
}

export function recordDictionaryType(keyType, valueType) {
  return {
    kind: "target-named",
    id: "System.Collections.Generic.Dictionary`2",
    typeArguments: [keyType, valueType],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary" },
    csharpCollectionSurface: "record",
  };
}

export function dictionaryKeysOperation() {
  return {
    kind: "member",
    operationId: "System.Collections.Generic.Dictionary`2.Keys",
    operationKind: "property",
    memberName: "Keys",
    selectedMember: {
      id: "System.Collections.Generic.Dictionary`2.Keys",
      kind: "property",
      targetName: "Keys",
    },
  };
}
