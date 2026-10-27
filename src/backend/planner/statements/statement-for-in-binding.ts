import type { CsharpPlanningContext } from "../context.js";
import { planCsharpCaptureFrame, planCsharpCapturedInitialization } from "../bindings/capture-storage.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import {
  expressionStatement,
} from "./statement-output.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { CsharpAdmittedIteration, CsharpForInKeyBinding } from "../../../target-model/records/operations/selection.js";
import type { CsharpConversionSelection } from "../../../target-model/conversions/selection.js";
import { applyCsharpConversionSelection } from "../expressions/conversions.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import type {
  CsharpPropertyKeyIterationPolicy,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "../bindings/typed-location-identities.js";

export interface PlannedForInBinding {
  readonly kind: "LocalDeclarationStatement" | "assignment";
  readonly name: string;
  readonly node: Node;
  readonly currentType: CsharpTypeNode;
  readonly declaration: Node;
  readonly storageType: TargetTypeRef;
  readonly sourceType: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
  readonly declarationKind?: "var" | "let" | "const";
}

export interface PlannedForInBindingActivation {
  readonly outerPrelude: readonly CsharpStatement[];
  readonly iterationPrelude: readonly CsharpStatement[];
}

export interface PlannedForInKeyCollectionBindingActivation extends PlannedForInBindingActivation {
  readonly itemName: string;
}

export function planForInBinding(
  binding: CsharpForInKeyBinding,
  targetType: TargetTypeRef,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
): PlannedForInBinding {
  const currentType = csharpTypeFromTargetTypeRef(binding.storageType, input.scope.typeParameterNames);
  if (currentType === undefined) failCsharpPlannerInvariant(
    "An admitted for-in binding lost its finalized native storage rendering.", binding.node);
  return { kind: binding.kind === "assignment" ? "assignment" : "LocalDeclarationStatement",
    name: planIdentifierName(binding.name, input, "For-in binding"),
    node: binding.node, declaration: binding.declaration, currentType,
    storageType: binding.storageType, sourceType: targetType, conversion: binding.conversion,
    ...(binding.kind === "declaration" ? { declarationKind: binding.declarationKind } : {}) };
}

export function getForInKeyType(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  selectedIteration: Extract<
    CsharpAdmittedIteration,
    { readonly iterationKind: "for-in" }
  >,
  diagnosticNode: Node,
): CsharpTypeNode {
  const keyType = csharpTypeFromTargetTypeRef(selectedIteration.elementType, typeParameterNames);
  if (keyType === undefined) {
    failCsharpPlannerInvariant("An admitted for-in key lost its native type rendering.", diagnosticNode);
  }
  return keyType;
}

export function getCsharpTypeForForInCollection(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  selectedIteration: Extract<
    CsharpAdmittedIteration,
    { readonly iterationKind: "for-in" }
  >,
  expression: Node,
): CsharpTypeNode {
  const type = csharpTypeFromTargetTypeRef(selectedIteration.iterableType, typeParameterNames);
  if (type !== undefined) {
    return type;
  }
  return failCsharpPlannerInvariant("An admitted for-in collection lost its native type rendering.", expression);
}

export function planForInBindingActivationForIndex(
  binding: PlannedForInBinding,
  indexName: string,
  lowering: Extract<
    CsharpPropertyKeyIterationPolicy,
    { readonly kind: "index" }
  >,
  diagnostics: TargetDiagnostic[],
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): PlannedForInBindingActivation {
  const keyExpression = forInKeyExpression(
    indexName,
    lowering,
    binding.node,
  );
  return planForInBindingActivation(binding, keyExpression, input, state, diagnostics);
}

export function planForInBindingActivation(
  binding: PlannedForInBinding,
  keyExpression: CsharpExpression,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  diagnostics: TargetDiagnostic[],
): PlannedForInBindingActivation {
  const declaration = binding.declaration;
  const sourceFile = input.program.source.ast.getSourceFile(binding.node);
  if (sourceFile === undefined) failCsharpPlannerInvariant("An admitted for-in binding lost its checked source file.", binding.node);
  const converted = applyCsharpConversionSelection(binding.node, sourceFile, input, diagnostics,
    binding.sourceType, binding.storageType, binding.conversion, keyExpression);
  if (converted === undefined) failCsharpPlannerInvariant("An admitted for-in key lost its selected native conversion.", binding.node);
  const captured = planCsharpCapturedInitialization(declaration, converted, input, state);
  if (captured !== undefined) {
    const selected = input.program.records.capturedBinding.get(declaration!);
    const scope = selected?.frame.scope;
    const loop = scope !== undefined && ["KindForInStatement", "KindForOfStatement"].includes(input.program.source.ast.kindName(scope));
    const identity = planCsharpTypedLocationIdentityDeclaration(declaration!, input, state);
    return { outerPrelude: [], iterationPrelude: [
      ...(loop ? planCsharpCaptureFrame(scope, input, diagnostics, state) : []),
      ...(identity === undefined ? [] : [identity]), captured,
    ] };
  }
  if (binding.kind === "assignment") {
    return {
      outerPrelude: [],
      iterationPrelude: [expressionStatement({
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: binding.name },
        operatorToken: { kind: "EqualsToken" },
        right: converted,
      })],
    };
  }
  const identity = planCsharpTypedLocationIdentityDeclaration(
    binding.node,
    input,
    state,
  );
  if (binding.declarationKind === "var") {
    return {
      outerPrelude: [
        {
          kind: "LocalDeclarationStatement",
          name: binding.name,
          type: binding.currentType,
        },
        ...(identity === undefined ? [] : [identity]),
      ],
      iterationPrelude: [expressionStatement({
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: binding.name },
        operatorToken: { kind: "EqualsToken" },
        right: converted,
      })],
    };
  }
  return {
    outerPrelude: [],
    iterationPrelude: [
      {
      kind: "LocalDeclarationStatement",
      name: binding.name,
      type: binding.currentType,
      initializer: converted,
      },
      ...(identity === undefined ? [] : [identity]),
    ],
  };
}

export function planForInKeyCollectionBindingActivation(
  binding: PlannedForInBinding,
  syntheticItemName: string,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  diagnostics: TargetDiagnostic[],
): PlannedForInKeyCollectionBindingActivation {
  if (
    binding.kind === "LocalDeclarationStatement" &&
    binding.declarationKind === "const" && binding.conversion.kind === "identity" &&
    input.program.records.capturedBinding.get(binding.declaration) === undefined
  ) {
    const identity = planCsharpTypedLocationIdentityDeclaration(
      binding.node,
      input,
      state,
    );
    if (identity === undefined) {
      return {
        itemName: binding.name,
        outerPrelude: [],
        iterationPrelude: [],
      };
    }
    const activation = planForInBindingActivationWithIdentity(
      binding,
      { kind: "IdentifierName", name: syntheticItemName },
      identity,
    );
    return { itemName: syntheticItemName, ...activation };
  }
  return {
    itemName: syntheticItemName,
    ...planForInBindingActivation(
      binding,
      { kind: "IdentifierName", name: syntheticItemName },
      input,
      state,
      diagnostics,
    ),
  };
}

function planForInBindingActivationWithIdentity(
  binding: PlannedForInBinding,
  keyExpression: CsharpExpression,
  identity: CsharpStatement,
): PlannedForInBindingActivation {
  return {
    outerPrelude: [],
    iterationPrelude: [
      {
        kind: "LocalDeclarationStatement",
        name: binding.name,
        type: binding.currentType,
        initializer: keyExpression,
      },
      identity,
    ],
  };
}

function forInKeyExpression(
  indexName: string,
  lowering: Extract<
    CsharpPropertyKeyIterationPolicy,
    { readonly kind: "index" }
  >,
  diagnosticNode: Node,
): CsharpExpression {
  if (lowering.keyConversion !== "invariant-string") {
    failCsharpPlannerInvariant("An admitted for-in index lost its invariant-string key conversion policy.", diagnosticNode);
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: indexName },
      name: "ToString",
    },
    arguments: [{
      kind: "Argument",
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: {
          kind: "SimpleMemberAccessExpression",
          receiver: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: "System" },
            name: "Globalization",
          },
          name: "CultureInfo",
        },
        name: "InvariantCulture",
      },
    }],
  };
}
