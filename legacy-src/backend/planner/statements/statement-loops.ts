import type { CsharpPlanningContext } from "../context.js";
import {
  AsForInOrOfStatement,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import { qualifiedCsharpType } from "../types/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import {
  allocateForOfItem,
  declareCsharpLocalBindingName,
  planBindingPatternFromExpression,
} from "../bindings/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { planCsharpCaptureFrame, planCsharpCapturedInitialization } from "../bindings/capture-storage.js";
import { planExpression } from "../expressions/index.js";
import { planIdentifierExpression } from "../expressions/expression-source-references.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planStringCodePointForOfStatement } from "./statement-string-iteration.js";
import type { CsharpAdmittedIteration } from "../../../target-model/records/selection.js";
import { applyCsharpConversionSelection } from "../expressions/conversions.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "../bindings/typed-location-identities.js";
import {
  planResourceRegistrationStatement,
  planResourceScopeStatements,
} from "./resource-management.js";
import type { CsharpPlannedValue } from "../expressions/planned-values.js";
import { consumeCsharpPlannedValue } from "./statement-output.js";
import { planCsharpCollectionIndexedIteration } from "../expressions/collection-reads.js";
import { csharpCollectionElementRead } from "../../../target-model/types/carriers/collection-reads.js";
import { allocateExpressionTemp } from "../bindings/binding-state.js";

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
  const selectedIteration = input.program.records.iteration.get(statementNode);
  if (selectedIteration === undefined ||
    selectedIteration.iterationKind !== "for-of" &&
    selectedIteration.iterationKind !== "for-await-of"
  ) {
    failCsharpPlannerInvariant("A planned for-of statement requires its admitted native iteration contract.", diagnosticNode);
  }
  const binding = planForOfBinding(statement.Initializer, selectedIteration, sourceFile, input, diagnostics, state);
  if (binding === undefined) {
    return [];
  }
  if (selectedIteration.lowering.kind === "string-code-point") {
    return planStringCodePointForOfStatement(statementNode, statement, binding,
      selectedIteration as Parameters<typeof planStringCodePointForOfStatement>[3],
      sourceFile, input, diagnostics, state, planNestedStatementBody);
  }
  const sourceCollection = planForOfCollectionExpression(statement.Expression, sourceFile, input, diagnostics);
  if (sourceCollection === undefined) {
    return [];
  }
  const resourceDeclaration = forOfResourceDeclaration(
    selectedIteration,
  );
  const planBody = (): readonly CsharpStatement[] => {
    const registration = resourceDeclaration === undefined
      ? undefined
      : planResourceRegistrationStatement(
          resourceDeclaration.declaration,
          binding.local,
          input,
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
        state,
        planBody,
      );
  return consumeCsharpPlannedValue(sourceCollection, source => {
  if (selectedIteration.iterationKind === "for-of" &&
    csharpCollectionElementRead(sourceCollection.completion.carrier)?.kind === "method") {
    const name = allocateExpressionTemp(state);
    const receiver: CsharpExpression = { kind: "IdentifierName", name };
    const loop = planCsharpCollectionIndexedIteration(sourceCollection.completion.carrier, receiver, allocateExpressionTemp(state),
      value => [{ kind: "LocalDeclarationStatement", name: binding.name, type: binding.type, initializer: value }, ...bodyStatements],
      input.scope.typeParameterNames);
    const type = csharpTypeFromTargetTypeRef(sourceCollection.completion.carrier, input.scope.typeParameterNames);
    if (loop === undefined || type === undefined) {
      return failCsharpPlannerInvariant(
        "A native indexed for-of carrier has no C# length member, element read or type syntax.", diagnosticNode);
    }
    return [...binding.outerPrelude, { kind: "LocalDeclarationStatement", name, type, initializer: source }, loop];
  }
  const collection = selectedIteration.iterationKind === "for-await-of" &&
    selectedIteration.lowering.kind === "await-foreach-sync-adapter" ? adaptSyncCollectionToAsync(source, binding.type) : source;
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
  });
}

function forOfResourceDeclaration(
  iteration: Extract<CsharpAdmittedIteration, { readonly iterationKind: "for-of" | "for-await-of" }>,
): {
  readonly declaration: Node;
  readonly kind: "sync" | "async";
} | undefined {
  const binding = iteration.binding;
  if (binding.kind === "assignment") return undefined;
  const declaration = binding.declaration;
  const kind = binding.declarationKind;
  return kind === "using"
    ? { declaration, kind: "sync" }
    : kind === "await using"
      ? { declaration, kind: "async" }
      : undefined;
}

function planForOfCollectionExpression(
  expression: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpPlannedValue | undefined {
  if (expression === undefined) {
    return failCsharpPlannerInvariant("A checked for-of statement requires its collection expression.", sourceFile);
  }
  return planExpression(expression, sourceFile, input, diagnostics);
}

interface PlannedForOfBinding extends CsharpLocalDeclaration {
  readonly local: CsharpLocalDeclaration;
  readonly outerPrelude: readonly CsharpStatement[];
  readonly prelude: readonly CsharpStatement[];
}

function planForOfBinding(
  initializer: Node | undefined,
  selectedIteration: Extract<CsharpAdmittedIteration, { readonly iterationKind: "for-of" | "for-await-of" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForOfBinding | undefined {
  const binding = planForOfBindingCore(selectedIteration, sourceFile, input, diagnostics, state);
  if (binding === undefined) return undefined;
  const loop = input.program.source.ast.parent(initializer!);
  if (loop === undefined) failCsharpPlannerInvariant("An admitted for-of binding lost its checked loop.", selectedIteration.binding.node);
  const selected = selectedIteration.binding;
  const captured = selected.kind === "declaration" ? planCsharpCapturedInitialization(selected.declaration,
    { kind: "IdentifierName", name: binding.local.name }, input, state) : undefined;
  return { ...binding, prelude: [...planCsharpCaptureFrame(loop, input, diagnostics, state), ...binding.prelude,
    ...(captured === undefined ? [] : [captured])] };
}

function planForOfBindingCore(
  selectedIteration: Extract<CsharpAdmittedIteration, { readonly iterationKind: "for-of" | "for-await-of" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForOfBinding | undefined {
  const selected = selectedIteration.binding;
  const storageType = csharpTypeFromTargetTypeRef(selected.storageType, input.scope.typeParameterNames);
  const elementType = csharpTypeFromTargetTypeRef(selectedIteration.elementType, input.scope.typeParameterNames);
  if (storageType === undefined || elementType === undefined) return failCsharpPlannerInvariant(
    "An admitted for-of binding lost its exact native element or destination rendering.", selected.node);
  const convert = (expression: CsharpExpression): CsharpExpression => {
    const converted = applyCsharpConversionSelection(selected.node, sourceFile, input, diagnostics,
      selectedIteration.elementType, selected.storageType, selected.conversion, expression);
    return converted ?? failCsharpPlannerInvariant("An admitted for-of binding lost its selected native conversion.", selected.node);
  };
  if (selected.kind === "assignment") {
    const target = planIdentifierExpression(selected.name, sourceFile,
      { ...input, storageExpression: selected.name }, diagnostics, state);
    if (target === undefined) {
      return undefined;
    }
    const itemName = allocateForOfItem(state);
    const local: CsharpLocalDeclaration = { name: itemName, kind: "VariableDeclarator", type: elementType };
    return {
      ...local,
      local,
      outerPrelude: [],
      prelude: [{
        kind: "ExpressionStatement",
        expression: {
          kind: "AssignmentExpression",
          left: target,
          operatorToken: { kind: "EqualsToken" },
          right: convert({ kind: "IdentifierName", name: itemName }),
        },
      }],
    };
  }
  if (selected.kind === "pattern") {
    const itemName = allocateForOfItem(state);
    const local: CsharpLocalDeclaration = { kind: "VariableDeclarator", name: itemName, type: elementType };
    return { ...local, local, outerPrelude: [], prelude: planBindingPatternFromExpression(selected.pattern,
      convert({ kind: "IdentifierName", name: itemName }), sourceFile, input, diagnostics, state, planExpression) };
  }
  const local: CsharpLocalDeclaration = {
    kind: "VariableDeclarator",
    name: declareCsharpLocalBindingName(selected.name, input, state),
    type: storageType,
  };
  const identity = planCsharpTypedLocationIdentityDeclaration(selected.declaration, input, state);
  if (identity !== undefined) return mutableForOfLocationBinding(local, identity, selected.declarationKind,
    elementType, convert, state);
  if (selected.conversion.kind === "identity") return { ...local, local, outerPrelude: [], prelude: [] };
  const itemName = allocateForOfItem(state);
  return { kind: "VariableDeclarator", name: itemName, type: elementType, local, outerPrelude: [],
    prelude: [{ kind: "LocalDeclarationStatement", name: local.name, type: local.type,
      initializer: convert({ kind: "IdentifierName", name: itemName }) }] };
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
  declarationKind: ReturnType<CsharpPlanningContext["program"]["source"]["ast"]["variableDeclarationKind"]>,
  elementType: CsharpLocalDeclaration["type"],
  convert: (expression: CsharpExpression) => CsharpExpression,
  state: DestructuringPlannerState,
): PlannedForOfBinding {
  const iterationName = allocateForOfItem(state);
  if (declarationKind === "var") {
    return {
      ...binding,
      name: iterationName,
      type: elementType,
      local: binding,
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
          right: convert({ kind: "IdentifierName", name: iterationName }),
        },
      }],
    };
  }
  return {
    ...binding,
    name: iterationName,
    type: elementType,
    local: binding,
    outerPrelude: [],
    prelude: [
      {
        kind: "LocalDeclarationStatement",
        name: binding.name,
        type: binding.type,
        initializer: convert({ kind: "IdentifierName", name: iterationName }),
      },
      identity,
    ],
  };
}
