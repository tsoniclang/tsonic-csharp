import {
  AsIdentifier,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindIdentifier,
  KindPropertyAccessExpression,
  Node_Text,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
  TargetMember,
  TargetOperationFact,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  sanitizeIdentifier,
} from "./identifiers.js";
import {
  invalidExpression,
} from "./invalid-expression.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  getCsharpStaticMemberOperation,
} from "../../source/csharp-operation-tags.js";
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
      const expectedType = parameter === undefined ? undefined : csharpTypeFromTargetTypeRef(parameter.type);
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
  if (isExternalDeclarationReference(input.semantics.getProjectSourceReferenceForNode(receiver, { sourceFile }), sourceFile)) {
    diagnostics.push(unsupportedNodeDiagnostic(receiver, `Selected instance target member '${sourceName}' requires a value receiver; provider declaration identifiers cannot be emitted as instance receivers.`));
    return invalidExpression("provider declaration receiver");
  }
  return { kind: "IdentifierName", name: sanitizeIdentifier(sourceName) };
}

export function targetStaticMemberExpression(
  operation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
): CsharpExpression | undefined {
  const staticMember = getCsharpStaticMemberOperation(operation.targetOperation);
  if (staticMember === undefined) {
    return undefined;
  }
  const declaringType = csharpTypeFromTargetTypeRef({ kind: "target-named", id: staticMember.declaringTypeId });
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Static target property requires a renderable declaring target type before C# emission."));
    return invalidExpression("static target property");
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: staticMember.memberName,
  };
}

export function planSelectedTargetCallee(
  callee: Node | undefined,
  member: TargetMember,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  if (HasSourceKind(input.ast, callee, KindPropertyAccessExpression)) {
    const property = AsPropertyAccessExpression(callee)!;
    if (member.static === true) {
      return planSelectedStaticTargetCallee(member, diagnostics);
    }
    return {
      kind: property.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: planSelectedTargetReceiverExpression(property.Expression!, sourceFile, input, diagnostics, planExpression),
      name: member.targetName,
    };
  }
  if (HasSourceKind(input.ast, callee, KindIdentifier)) {
    return member.static === true
      ? planSelectedStaticTargetCallee(member, diagnostics)
      : {
          kind: "IdentifierName",
          name: member.targetName,
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
  member: TargetMember,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const declaringType = member.declaringType === undefined ? undefined : csharpTypeFromTargetTypeRef(member.declaringType);
  if (declaringType === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_AST",
      category: "error",
      source: "tsonic-csharp",
      message: "Selected static target call requires a provider-owned declaring target type fact before C# emission.",
    });
    return invalidExpression("selected target static call declaring type");
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: member.targetName,
  };
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
  const expectedType = parameter === undefined ? undefined : csharpTypeFromTargetTypeRef(parameter.type);
  return planCallArgument(receiver, sourceFile, input, diagnostics, expectedType);
}
