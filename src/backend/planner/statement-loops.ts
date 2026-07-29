import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsForInOrOfStatement,
  AsIdentifier,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindArrayLiteralExpression,
  KindIdentifier,
  KindObjectBindingPattern,
  KindVariableDeclarationList,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
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
  declareCsharpLocalBindingName,
  planBindingPatternFromExpression,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { planExpression, planExpressionWithExpectedType } from "./expressions.js";
import { requireCsharpIdentifier } from "./identifiers.js";
import { planLocalDeclaration } from "./locals.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { planStringCodePointForOfStatement } from "./statement-string-iteration.js";
import {
  isCsharpStringCodePointIteration,
  selectCsharpIteration,
} from "../../policy/operations/index.js";
import type {
  CsharpResolvedIteration,
} from "../../policy/operations/index.js";

export { planForInStatement } from "./statement-for-in.js";

type NestedStatementPlanner = (
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function planForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const diagnosticNode = statement.Expression ?? statement.Initializer ?? statementNode;
  const selectedIteration = selectCsharpIteration(
    input,
    statementNode,
    statement.Expression,
    sourceFile,
  );
  if (selectedIteration.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      diagnosticNode,
      selectedIteration.reason,
    ));
    return [];
  }
  if (selectedIteration.iterationKind !== "for-of") {
    diagnostics.push(unsupportedNodeDiagnostic(
      diagnosticNode,
      "C# for-of emission received a non-for-of checked iteration selection.",
    ));
    return [];
  }
  const binding = planForOfBinding(statement.Initializer, selectedIteration, sourceFile, input, diagnostics, state);
  if (binding === undefined) {
    return [];
  }
  if (isCsharpStringCodePointIteration(selectedIteration)) {
    return planStringCodePointForOfStatement(statementNode, statement, binding, selectedIteration, sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  const collection = planForOfCollectionExpression(statement.Expression, binding.type, sourceFile, input, diagnostics);
  if (collection === undefined) {
    return [];
  }
  return [{
    kind: "ForEachStatement",
    itemType: binding.type,
    itemName: binding.name,
    collection,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (expression === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_OF_COLLECTION",
      category: "error",
      source: "tsonic-csharp",
      message: "For-of requires a collection expression.",
    });
    return undefined;
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
  selectedIteration: Extract<
    CsharpResolvedIteration,
    { readonly iterationKind: "for-of" }
  >,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
    const declarations = input.ast.children(initializer)
      .filter((declaration): declaration is Node => declaration !== undefined && input.ast.is.IsVariableDeclaration(declaration));
    const first = declarations[0];
    if (first === undefined || declarations.length !== 1) {
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
          undefined,
          planExpressionWithExpectedType,
        ),
      };
    }
    if (variable.Type === undefined) {
      const inferredItemType = getForOfElementType(selectedIteration, first, diagnostics);
      if (inferredItemType === undefined) {
        return undefined;
      }
      return {
        kind: "VariableDeclarator",
        name: declareCsharpLocalBindingName(variable.name, sourceFile, input, diagnostics, state, "For-of binding name", "forOfItem"),
        type: inferredItemType,
        prelude: [],
      };
    }
    const planned = planLocalDeclaration(first, sourceFile, input, diagnostics, state);
    return {
      ...planned,
      prelude: [],
    };
  }
  if (HasSourceKind(input.ast, initializer, KindIdentifier)) {
    const identifier = AsIdentifier(initializer)!;
    return {
      name: requireCsharpIdentifier(Node_Text(input.ast, identifier), diagnostics, "For-of assignment target"),
      kind: "VariableDeclarator",
      type: getCsharpTypeForNode(initializer, sourceFile, input, undefined, diagnostics),
      prelude: [],
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of initializer binding is outside the current C# planning surface."));
  return undefined;
}

function getForOfElementType(
  selectedIteration: Extract<
    CsharpResolvedIteration,
    { readonly iterationKind: "for-of" }
  >,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const elementType = csharpTypeFromTargetTypeRef(
    selectedIteration.elementType,
  );
  if (elementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "C# for-of destructuring requires a checked iteration with a renderable target element type."));
    return undefined;
  }
  return elementType;
}
