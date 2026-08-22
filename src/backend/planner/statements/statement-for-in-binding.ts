import type { CsharpPlanningContext } from "../context.js";
import {
  AsIdentifier,
  AsVariableDeclaration,
  HasSourceKind,
  KindIdentifier,
  KindVariableDeclarationList,
  Node_Text,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
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
import {
  type CsharpResolvedIteration,
} from "../../../analysis/operations/index.js";
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
  readonly currentType?: ReturnType<typeof getCsharpTypeForNode>;
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
  initializer: Node | undefined,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): PlannedForInBinding | undefined {
  if (initializer === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_IN_BINDING",
      category: "error",
      source: "tsonic-csharp",
      message: "For-in statement has no initializer.",
    });
    return undefined;
  }
  if (HasSourceKind(input.program.source.ast, initializer, KindVariableDeclarationList)) {
    const concreteDeclarations = input.program.source.ast.children(initializer)
      .filter((declaration): declaration is Node => declaration !== undefined && input.program.source.ast.is.IsVariableDeclaration(declaration));
    const first = concreteDeclarations[0];
    if (first === undefined || concreteDeclarations.length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-in variable declaration must contain exactly one binding."));
      return undefined;
    }
    const variable = AsVariableDeclaration(input.program.source.ast, first)!;
    if (variable.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(first, "For-in variable declaration cannot have an initializer."));
      return undefined;
    }
    if (variable.name === undefined || !HasSourceKind(input.program.source.ast, variable.name, KindIdentifier)) {
      diagnostics.push(unsupportedNodeDiagnostic(variable.name ?? first, "For-in C# key binding must be an identifier; binding patterns require finalized object-key destructuring facts."));
      return undefined;
    }
    const declarationKind = input.program.source.ast.variableDeclarationKind(initializer);
    if (
      declarationKind !== "var" &&
      declarationKind !== "let" &&
      declarationKind !== "const"
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        initializer,
        "For-in C# key bindings require an exact var, let, or const declaration kind.",
      ));
      return undefined;
    }
    const storageType = input.program.storage.type(first) ?? targetType;
    const currentType = csharpTypeFromTargetTypeRef(storageType);
    if (currentType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        first,
        "The exact for-in binding storage representation is not renderable in C#.",
      ));
      return undefined;
    }
    return {
      kind: "LocalDeclarationStatement",
      name: requireCsharpIdentifier(Node_Text(input.program.source.ast, variable.name), diagnostics, "For-in key binding"),
      node: first,
      currentType,
      declarationKind,
    };
  }
  if (HasSourceKind(input.program.source.ast, initializer, KindIdentifier)) {
    const identifier = AsIdentifier(input.program.source.ast, initializer)!;
    return {
      kind: "assignment",
      name: requireCsharpIdentifier(Node_Text(input.program.source.ast, identifier), diagnostics, "For-in assignment target"),
      node: initializer,
      currentType: getCsharpTypeForNode(initializer, sourceFile, input, undefined, diagnostics),
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-in initializer binding is outside the current C# planning surface."));
  return undefined;
}

export function getForInKeyType(
  selectedIteration: Extract<
    CsharpResolvedIteration,
    { readonly iterationKind: "for-in" }
  >,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> | undefined {
  const keyType = csharpTypeFromTargetTypeRef(selectedIteration.elementType);
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
  selectedIteration: Extract<
    CsharpResolvedIteration,
    { readonly iterationKind: "for-in" }
  >,
  expression: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const type = csharpTypeFromTargetTypeRef(selectedIteration.iterableType);
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
  keyType: ReturnType<typeof getCsharpTypeForNode>,
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
    binding.node,
    diagnostics,
  );
  return keyExpression === undefined
    ? undefined
    : planForInBindingActivation(
        binding,
        keyType,
        keyExpression,
        input,
        state,
      );
}

export function planForInBindingActivation(
  binding: PlannedForInBinding,
  keyType: ReturnType<typeof getCsharpTypeForNode>,
  keyExpression: CsharpExpression,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): PlannedForInBindingActivation {
  if (binding.kind === "assignment") {
    return {
      outerPrelude: [],
      iterationPrelude: [expressionStatement({
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: binding.name },
        operatorToken: { kind: "EqualsToken" },
        right: keyExpression,
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
          type: keyType,
        },
        ...(identity === undefined ? [] : [identity]),
      ],
      iterationPrelude: [expressionStatement({
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: binding.name },
        operatorToken: { kind: "EqualsToken" },
        right: keyExpression,
      })],
    };
  }
  return {
    outerPrelude: [],
    iterationPrelude: [
      {
      kind: "LocalDeclarationStatement",
      name: binding.name,
      type: keyType,
      initializer: keyExpression,
      },
      ...(identity === undefined ? [] : [identity]),
    ],
  };
}

export function planForInKeyCollectionBindingActivation(
  binding: PlannedForInBinding,
  keyType: ReturnType<typeof getCsharpTypeForNode>,
  syntheticItemName: string,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): PlannedForInKeyCollectionBindingActivation {
  if (
    binding.kind === "LocalDeclarationStatement" &&
    binding.declarationKind === "const"
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
      keyType,
      { kind: "IdentifierName", name: syntheticItemName },
      identity,
    );
    return { itemName: syntheticItemName, ...activation };
  }
  return {
    itemName: syntheticItemName,
    ...planForInBindingActivation(
      binding,
      keyType,
      { kind: "IdentifierName", name: syntheticItemName },
      input,
      state,
    ),
  };
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
