import type { CsharpPlanningContext } from "../context.js";
import { planCsharpCaptureFrame, planCsharpCapturedInitialization } from "../bindings/capture-storage.js";
import { Node_Text } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetPlannerInvariant } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import {
  getCsharpTypeForNode,
  predefined,
  sameCsharpType,
} from "../types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  requireCsharpIdentifier,
} from "../../../target-model/names/identifiers.js";
import {
  expressionStatement,
} from "./statement-output.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type { CsharpAdmittedIteration, CsharpForInKeyBinding, CsharpResolvedIteration } from "../../../target-model/records/selection.js";
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

import { applyCsharpConversionSelection } from "../expressions/conversions.js";

export interface PlannedForInBinding {
  readonly name: string;
  readonly selection: CsharpForInKeyBinding;
  readonly keyType: TargetTypeRef;
}

export interface PlannedForInBindingActivation {
  readonly outerPrelude: readonly CsharpStatement[];
  readonly iterationPrelude: readonly CsharpStatement[];
}

export interface PlannedForInKeyCollectionBindingActivation extends PlannedForInBindingActivation {
  readonly itemName: string;
}

export function planForInBinding(
  iteration: Extract<CsharpAdmittedIteration, { readonly iterationKind: "for-in" }>,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): PlannedForInBinding {
  const selection = iteration.binding;
  return {
    name: requireCsharpIdentifier(Node_Text(input.program.source.ast, selection.name), diagnostics,
      selection.kind === "assignment" ? "For-in assignment target" : "For-in key binding"),
    selection,
    keyType: iteration.elementType,
  };
}

export function getForInKeyType(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  selectedIteration: Extract<
    CsharpResolvedIteration,
    { readonly iterationKind: "for-in" }
  >,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> | undefined {
  const keyType = csharpTypeFromTargetTypeRef(selectedIteration.elementType, typeParameterNames);
  if (keyType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      diagnosticNode,
      "C# for-in key emission requires a renderable checked target key type.",
    ));
    return undefined;
  }
  if (
    selectedIteration.lowering.kind === "index" ||
    selectedIteration.lowering.kind === "object-shape-keys"
  ) {
    const stringType = predefined("string");
    if (!sameCsharpType(keyType, stringType)) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `C# for-in ${selectedIteration.lowering.kind} lowering requires finalized provider key type string.`));
      return undefined;
    }
  }
  return keyType;
}

export function getCsharpTypeForForInCollection(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  selectedIteration: Extract<
    CsharpResolvedIteration,
    { readonly iterationKind: "for-in" }
  >,
  expression: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const type = csharpTypeFromTargetTypeRef(selectedIteration.iterableType, typeParameterNames);
  if (type !== undefined) {
    return type;
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    expression,
    "For-in collection temp requires a renderable checked target iterable type.",
  ));
  return undefined;
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
): PlannedForInBindingActivation | undefined {
  const keyExpression = forInKeyExpression(
    indexName,
    lowering,
    binding.selection.node,
    diagnostics,
  );
  return keyExpression === undefined
    ? undefined
    : planForInBindingActivation(
        binding,
        keyExpression,
        input,
        state,
        diagnostics,
      );
}

export function planForInBindingActivation(
  binding: PlannedForInBinding,
  keyExpression: CsharpExpression,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  diagnostics: TargetDiagnostic[],
): PlannedForInBindingActivation | undefined {
  const selected = binding.selection;
  const sourceFile = input.program.source.ast.getSourceFile(selected.node) ?? failTargetPlannerInvariant(
    "tsonic-csharp", "An admitted for-in binding retains its exact checked source file.", selected.node);
  const value = applyCsharpConversionSelection(selected.node, sourceFile, input, diagnostics,
    binding.keyType, selected.storageType, selected.conversion, keyExpression);
  if (value === undefined) return undefined;
  const captured = planCsharpCapturedInitialization(selected.declaration, value, input, state);
  if (captured !== undefined) {
    const scope = input.program.records.capturedBinding.get(selected.declaration)?.frame.scope;
    const loop = scope !== undefined && ["KindForInStatement", "KindForOfStatement"].includes(input.program.source.ast.kindName(scope));
    const identity = planCsharpTypedLocationIdentityDeclaration(selected.declaration, input, state);
    return { outerPrelude: [], iterationPrelude: [
      ...(loop ? planCsharpCaptureFrame(scope, input, diagnostics, state) : []),
      ...(identity === undefined ? [] : [identity]), captured,
    ] };
  }
  if (selected.kind === "assignment") return {
    outerPrelude: [],
    iterationPrelude: [expressionStatement({ kind: "AssignmentExpression",
      left: { kind: "IdentifierName", name: binding.name }, operatorToken: { kind: "EqualsToken" }, right: value })],
  };
  const storageType = csharpTypeFromTargetTypeRef(selected.storageType, input.scope.typeParameterNames) ?? failTargetPlannerInvariant(
    "tsonic-csharp", "An admitted for-in declaration retains its renderable native storage type.", selected.node);
  const identity = planCsharpTypedLocationIdentityDeclaration(selected.declaration, input, state);
  if (selected.declarationKind === "var") return {
    outerPrelude: [{ kind: "LocalDeclarationStatement", name: binding.name, type: storageType },
      ...(identity === undefined ? [] : [identity])],
    iterationPrelude: [expressionStatement({ kind: "AssignmentExpression",
      left: { kind: "IdentifierName", name: binding.name }, operatorToken: { kind: "EqualsToken" }, right: value })],
  };
  return { outerPrelude: [], iterationPrelude: [
    { kind: "LocalDeclarationStatement", name: binding.name, type: storageType, initializer: value },
    ...(identity === undefined ? [] : [identity]),
  ] };
}

export function planForInKeyCollectionBindingActivation(
  binding: PlannedForInBinding,
  keyType: CsharpTypeNode,
  syntheticItemName: string,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  diagnostics: TargetDiagnostic[],
): PlannedForInKeyCollectionBindingActivation | undefined {
  const selected = binding.selection;
  if (selected.kind === "declaration" && selected.declarationKind === "const" && selected.conversion.kind === "identity") {
    const identity = planCsharpTypedLocationIdentityDeclaration(selected.declaration, input, state);
    if (identity === undefined) return { itemName: binding.name, outerPrelude: [], iterationPrelude: [] };
    const activation = planForInBindingActivationWithIdentity(binding, keyType,
      { kind: "IdentifierName", name: syntheticItemName }, identity);
    return { itemName: syntheticItemName, ...activation };
  }
  const activation = planForInBindingActivation(binding,
    { kind: "IdentifierName", name: syntheticItemName }, input, state, diagnostics);
  return activation === undefined ? undefined : { itemName: syntheticItemName, ...activation };
}

function planForInBindingActivationWithIdentity(
  binding: PlannedForInBinding,
  keyType: ReturnType<typeof getCsharpTypeForNode>,
  keyExpression: CsharpExpression,
  identity: CsharpStatement,
): PlannedForInBindingActivation {
  return {
    outerPrelude: [],
    iterationPrelude: [
      {
        kind: "LocalDeclarationStatement",
        name: binding.name,
        type: keyType,
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
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (lowering.keyConversion !== "invariant-string") {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "C# for-in index lowering requires an explicit invariant-string key conversion policy."));
    return undefined;
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
