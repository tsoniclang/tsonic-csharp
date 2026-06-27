import {
  AsBinaryExpression,
  AsEnumDeclaration,
  AsEnumMember,
  AsIdentifier,
  AsParenthesizedExpression,
  AsPrefixUnaryExpression,
  HasSourceKind,
  KindEnumMember,
  KindIdentifier,
  KindNumericLiteral,
  KindParenthesizedExpression,
  KindPrefixUnaryExpression,
  Node_Name,
  SourceKind,
  SourceTokenKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpBinaryOperatorToken,
  CsharpEnumDeclaration,
  CsharpEnumMember,
  CsharpExpression,
  CsharpPrefixUnaryOperatorToken,
} from "../roslyn/syntax.js";
import { planAttributesForSubject } from "./attributes.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";
import { planIdentifierName } from "./names.js";
import {
  parseFiniteNumberLiteral,
} from "../../source/source-literal-values.js";

export function planEnumDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpEnumDeclaration {
  const declaration = AsEnumDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "enum declaration", diagnostics);
  return {
    kind: "EnumDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousEnum", input, diagnostics, "Enum name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpEnumMember[] => {
      if (member === undefined) {
        return [];
      }
      if (!HasSourceKind(input.ast, member, KindEnumMember)) {
        diagnostics.push(unsupportedNodeDiagnostic(member, "Enum member is outside the current C# planning surface."));
        return [];
      }
      return [planEnumMember(member, sourceFile, input, diagnostics)];
    }),
  };
}

function planEnumMember(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpEnumMember {
  const member = AsEnumMember(node)!;
  const enumValue = input.analysis.getEnumMemberConstant(node, { sourceFile });
  const enumExpressionValue = member.Initializer === undefined
    ? undefined
    : planEnumConstantExpression(member.Initializer, sourceFile, input, diagnostics);
  if (
    member.Initializer !== undefined &&
    (enumValue === undefined || typeof enumValue.value !== "number" || !Number.isInteger(enumValue.value))
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(member.Initializer!, "C# enum member initializers must be integer constants evaluated by TSTS; string or provider-owned enum carriers require finalized target facts."));
  }
  return {
    kind: "EnumMemberDeclaration",
    name: planIdentifierName(member.name ?? Node_Name(node), "AnonymousMember", input, diagnostics, "Enum member name"),
    ...(member.Initializer === undefined
      ? {}
      : enumExpressionValue !== undefined
        ? { value: enumExpressionValue }
        : enumValue?.value === undefined ? {} : { value: { kind: "LiteralExpression", value: enumValue.value } }),
  };
}

function planEnumConstantExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  switch (SourceKind(input.ast, node)) {
    case KindNumericLiteral: {
      const value = parseFiniteNumberLiteral(input.ast.text(node));
      if (value === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "C# enum numeric literal initializer requires parseable finite source literal text from TSTS."));
        return undefined;
      }
      return { kind: "LiteralExpression", value };
    }
    case KindIdentifier:
      return { kind: "IdentifierName", name: planIdentifierName(AsIdentifier(node), "EnumConstant", input, diagnostics, "Enum constant reference") };
    case KindParenthesizedExpression: {
      const expression = AsParenthesizedExpression(node)?.Expression;
      const planned = expression === undefined ? undefined : planEnumConstantExpression(expression, sourceFile, input, diagnostics);
      return planned === undefined ? undefined : { kind: "ParenthesizedExpression", expression: planned };
    }
    case KindPrefixUnaryExpression: {
      const expression = AsPrefixUnaryExpression(node);
      const operand = expression?.Operand === undefined ? undefined : planEnumConstantExpression(expression.Operand, sourceFile, input, diagnostics);
      const operatorToken = getEnumConstantPrefixOperatorToken(SourceTokenKind(input.ast, expression?.OperatorToken?.Kind));
      return operand === undefined || operatorToken === undefined ? undefined : { kind: "PrefixUnaryExpression", operatorToken, operand };
    }
    case "KindBinaryExpression": {
      const expression = AsBinaryExpression(node);
      const left = expression?.Left === undefined ? undefined : planEnumConstantExpression(expression.Left, sourceFile, input, diagnostics);
      const right = expression?.Right === undefined ? undefined : planEnumConstantExpression(expression.Right, sourceFile, input, diagnostics);
      const operatorToken = getEnumConstantBinaryOperatorToken(SourceTokenKind(input.ast, expression?.OperatorToken?.Kind));
      return left === undefined || right === undefined || operatorToken === undefined
        ? undefined
        : { kind: "BinaryExpression", left, operatorToken, right };
    }
    default:
      return undefined;
  }
}

function getEnumConstantPrefixOperatorToken(tokenKind: string | undefined): CsharpPrefixUnaryOperatorToken | undefined {
  switch (tokenKind) {
    case "KindPlusToken":
      return { kind: "PlusToken" };
    case "KindMinusToken":
      return { kind: "MinusToken" };
    case "KindTildeToken":
      return { kind: "TildeToken" };
    default:
      return undefined;
  }
}

function getEnumConstantBinaryOperatorToken(tokenKind: string | undefined): CsharpBinaryOperatorToken | undefined {
  switch (tokenKind) {
    case "KindLessThanLessThanToken":
      return { kind: "LessThanLessThanToken" };
    case "KindGreaterThanGreaterThanToken":
      return { kind: "GreaterThanGreaterThanToken" };
    case "KindBarToken":
      return { kind: "BarToken" };
    case "KindAmpersandToken":
      return { kind: "AmpersandToken" };
    case "KindCaretToken":
      return { kind: "CaretToken" };
    case "KindPlusToken":
      return { kind: "PlusToken" };
    case "KindMinusToken":
      return { kind: "MinusToken" };
    case "KindAsteriskToken":
      return { kind: "AsteriskToken" };
    case "KindSlashToken":
      return { kind: "SlashToken" };
    case "KindPercentToken":
      return { kind: "PercentToken" };
    default:
      return undefined;
  }
}
