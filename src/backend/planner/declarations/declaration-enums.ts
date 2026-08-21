import type { CsharpPlanningContext } from "../context.js";
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
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpBinaryOperatorToken,
  CsharpEnumDeclaration,
  CsharpEnumMember,
  CsharpExpression,
  CsharpPrefixUnaryOperatorToken,
} from "../../target-ast/roslyn/index.js";
import { planAttributesForSubject } from "./attributes.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import {
  parseFiniteNumberLiteral,
} from "../../../target-model/syntax/literal-values.js";

export function planEnumDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpEnumDeclaration {
  const declaration = AsEnumDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "enum declaration", diagnostics);
  return {
    kind: "EnumDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousEnum", input, diagnostics, "Enum name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpEnumMember[] => {
      if (member === undefined) {
        return [];
      }
      if (!HasSourceKind(input.program.source.ast, member, KindEnumMember)) {
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpEnumMember {
  const member = AsEnumMember(input.program.source.ast, node)!;
  const enumValue = input.program.sourceEvidence.constantValue(node)?.value;
  const enumExpressionValue = member.Initializer === undefined
    ? undefined
    : planEnumConstantExpression(member.Initializer, sourceFile, input, diagnostics);
  if (
    member.Initializer !== undefined &&
    (typeof enumValue !== "number" || !Number.isInteger(enumValue))
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(member.Initializer!, "C# enum member initializers must be integer constants evaluated by TSTS; string or provider-owned enum carriers require finalized target facts."));
  }
  return {
    kind: "EnumMemberDeclaration",
    name: planIdentifierName(member.name ?? Node_Name(input.program.source.ast, node), "AnonymousMember", input, diagnostics, "Enum member name"),
    ...(member.Initializer === undefined
      ? {}
      : enumExpressionValue !== undefined
        ? { value: enumExpressionValue }
        : typeof enumValue !== "number"
          ? {}
          : { value: { kind: "LiteralExpression", value: enumValue } }),
  };
}

function planEnumConstantExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  switch (SourceKind(input.program.source.ast, node)) {
    case KindNumericLiteral: {
      const value = parseFiniteNumberLiteral(input.program.source.ast.text(node));
      if (value === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "C# enum numeric literal initializer requires parseable finite source literal text from TSTS."));
        return undefined;
      }
      return { kind: "LiteralExpression", value };
    }
    case KindIdentifier:
      return { kind: "IdentifierName", name: planIdentifierName(AsIdentifier(input.program.source.ast, node), "EnumConstant", input, diagnostics, "Enum constant reference") };
    case KindParenthesizedExpression: {
      const expression = AsParenthesizedExpression(input.program.source.ast, node)?.Expression;
      const planned = expression === undefined ? undefined : planEnumConstantExpression(expression, sourceFile, input, diagnostics);
      return planned === undefined ? undefined : { kind: "ParenthesizedExpression", expression: planned };
    }
    case KindPrefixUnaryExpression: {
      const expression = AsPrefixUnaryExpression(input.program.source.ast, node);
      const operand = expression?.Operand === undefined ? undefined : planEnumConstantExpression(expression.Operand, sourceFile, input, diagnostics);
      const operatorToken = getEnumConstantPrefixOperatorToken(
        input.program.source.ast.operatorKindName(node),
      );
      return operand === undefined || operatorToken === undefined ? undefined : { kind: "PrefixUnaryExpression", operatorToken, operand };
    }
    case "KindBinaryExpression": {
      const expression = AsBinaryExpression(input.program.source.ast, node);
      const left = expression?.Left === undefined ? undefined : planEnumConstantExpression(expression.Left, sourceFile, input, diagnostics);
      const right = expression?.Right === undefined ? undefined : planEnumConstantExpression(expression.Right, sourceFile, input, diagnostics);
      const operatorToken = getEnumConstantBinaryOperatorToken(
        input.program.source.ast.operatorKindName(node),
      );
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
