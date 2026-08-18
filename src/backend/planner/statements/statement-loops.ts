import type { CsharpPlanningContext } from "../context.js";
import {
  AsForInOrOfStatement,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindArrayLiteralExpression,
  KindIdentifier,
  KindObjectBindingPattern,
  KindVariableDeclarationList,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../../roslyn/syntax.js";
import { getCsharpTypeForNode } from "../types/index.js";
import { qualifiedCsharpType } from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  allocateForOfItem,
  declareCsharpLocalBindingName,
  planBindingPatternFromExpression,
} from "../bindings/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { planExpression, planExpressionWithExpectedType } from "../expressions/index.js";
import { planLocalDeclaration } from "../bindings/locals.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planStringCodePointForOfStatement } from "./statement-string-iteration.js";
import {
  isCsharpStringCodePointIteration,
  selectCsharpIteration,
} from "../../../policy/operations/index.js";
import type {
  CsharpForAwaitOfIteration,
  CsharpForOfIteration,
} from "../../../policy/operations/index.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "../bindings/typed-location-identities.js";
import {
  planResourceRegistrationStatement,
  planResourceScopeStatements,
} from "./resource-management.js";

export { planForInStatement } from "./statement-for-in.js";

type NestedStatementPlanner = (
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function planForOfStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
  if (
    selectedIteration.iterationKind !== "for-of" &&
    selectedIteration.iterationKind !== "for-await-of"
  ) {
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
  const sourceCollection = planForOfCollectionExpression(statement.Expression, binding.type, sourceFile, input, diagnostics);
  const collection = sourceCollection === undefined
    ? undefined
    : selectedIteration.iterationKind === "for-await-of" &&
        selectedIteration.lowering.kind === "await-foreach-sync-adapter"
      ? adaptSyncCollectionToAsync(sourceCollection, binding.type)
      : sourceCollection;
  if (collection === undefined) {
    return [];
  }
  const resourceDeclaration = forOfResourceDeclaration(
    statement.Initializer,
    input,
  );
  const planBody = (): readonly CsharpStatement[] => {
    const registration = resourceDeclaration === undefined
      ? undefined
      : planResourceRegistrationStatement(
          resourceDeclaration.declaration,
          binding,
          sourceFile,
          input,
          diagnostics,
          state,
        );
    return [
      ...binding.prelude,
      ...(registration === undefined ? [] : [registration]),
      ...planNestedStatementBody(
        statement.Statement,
        sourceFile,
        input,
        diagnostics,
        state,
      ),
    ];
  };
  const bodyStatements = resourceDeclaration === undefined
    ? planBody()
    : planResourceScopeStatements(
        resourceDeclaration.declaration,
        resourceDeclaration.kind,
        diagnostics,
        state,
        planBody,
      );
  const loop: CsharpStatement = {
    kind: "ForEachStatement",
    ...(selectedIteration.iterationKind === "for-await-of"
      ? { await: true }
      : {}),
    itemType: binding.type,
    itemName: binding.name,
    collection,
    body: {
      kind: "Block",
      statements: bodyStatements,
    },
  };
  return [...binding.outerPrelude, loop];
}

function forOfResourceDeclaration(
  initializer: Node | undefined,
  input: CsharpPlanningContext,
): {
  readonly declaration: Node;
  readonly kind: "sync" | "async";
} | undefined {
  if (!HasSourceKind(input.ast, initializer, KindVariableDeclarationList)) {
    return undefined;
  }
  const declarations = input.ast.children(initializer).filter(
    (declaration): declaration is Node =>
      declaration !== undefined &&
      input.ast.is.IsVariableDeclaration(declaration),
  );
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  if (declaration === undefined) {
    return undefined;
  }
  const kind = input.ast.variableDeclarationKind(declaration);
  return kind === "using"
    ? { declaration, kind: "sync" }
    : kind === "await using"
      ? { declaration, kind: "async" }
      : undefined;
}

function planForOfCollectionExpression(
  expression: Node | undefined,
  elementType: ReturnType<typeof getCsharpTypeForNode>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
  readonly outerPrelude: readonly CsharpStatement[];
  readonly prelude: readonly CsharpStatement[];
}

function planForOfBinding(
  initializer: Node | undefined,
  selectedIteration: CsharpForOfIteration | CsharpForAwaitOfIteration,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
    const storageRequirement = input.artifacts.requireStorage(first, {
      kind: "target-representation",
      declaration: first,
      targetType: selectedIteration.elementType,
    });
    if (storageRequirement.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(
        first,
        storageRequirement.reason,
      ));
      return undefined;
    }
    const storageType = input.artifacts.resolveStorageType(
      first,
      selectedIteration.elementType,
    );
    if (storageType.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(first, storageType.reason));
      return undefined;
    }
    const itemStorageType = csharpTypeFromTargetTypeRef(storageType.type);
    if (itemStorageType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        first,
        "The exact for-of binding storage representation is not renderable in C#.",
      ));
      return undefined;
    }
    const variable = AsVariableDeclaration(input.ast, first)!;
    if (variable.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(first, "For-of variable declaration cannot have an initializer."));
    }
    const variableName = variable.name;
    if (variableName !== undefined && (HasSourceKind(input.ast, variableName, KindObjectBindingPattern) || HasSourceKind(input.ast, variableName, KindArrayBindingPattern))) {
      const itemName = allocateForOfItem(state);
      const itemType = itemStorageType;
      if (itemType === undefined) {
        return undefined;
      }
      return {
        kind: "VariableDeclarator",
        name: itemName,
        type: itemType,
        outerPrelude: [],
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
      const identity = planCsharpTypedLocationIdentityDeclaration(
        first,
        input,
        state,
      );
      const binding: CsharpLocalDeclaration = {
        kind: "VariableDeclarator",
        name: declareCsharpLocalBindingName(variable.name, input, diagnostics, state, "For-of binding name", "forOfItem"),
        type: itemStorageType,
      };
      return identity === undefined
        ? { ...binding, outerPrelude: [], prelude: [] }
        : mutableForOfLocationBinding(
            binding,
            identity,
            input.ast.variableDeclarationKind(initializer),
            state,
          );
    }
    const planned = planLocalDeclaration(first, sourceFile, input, diagnostics, state);
    const identity = planCsharpTypedLocationIdentityDeclaration(
      first,
      input,
      state,
    );
    return identity === undefined
      ? { ...planned, outerPrelude: [], prelude: [] }
      : mutableForOfLocationBinding(
          planned,
          identity,
          input.ast.variableDeclarationKind(initializer),
          state,
        );
  }
  if (HasSourceKind(input.ast, initializer, KindIdentifier)) {
    const target = planExpression(initializer, sourceFile, input, diagnostics, state);
    if (target === undefined) {
      return undefined;
    }
    const itemName = allocateForOfItem(state);
    return {
      name: itemName,
      kind: "VariableDeclarator",
      type: csharpTypeFromTargetTypeRef(selectedIteration.elementType) ??
        getCsharpTypeForNode(initializer, sourceFile, input, undefined, diagnostics),
      outerPrelude: [],
      prelude: [{
        kind: "ExpressionStatement",
        expression: {
          kind: "AssignmentExpression",
          left: target,
          operatorToken: { kind: "EqualsToken" },
          right: { kind: "IdentifierName", name: itemName },
        },
      }],
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of initializer binding is outside the current C# planning surface."));
  return undefined;
}

function adaptSyncCollectionToAsync(
  collection: CsharpExpression,
  elementType: CsharpLocalDeclaration["type"],
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: qualifiedCsharpType(
        "Tsonic.CSharp.Runtime",
        "AsyncEnumerableAdapters",
      ),
      name: "FromSync",
      typeArguments: [elementType],
    },
    arguments: [{ kind: "Argument", expression: collection }],
  };
}

function mutableForOfLocationBinding(
  binding: CsharpLocalDeclaration,
  identity: CsharpStatement,
  declarationKind: ReturnType<CsharpPlanningContext["ast"]["variableDeclarationKind"]>,
  state: DestructuringPlannerState,
): PlannedForOfBinding {
  const iterationName = allocateForOfItem(state);
  if (declarationKind === "var") {
    return {
      ...binding,
      name: iterationName,
      outerPrelude: [
        {
          kind: "LocalDeclarationStatement",
          name: binding.name,
          type: binding.type,
        },
        identity,
      ],
      prelude: [{
        kind: "ExpressionStatement",
        expression: {
          kind: "AssignmentExpression",
          left: { kind: "IdentifierName", name: binding.name },
          operatorToken: { kind: "EqualsToken" },
          right: { kind: "IdentifierName", name: iterationName },
        },
      }],
    };
  }
  return {
    ...binding,
    name: iterationName,
    outerPrelude: [],
    prelude: [
      {
        kind: "LocalDeclarationStatement",
        name: binding.name,
        type: binding.type,
        initializer: { kind: "IdentifierName", name: iterationName },
      },
      identity,
    ],
  };
}
