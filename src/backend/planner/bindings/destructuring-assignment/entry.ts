import { allocateDestructuringTemp } from "../binding-state.js";
import { csharpDestructuringAssignmentSyntax } from "../../../../target-model/syntax/operators.js";
import { destructuringAssignmentPattern, planAssignmentPatternFromExpression } from "./planning.js";
import { getArrayBoundaryCoreCarrierForExpression } from "../../expressions/arrays/boundary-facts.js";
import { getCsharpTypeForExpressionCarrier } from "../binding-patterns.js";
import { getRuntimeCarrierForExpression } from "../../types/runtime-carriers.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { BindingDefaultExpressionPlanner } from "../binding-array-patterns.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../binding-state.js";
import type { ExpressionPlanner } from "../../expressions/expression-planner-types.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export const missingDestructuringAssignmentFactsMessage = "Destructuring assignment emission requires finalized target storage and extraction facts before C# emission.";

export function isDestructuringAssignmentExpression(
  node: Node | undefined,
  input: CsharpPlanningContext,
): boolean {
  return csharpDestructuringAssignmentSyntax(input.program.source.ast, node) !== undefined;
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression: ExpressionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): readonly CsharpStatement[] | undefined {
  if (!isDestructuringAssignmentExpression(node, input)) {
    return undefined;
  }
  const planned = planDestructuringAssignmentCore(
    node!,
    sourceFile,
    input,
    diagnostics,
    state,
    planExpression,
    planDefaultExpressionWithExpectedType,
  );
  return planned?.statements ?? [];
}

export function tryPlanDestructuringAssignmentExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  planExpression: ExpressionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): CsharpExpression | undefined {
  if (!isDestructuringAssignmentExpression(node, input)) {
    return undefined;
  }
  if (state === undefined) {
    pushMissingDestructuringAssignmentFactsDiagnostic(node, diagnostics);
    return undefined;
  }
  const planned = planDestructuringAssignmentCore(
    node,
    sourceFile,
    input,
    diagnostics,
    state,
    planExpression,
    planDefaultExpressionWithExpectedType,
  );
  if (planned === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "ParenthesizedExpression",
      expression: {
        kind: "CastExpression",
        type: csharpFuncType(planned.sourceType),
        expression: {
          kind: "LambdaExpression",
          parameters: [],
          body: {
            kind: "Block",
            statements: [
              ...planned.statements,
              {
                kind: "ReturnStatement",
                expression: planned.resultExpression,
              },
            ],
          },
        },
      },
    },
    arguments: [],
  };
}

interface DestructuringAssignmentPlan {
  readonly sourceType: CsharpTypeNode;
  readonly resultExpression: CsharpExpression;
  readonly statements: readonly CsharpStatement[];
}

function planDestructuringAssignmentCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planExpression: ExpressionPlanner,
  planDefaultExpressionWithExpectedType: BindingDefaultExpressionPlanner,
): DestructuringAssignmentPlan | undefined {
  const selectedOperator = input.program.operations.binary(node)
    ?.destructuring;
  if (selectedOperator === undefined) {
    pushMissingDestructuringAssignmentFactsDiagnostic(node, diagnostics);
    return undefined;
  }
  if (selectedOperator.kind !== "resolved") {
    pushMissingDestructuringAssignmentFactsDiagnostic(node, diagnostics);
    return undefined;
  }
  const left = selectedOperator.pattern;
  const right = selectedOperator.source;
  const pattern = destructuringAssignmentPattern(left, input);
  if (pattern === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(left, "Destructuring assignment target is outside the current C# planning surface."));
    return undefined;
  }
  const sourceExpression = planExpression(right, sourceFile, input, diagnostics);
  if (sourceExpression === undefined) {
    return undefined;
  }
  const sourceType = getCsharpTypeForExpressionCarrier(right, sourceFile, input, diagnostics, left, "Destructuring assignment source");
  const sourceCarrier = getArrayBoundaryCoreCarrierForExpression(input, right, sourceFile) ??
    getRuntimeCarrierForExpression(input, right, sourceFile);
  const tempName = allocateDestructuringTemp(state);
  const tempReference: CsharpExpression = { kind: "IdentifierName", name: tempName };
  return {
    sourceType,
    resultExpression: tempReference,
    statements: [
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
    ],
  };
}

function csharpFuncType(returnType: CsharpTypeNode): CsharpTypeNode {
  return {
    kind: "QualifiedName",
    left: { kind: "IdentifierName", name: "System" },
    name: "Func",
    typeArguments: [returnType],
  };
}

export type DestructuringAssignmentPattern =
  | {
      readonly kind: "array";
      readonly sourceNode: Node;
      readonly elements: readonly (DestructuringAssignmentArrayElement | undefined)[];
    }
  | {
      readonly kind: "object";
      readonly sourceNode: Node;
      readonly elements: readonly DestructuringAssignmentObjectElement[];
    };

export type DestructuringAssignmentTarget =
  | { readonly kind: "node"; readonly node: Node }
  | { readonly kind: "pattern"; readonly pattern: DestructuringAssignmentPattern };

export type DestructuringAssignmentArrayElement = {
  readonly kind: "array-element";
  readonly sourceNode: Node;
  readonly target: DestructuringAssignmentTarget;
  readonly initializer?: Node;
  readonly rest: boolean;
};

export type DestructuringAssignmentObjectElement =
  | {
      readonly kind: "object-property";
      readonly sourceNode: Node;
      readonly propertyName?: Node;
      readonly target: DestructuringAssignmentTarget;
      readonly initializer?: Node;
    }
  | {
      readonly kind: "object-rest";
      readonly sourceNode: Node;
      readonly target: DestructuringAssignmentTarget;
    };
