import type {
  CsharpAssignmentOperatorToken,
  CsharpBinaryOperatorToken,
  CsharpPostfixUnaryOperatorToken,
  CsharpPrefixUnaryOperatorToken,
} from "./index.js";
import { csharpNativeAssignmentTokens, csharpNativeBinaryTokens } from "../../../target-model/syntax/native-binary.js";

export function csharpBinaryOperatorTokenFromText(text: string): CsharpBinaryOperatorToken | undefined {
  const kind = Object.prototype.hasOwnProperty.call(csharpNativeBinaryTokens, text) ? csharpNativeBinaryTokens[text as keyof typeof csharpNativeBinaryTokens] : undefined;
  return kind === undefined ? undefined : { kind };
}

export function csharpAssignmentOperatorTokenFromText(text: string): CsharpAssignmentOperatorToken | undefined {
  const kind = Object.prototype.hasOwnProperty.call(csharpNativeAssignmentTokens, text) ? csharpNativeAssignmentTokens[text as keyof typeof csharpNativeAssignmentTokens] : undefined;
  return kind === undefined ? undefined : { kind };
}

export function csharpPrefixUnaryOperatorTokenFromText(text: string): CsharpPrefixUnaryOperatorToken | undefined {
  switch (text) {
    case "+":
      return { kind: "PlusToken" };
    case "-":
      return { kind: "MinusToken" };
    case "~":
      return { kind: "TildeToken" };
    case "!":
      return { kind: "ExclamationToken" };
    case "++":
      return { kind: "PlusPlusToken" };
    case "--":
      return { kind: "MinusMinusToken" };
    default:
      return undefined;
  }
}

export function csharpPostfixUnaryOperatorTokenFromText(text: string): CsharpPostfixUnaryOperatorToken | undefined {
  switch (text) {
    case "++":
      return { kind: "PlusPlusToken" };
    case "--":
      return { kind: "MinusMinusToken" };
    default:
      return undefined;
  }
}
