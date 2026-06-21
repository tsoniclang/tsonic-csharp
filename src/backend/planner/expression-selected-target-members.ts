import {
  AsIdentifier,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindArrayLiteralExpression,
  KindIdentifier,
  KindPropertyAccessExpression,
  Node_Text,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  requireCsharpIdentifier,
} from "./identifiers.js";
import {
  invalidExpression,
} from "./invalid-expression.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import type {
  CsharpTargetOperationFact,
  CsharpTargetMemberOperationFact,
} from "../../source/csharp-facts.js";
import {
  csharpStaticMemberExpression,
} from "./csharp-target-operations.js";
import {
  isExternalDeclarationReference,
} from "./expression-source-references.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";

export function planSelectedTargetCallArguments(
  callee: Node | undefined,
  expression: { readonly Arguments?: { readonly Nodes?: readonly (Node | undefined)[] } } | undefined,
  member: TargetMember,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] {
  const receiverArgument = planSelectedTargetReceiverArgument(callee, member, sourceFile, input, diagnostics, planCallArgument);
  const parameterOffset = receiverArgument === undefined ? 0 : 1;
  const argumentsList = (expression?.Arguments?.Nodes ?? [])
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument, index) => {
      const parameter = member.parameters[index + parameterOffset];
      const expectedType = parameter === undefined ? undefined : getExpectedArgumentRenderType(argument, parameter.type, input);
      return planCallArgument(argument, sourceFile, input, diagnostics, expectedType);
    });
  return receiverArgument === undefined ? argumentsList : [receiverArgument, ...argumentsList];
}

export function planSelectedTargetReceiverExpression(
  receiver: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  if (!HasSourceKind(input.ast, receiver, KindIdentifier)) {
    return planExpression(receiver, sourceFile, input, diagnostics);
  }
  const sourceName = Node_Text(AsIdentifier(receiver));
  if (isExternalDeclarationReference(input.semantics.getProjectSourceReferenceForNode(receiver, { sourceFile }), sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(receiver, `Selected instance target member '${sourceName}' requires a value receiver; provider declaration identifiers cannot be emitted as instance receivers.`));
    return invalidExpression("provider declaration receiver");
  }
  return { kind: "IdentifierName", name: requireCsharpIdentifier(sourceName, diagnostics, "Selected target receiver") };
}

export function targetStaticMemberExpression(
  operation: CsharpTargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
): CsharpExpression | undefined {
  return csharpStaticMemberExpression(operation, diagnostics, node, "Static target property");
}

export function planSelectedTargetCallee(
  callee: Node | undefined,
  operation: CsharpTargetMemberOperationFact,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  if (operation.operationKind !== "method" && operation.operationKind !== "constructor" && operation.operationKind !== "operator") {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: `Selected target call requires a C# method, constructor, or operator operation fact, but provider recorded '${operation.operationKind}'.`,
    });
    return invalidExpression("selected target call operation kind");
  }
  if (callee !== undefined && HasSourceKind(input.ast, callee, KindPropertyAccessExpression)) {
    const property = AsPropertyAccessExpression(callee)!;
    if (operation.static === true) {
      return planSelectedStaticTargetCallee(operation, diagnostics, callee);
    }
    return {
      kind: property.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: planSelectedTargetReceiverExpression(property.Expression!, sourceFile, input, diagnostics, planExpression),
      name: operation.memberName,
    };
  }
  if (callee !== undefined && HasSourceKind(input.ast, callee, KindIdentifier)) {
    return operation.static === true
      ? planSelectedStaticTargetCallee(operation, diagnostics, callee)
      : {
          kind: "IdentifierName",
          name: operation.memberName,
        };
  }
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_AST",
    category: "error",
    source: "tsonic-csharp",
    message: "Selected target call requires an identifier or property-access callee before C# emission.",
  });
  return invalidExpression("selected target call callee");
}

function planSelectedStaticTargetCallee(
  operation: CsharpTargetMemberOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
): CsharpExpression {
  return csharpStaticMemberExpression(operation, diagnostics, node, "Selected static target call") ??
    invalidExpression("selected target static call");
}

function planSelectedTargetReceiverArgument(
  callee: Node | undefined,
  member: TargetMember,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpArgument | undefined {
  if (member.receiverPassing !== "first-argument") {
    return undefined;
  }
  if (!HasSourceKind(input.ast, callee, KindPropertyAccessExpression)) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected target helper call requires a property-access receiver for first-argument receiver passing.",
    });
    return undefined;
  }
  const receiver = AsPropertyAccessExpression(callee)?.Expression;
  if (receiver === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected target helper call requires a receiver expression.",
    });
    return undefined;
  }
  const parameter = member.parameters[0];
  const expectedType = parameter === undefined ? undefined : getExpectedArgumentRenderType(receiver, parameter.type, input);
  return planCallArgument(receiver, sourceFile, input, diagnostics, expectedType);
}

function getExpectedArgumentRenderType(
  argument: Node,
  targetType: TargetTypeRef,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  if (HasSourceKind(input.ast, argument, KindArrayLiteralExpression)) {
    const collectionElementType = getEnumerableCollectionElementType(targetType);
    if (collectionElementType !== undefined) {
      return csharpTypeFromTargetTypeRef({ kind: "array", element: collectionElementType });
    }
  }
  return csharpTypeFromTargetTypeRef(targetType);
}

function getEnumerableCollectionElementType(type: TargetTypeRef): TargetTypeRef | undefined {
  if (
    type.kind === "target-named" &&
    (
      type.id === "System.Collections.Generic.IEnumerable`1" ||
      type.id === "System.Collections.Generic.IReadOnlyCollection`1" ||
      type.id === "System.Collections.Generic.IReadOnlyList`1" ||
      type.id === "System.Collections.Generic.ICollection`1" ||
      type.id === "System.Collections.Generic.IList`1" ||
      type.id === "System.Collections.Generic.List`1"
    )
  ) {
    return type.typeArguments?.[0];
  }
  return undefined;
}
