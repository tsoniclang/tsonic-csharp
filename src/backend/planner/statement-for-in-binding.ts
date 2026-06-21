import {
  AsIdentifier,
  AsVariableDeclaration,
  AsVariableDeclarationList,
  HasSourceKind,
  KindIdentifier,
  KindVariableDeclarationList,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  getCsharpTypeForNode,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  sanitizeIdentifier,
} from "./identifiers.js";
import {
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  expressionStatement,
} from "./statement-output.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  targetTypeRefFromFactSubject,
} from "./statement-iteration-facts.js";
import type {
  CsharpTargetIterationFact,
} from "../../source/csharp-facts.js";

export interface PlannedForInBinding {
  readonly kind: "LocalDeclarationStatement" | "assignment";
  readonly name: string;
  readonly node: Node;
  readonly currentType?: ReturnType<typeof getCsharpTypeForNode>;
}

export function planForInBinding(
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
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
  if (HasSourceKind(input.ast, initializer, KindVariableDeclarationList)) {
    const declarations = AsVariableDeclarationList(initializer)!.Declarations?.Nodes ?? [];
    const concreteDeclarations = declarations.filter((declaration): declaration is Node => declaration !== undefined);
    const first = concreteDeclarations[0];
    if (first === undefined || concreteDeclarations.length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-in variable declaration must contain exactly one binding."));
      return undefined;
    }
    const variable = AsVariableDeclaration(first)!;
    if (variable.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(first, "For-in variable declaration cannot have an initializer."));
      return undefined;
    }
    if (variable.name === undefined || !HasSourceKind(input.ast, variable.name, KindIdentifier)) {
      diagnostics.push(unsupportedNodeDiagnostic(variable.name ?? first, "For-in C# key binding must be an identifier; binding patterns require finalized object-key destructuring facts."));
      return undefined;
    }
    return {
      kind: "LocalDeclarationStatement",
      name: sanitizeIdentifier(Node_Text(variable.name)),
      node: first,
      currentType: getCsharpTypeForNode(variable.name, sourceFile, input, undefined, diagnostics),
    };
  }
  if (HasSourceKind(input.ast, initializer, KindIdentifier)) {
    const identifier = AsIdentifier(initializer)!;
    return {
      kind: "assignment",
      name: sanitizeIdentifier(Node_Text(identifier)),
      node: initializer,
      currentType: getCsharpTypeForNode(initializer, sourceFile, input, undefined, diagnostics),
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-in initializer binding is outside the current C# planning surface."));
  return undefined;
}

export function getForInKeyType(
  selectedIteration: CsharpTargetIterationFact,
  diagnosticNode: Node,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> | undefined {
  const targetKeyType = selectedIteration.elementType === undefined
    ? undefined
    : targetTypeRefFromFactSubject(selectedIteration.elementType);
  const keyType = targetKeyType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetKeyType);
  if (keyType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "C# for-in key emission requires a provider iteration fact with a closed target key type."));
    return undefined;
  }
  return keyType;
}

export function getCsharpTypeForForInCollection(
  expression: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const carrier = getRuntimeCarrierForExpression(input, expression, sourceFile);
  const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
  if (type !== undefined) {
    return type;
  }
  diagnostics.push(unsupportedNodeDiagnostic(expression, "For-in collection temp requires a finalized runtime carrier fact before C# emission."));
  return undefined;
}

export function planForInKeyBindingStatement(
  binding: PlannedForInBinding,
  keyType: ReturnType<typeof getCsharpTypeForNode>,
  indexName: string,
  selectedIteration: CsharpTargetIterationFact,
): CsharpStatement {
  return planForInKeyBindingStatementFromExpression(binding, keyType, forInKeyExpression(indexName, selectedIteration));
}

export function planForInKeyBindingStatementFromExpression(
  binding: PlannedForInBinding,
  keyType: ReturnType<typeof getCsharpTypeForNode>,
  keyExpression: CsharpExpression,
): CsharpStatement {
  if (binding.kind === "LocalDeclarationStatement") {
    return {
      kind: "LocalDeclarationStatement",
      name: binding.name,
      type: keyType,
      initializer: keyExpression,
    };
  }
  return expressionStatement({
    kind: "BinaryExpression",
    left: { kind: "IdentifierName", name: binding.name },
    operator: "=",
    right: keyExpression,
  });
}

function forInKeyExpression(indexName: string, selectedIteration: CsharpTargetIterationFact): CsharpExpression {
  if (selectedIteration.lowering.kind !== "index-key" || selectedIteration.lowering.keyConversion !== "invariant-string") {
    return {
      kind: "InvalidExpression",
      reason: "unsupported for-in key conversion",
    };
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
