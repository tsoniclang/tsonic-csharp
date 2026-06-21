import {
  AsForInOrOfStatement,
  AsIdentifier,
  AsVariableDeclaration,
  AsVariableDeclarationList,
  HasSourceKind,
  KindArrayBindingPattern,
  KindArrayLiteralExpression,
  KindIdentifier,
  KindObjectBindingPattern,
  KindVariableDeclarationList,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  allocateForOfItem,
  planBindingPatternFromExpression,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { planExpression, planExpressionWithExpectedType } from "./expressions.js";
import { requireCsharpIdentifier } from "./identifiers.js";
import { planLocalDeclaration } from "./locals.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { planStringCodePointForOfStatement } from "./statement-string-iteration.js";
import { targetTypeRefFromFactSubject } from "./statement-iteration-facts.js";
import { csharpTargetIterationFactKey } from "../../source/csharp-facts.js";
import type { CsharpTargetIterationFact } from "../../source/csharp-facts.js";

export { planForInStatement } from "./statement-for-in.js";

type NestedStatementPlanner = (
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function planForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const selectedIteration = input.facts.getFact(statementNode, csharpTargetIterationFactKey);
  if (selectedIteration === undefined) {
    const diagnosticNode = statement.Expression ?? statement.Initializer ?? statementNode;
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "C# for-of emission requires finalized TSTS/provider iteration facts."));
    return [];
  }
  const binding = planForOfBinding(statement.Initializer, selectedIteration, sourceFile, input, diagnostics, state);
  if (binding === undefined) {
    return [];
  }
  if (selectedIteration.iterationKind === "sync" && selectedIteration.lowering.kind === "string-code-point") {
    return planStringCodePointForOfStatement(statementNode, statement, binding, selectedIteration, sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  if (selectedIteration.iterationKind !== "sync" || selectedIteration.lowering.kind !== "foreach") {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, `C# for-of emission does not support provider iteration lowering '${selectedIteration.lowering.kind}' with kind '${selectedIteration.iterationKind}'.`));
    return [];
  }
  return [{
    kind: "ForEachStatement",
    itemType: binding.type,
    itemName: binding.name,
    collection: planForOfCollectionExpression(statement.Expression, binding.type, sourceFile, input, diagnostics),
    body: {
      kind: "Block",
      statements: [
        ...binding.prelude,
        ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
      ],
    },
  }];
}

function planForOfCollectionExpression(
  expression: Node | undefined,
  elementType: ReturnType<typeof getCsharpTypeForNode>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  if (expression === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_OF_COLLECTION",
      category: "error",
      source: "tsonic-csharp",
      message: "For-of requires a collection expression.",
    });
    return { kind: "InvalidExpression", reason: "missing for-of collection" };
  }
  if (HasSourceKind(input.ast, expression, KindArrayLiteralExpression)) {
    return planExpressionWithExpectedType(
      expression,
        sourceFile,
        input,
        diagnostics,
        { kind: "ArrayType", elementType },
        undefined,
      );
  }
  return planExpression(expression, sourceFile, input, diagnostics);
}

interface PlannedForOfBinding extends CsharpLocalDeclaration {
  readonly prelude: readonly CsharpStatement[];
}

function planForOfBinding(
  initializer: Node | undefined,
  selectedIteration: CsharpTargetIterationFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForOfBinding | undefined {
  if (initializer === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_OF_BINDING",
      category: "error",
      source: "tsonic-csharp",
      message: "For-of statement has no initializer.",
    });
    return undefined;
  }
  if (HasSourceKind(input.ast, initializer, KindVariableDeclarationList)) {
    const declarations = AsVariableDeclarationList(initializer)!.Declarations?.Nodes ?? [];
    const first = declarations.find((declaration): declaration is Node => declaration !== undefined);
    if (first === undefined || declarations.filter((declaration) => declaration !== undefined).length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of variable declaration must contain exactly one binding."));
      return undefined;
    }
    const variable = AsVariableDeclaration(first)!;
    if (variable.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(first, "For-of variable declaration cannot have an initializer."));
    }
    const variableName = variable.name;
    if (variableName !== undefined && (HasSourceKind(input.ast, variableName, KindObjectBindingPattern) || HasSourceKind(input.ast, variableName, KindArrayBindingPattern))) {
      const itemName = allocateForOfItem(state);
      const itemType = variable.Type === undefined
        ? getForOfElementType(selectedIteration, first, diagnostics)
        : getCsharpTypeForNode(variable.Type, sourceFile, input, invalidCsharpType("missing for-of destructuring item type"), diagnostics);
      if (itemType === undefined) {
        return undefined;
      }
      return {
        kind: "VariableDeclarator",
        name: itemName,
        type: itemType,
        prelude: planBindingPatternFromExpression(
          variableName,
          { kind: "IdentifierName", name: itemName },
          first,
          sourceFile,
          input,
          diagnostics,
          state,
        ),
      };
    }
    const planned = planLocalDeclaration(first, sourceFile, input, diagnostics);
    const inferredItemType = variable.Type === undefined
      ? getForOfElementType(selectedIteration, first, diagnostics)
      : undefined;
    if (variable.Type === undefined && inferredItemType === undefined) {
      return undefined;
    }
    return {
      ...planned,
      ...(inferredItemType === undefined ? {} : { type: inferredItemType }),
      prelude: [],
    };
  }
  if (HasSourceKind(input.ast, initializer, KindIdentifier)) {
    const identifier = AsIdentifier(initializer)!;
    return {
      name: requireCsharpIdentifier(Node_Text(identifier), diagnostics, "For-of assignment target"),
      kind: "VariableDeclarator",
      type: getCsharpTypeForNode(initializer, sourceFile, input, undefined, diagnostics),
      prelude: [],
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of initializer binding is outside the current C# planning surface."));
  return undefined;
}

function getForOfElementType(
  selectedIteration: CsharpTargetIterationFact,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const targetElementType = selectedIteration.elementType === undefined
    ? undefined
    : targetTypeRefFromFactSubject(selectedIteration.elementType);
  const elementType = targetElementType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetElementType);
  if (elementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "C# for-of destructuring requires a provider iteration fact with a closed target element type."));
    return undefined;
  }
  return elementType;
}
