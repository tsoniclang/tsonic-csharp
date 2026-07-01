import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import {
  AsBinaryExpression,
  AsObjectLiteralExpression,
  AsPropertyAssignment,
  AsShorthandPropertyAssignment,
  AsSpreadAssignment,
  AsSpreadElement,
  HasSourceKind,
  KindArrayLiteralExpression,
  KindArrayBindingPattern,
  KindBindingElement,
  KindBinaryExpression,
  KindEqualsToken,
  KindIdentifier,
  KindObjectLiteralExpression,
  KindObjectBindingPattern,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindSpreadElement,
  Node_Text,
  Node_Expression,
  SourceKind,
  SourceTokenKind,
} from "./source-ast.js";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import { allocateDestructuringTemp } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import type {
  BindingDefaultExpressionPlanner,
} from "./binding-array-patterns.js";
import { planArrayBindingPattern } from "./binding-array-patterns.js";
import {
  getCsharpTypeForExpressionCarrier,
} from "./binding-patterns.js";
import {
  planObjectBindingPattern,
} from "./binding-object-patterns.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  requireCsharpIdentifier,
} from "./identifiers.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";

export const missingDestructuringAssignmentFactsMessage = "Destructuring assignment emission requires finalized target storage and extraction facts before C# emission.";

export function isDestructuringAssignmentExpression(
  node: Node | undefined,
  input: TargetCompileInput,
): boolean {
  if (!HasSourceKind(input.ast, node, KindBinaryExpression)) {
    return false;
  }
  const expression = AsBinaryExpression(node);
  if (sourceTokenKind(expression?.OperatorToken, input) !== KindEqualsToken) {
    return false;
  }
  const left = expression?.Left;
  return HasSourceKind(input.ast, left, KindArrayLiteralExpression) ||
    HasSourceKind(input.ast, left, KindObjectLiteralExpression);
}

export function pushMissingDestructuringAssignmentFactsDiagnostic(
  node: Node,
  diagnostics: TargetDiagnostic[],
): void {
  diagnostics.push(unsupportedNodeDiagnostic(node, missingDestructuringAssignmentFactsMessage));
}

export function planDestructuringAssignmentStatement(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression: ExpressionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] | undefined {
  if (!isDestructuringAssignmentExpression(node, input)) {
    return undefined;
  }
  const expression = AsBinaryExpression(node)!;
  const left = expression.Left;
  const right = expression.Right;
  if (left === undefined || right === undefined) {
    pushMissingDestructuringAssignmentFactsDiagnostic(node!, diagnostics);
    return [];
  }
  const selectedOperator = input.facts.getSelectedTargetOperator(node!);
  const csharpOperation = input.facts.getFact(node!, csharpTargetOperationFactKey);
  if (
    selectedOperator?.operationKind !== "operator" ||
    selectedOperator.targetOperation !== "=" ||
    csharpOperation?.kind !== "operator-token" ||
    csharpOperation.operationId !== selectedOperator.operationId ||
    csharpOperation.operator !== "="
  ) {
    pushMissingDestructuringAssignmentFactsDiagnostic(left, diagnostics);
    return [];
  }
  const pattern = destructuringAssignmentPattern(left, input);
  if (pattern === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(left, "Destructuring assignment target is outside the current C# planning surface."));
    return [];
  }
  const sourceExpression = planExpression(right, sourceFile, input, diagnostics);
  if (sourceExpression === undefined) {
    return [];
  }
  const sourceType = getCsharpTypeForExpressionCarrier(right, sourceFile, input, diagnostics, left, "Destructuring assignment source");
  const sourceCarrier = input.facts.getRuntimeCarrierFact(right)?.carrier;
  const tempName = allocateDestructuringTemp(state);
  const tempReference: CsharpExpression = { kind: "IdentifierName", name: tempName };
  return [
    {
      kind: "LocalDeclarationStatement",
      name: tempName,
      type: sourceType,
      initializer: sourceExpression,
    },
    ...planAssignmentPatternFromExpression(
      pattern,
      tempReference,
      right,
      sourceFile,
      input,
      diagnostics,
      state,
      sourceCarrier,
      planDefaultExpressionWithExpectedType,
    ),
  ];
}

function planAssignmentPatternFromExpression(
  patternNode: Node,
  sourceExpression: CsharpExpression,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  sourceCarrier: TargetTypeRef | undefined,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  const projectionPlanner: BindingProjectionPlanner = (
    name,
    projected,
    projectedType,
    projectionNode,
    projectionSourceFile,
    projectionInput,
    projectionDiagnostics,
    projectionState,
    projectedCarrier,
  ) => planAssignmentTargetFromProjection(
    name,
    projected,
    projectedType,
    projectionNode,
    projectionSourceFile,
    projectionInput,
    projectionDiagnostics,
    projectionState,
    projectedCarrier,
    planDefaultExpressionWithExpectedType,
  );
  if (hasDestructuringAssignmentKind(patternNode, input, KindArrayBindingPattern)) {
    return planArrayBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state, projectionPlanner, planDefaultExpressionWithExpectedType, sourceCarrier);
  }
  if (hasDestructuringAssignmentKind(patternNode, input, KindObjectBindingPattern)) {
    return planObjectBindingPattern(patternNode, sourceExpression, sourceNode, sourceFile, input, diagnostics, state, projectionPlanner);
  }
  diagnostics.push(unsupportedNodeDiagnostic(patternNode, "Destructuring assignment pattern is outside the current C# planning surface."));
  return [];
}

function planAssignmentTargetFromProjection(
  name: Node,
  projected: CsharpExpression,
  projectedType: CsharpTypeNode | undefined,
  projectionNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  projectedCarrier: TargetTypeRef | undefined,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] {
  if (hasDestructuringAssignmentKind(name, input, KindIdentifier)) {
    return [{
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: requireCsharpIdentifier(Node_Text(name), diagnostics, "Destructuring assignment target") },
        operatorToken: { kind: "EqualsToken" },
        right: projected,
      },
    }];
  }
  if (hasDestructuringAssignmentKind(name, input, KindArrayBindingPattern) || hasDestructuringAssignmentKind(name, input, KindObjectBindingPattern)) {
    const tempName = allocateDestructuringTemp(state);
    const tempType = projectedType ?? getCsharpTypeForExpressionCarrier(projectionNode ?? name, sourceFile, input, diagnostics, name, "Nested destructuring assignment source");
    const tempReference: CsharpExpression = { kind: "IdentifierName", name: tempName };
    return [
      {
        kind: "LocalDeclarationStatement",
        name: tempName,
        type: tempType,
        initializer: projected,
      },
      ...planAssignmentPatternFromExpression(name, tempReference, projectionNode, sourceFile, input, diagnostics, state, projectedCarrier, planDefaultExpressionWithExpectedType),
    ];
  }
  diagnostics.push(unsupportedNodeDiagnostic(name, "Destructuring assignment target supports source-owned identifiers and nested destructuring patterns only."));
  return [];
}

function destructuringAssignmentPattern(
  node: Node,
  input: TargetCompileInput,
): Node | undefined {
  if (hasDestructuringAssignmentKind(node, input, KindArrayLiteralExpression)) {
    return {
      Kind: KindArrayBindingPattern,
      Elements: {
        Nodes: (node as { readonly Elements?: { readonly Nodes?: readonly (Node | undefined)[] } }).Elements?.Nodes?.map((element) =>
          element === undefined ? undefined : destructuringAssignmentArrayElement(element, input)
        ) ?? [],
      },
    } as unknown as Node;
  }
  if (hasDestructuringAssignmentKind(node, input, KindObjectLiteralExpression)) {
    return {
      Kind: KindObjectBindingPattern,
      Elements: {
        Nodes: AsObjectLiteralExpression(node)?.Properties?.Nodes?.map((property) =>
          property === undefined ? undefined : destructuringAssignmentObjectElement(property, input)
        ) ?? [],
      },
    } as unknown as Node;
  }
  return undefined;
}

function destructuringAssignmentArrayElement(
  node: Node,
  input: TargetCompileInput,
): Node | undefined {
  if (hasDestructuringAssignmentKind(node, input, KindSpreadElement)) {
    const spread = AsSpreadElement(node);
    return bindingElement(Node_Expression(node) ?? spread?.Expression, { dotDotDotToken: spread?.DotDotDotToken ?? node });
  }
  const defaulted = destructuringAssignmentDefaultTarget(node, input);
  if (defaulted !== undefined) {
    return bindingElement(defaulted.name, { initializer: defaulted.initializer });
  }
  return bindingElement(destructuringAssignmentNestedTarget(node, input));
}

function destructuringAssignmentObjectElement(
  node: Node,
  input: TargetCompileInput,
): Node | undefined {
  if (hasDestructuringAssignmentKind(node, input, KindSpreadAssignment)) {
    const spread = AsSpreadAssignment(node);
    return bindingElement(spread?.Expression, { dotDotDotToken: node });
  }
  if (hasDestructuringAssignmentKind(node, input, KindShorthandPropertyAssignment)) {
    const shorthand = AsShorthandPropertyAssignment(node);
    const defaultInitializer = shorthand?.ObjectAssignmentInitializer;
    return bindingElement(shorthand?.name, defaultInitializer === undefined ? {} : { initializer: defaultInitializer });
  }
  if (hasDestructuringAssignmentKind(node, input, KindPropertyAssignment)) {
    const property = AsPropertyAssignment(node);
    const target = property?.Initializer;
    const defaulted = target === undefined ? undefined : destructuringAssignmentDefaultTarget(target, input);
    return bindingElement(
      defaulted?.name ?? destructuringAssignmentNestedTarget(target, input),
      {
        propertyName: property?.name ?? property?.PropertyName,
        ...(defaulted?.initializer === undefined ? {} : { initializer: defaulted.initializer }),
      },
    );
  }
  return undefined;
}

function destructuringAssignmentNestedTarget(
  node: Node | undefined,
  input: TargetCompileInput,
): Node | undefined {
  if (node === undefined) {
    return undefined;
  }
  return destructuringAssignmentPattern(node, input) ?? node;
}

function destructuringAssignmentDefaultTarget(
  node: Node,
  input: TargetCompileInput,
): { readonly name: Node; readonly initializer: Node } | undefined {
  if (!hasDestructuringAssignmentKind(node, input, KindBinaryExpression)) {
    return undefined;
  }
  const expression = AsBinaryExpression(node);
  if (sourceTokenKind(expression?.OperatorToken, input) !== KindEqualsToken || expression?.Left === undefined || expression.Right === undefined) {
    return undefined;
  }
  return {
    name: destructuringAssignmentNestedTarget(expression.Left, input) ?? expression.Left,
    initializer: expression.Right,
  };
}

function bindingElement(
  name: Node | undefined,
  options: {
    readonly propertyName?: Node;
    readonly initializer?: Node;
    readonly dotDotDotToken?: Node;
  } = {},
): Node | undefined {
  if (name === undefined) {
    return undefined;
  }
  return {
    Kind: KindBindingElement,
    name,
    ...(options.propertyName === undefined ? {} : { PropertyName: options.propertyName }),
    ...(options.initializer === undefined ? {} : { Initializer: options.initializer }),
    ...(options.dotDotDotToken === undefined ? {} : { DotDotDotToken: options.dotDotDotToken }),
  } as unknown as Node;
}

function hasDestructuringAssignmentKind(
  node: Node | undefined,
  input: TargetCompileInput,
  expected: string,
): boolean {
  return (node as { readonly Kind?: unknown } | undefined)?.Kind === expected ||
    HasSourceKind(input.ast, node, expected);
}

function sourceTokenKind(
  token: unknown,
  input: TargetCompileInput,
): string {
  return typeof token === "number"
    ? SourceTokenKind(input.ast, token)
    : SourceKind(input.ast, token as Node | undefined);
}
