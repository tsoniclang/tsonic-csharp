import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTypePolicy,
  TargetTypeRef,
} from "../types/index.js";
import {
  isCsharpJsRegExpTargetType,
} from "../types/index.js";

export interface CsharpRegularExpressionLiteralPolicyHost {
  readonly ast: {
    readonly is: {
      readonly IsRegularExpressionLiteral: (node: Node | undefined) => boolean;
    };
    readonly text: (node: Node | undefined) => string;
  };
  readonly types: CsharpTypePolicy;
}

export type CsharpRegularExpressionLiteralSelection =
  | {
      readonly kind: "resolved";
      readonly pattern: string;
      readonly flags: string;
      readonly targetType: TargetTypeRef;
    }
  | {
      readonly kind: "rejected";
      readonly code:
        | "CSHARP_JS_REGEXP_SYNTAX_INVALID"
        | "CSHARP_JS_REGEXP_UNSUPPORTED"
        | "CSHARP_JS_REGEXP_TARGET_NOT_PROVEN";
      readonly message: string;
    };

export function selectCsharpRegularExpressionLiteral(
  host: CsharpRegularExpressionLiteralPolicyHost,
  node: Node,
  sourceFile: SourceFile,
): CsharpRegularExpressionLiteralSelection {
  if (!host.ast.is.IsRegularExpressionLiteral(node)) {
    return {
      kind: "rejected",
      code: "CSHARP_JS_REGEXP_SYNTAX_INVALID",
      message: "The source node is not a regular-expression literal.",
    };
  }
  const literal = parseRegularExpressionLiteral(host.ast.text(node));
  if (literal === undefined) {
    return {
      kind: "rejected",
      code: "CSHARP_JS_REGEXP_SYNTAX_INVALID",
      message: "The regular-expression literal has no exact pattern/flags boundary.",
    };
  }
  const validation = validateCsharpJsRegExpPatternAndFlags(
    literal.pattern,
    literal.flags,
  );
  if (validation.kind !== "valid") {
    return {
      kind: "rejected",
      code: validation.kind === "unsupported"
        ? "CSHARP_JS_REGEXP_UNSUPPORTED"
        : "CSHARP_JS_REGEXP_SYNTAX_INVALID",
      message:
        `C# JS RegExp supports only the proven ECMAScript-compatible subset. ${validation.message}`,
    };
  }
  const targetType = host.types.resolveNode(node, sourceFile);
  if (!isCsharpJsRegExpTargetType(targetType)) {
    return {
      kind: "rejected",
      code: "CSHARP_JS_REGEXP_TARGET_NOT_PROVEN",
      message:
        "A regular-expression literal requires the explicit JS source profile and its closed C# RegExp target relation.",
    };
  }
  return {
    kind: "resolved",
    pattern: literal.pattern,
    flags: literal.flags,
    targetType,
  };
}

function parseRegularExpressionLiteral(
  text: string,
): { readonly pattern: string; readonly flags: string } | undefined {
  if (!text.startsWith("/")) {
    return undefined;
  }
  let escaped = false;
  let inCharacterClass = false;
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "[" && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (character === "]" && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (character === "/" && !inCharacterClass) {
      return {
        pattern: text.slice(1, index),
        flags: text.slice(index + 1),
      };
    }
  }
  return undefined;
}

type CsharpJsRegExpValidationResult =
  | { readonly kind: "valid" }
  | { readonly kind: "syntax-error"; readonly message: string }
  | { readonly kind: "unsupported"; readonly message: string };

function validateCsharpJsRegExpPatternAndFlags(
  pattern: string,
  flags: string,
): CsharpJsRegExpValidationResult {
  const flagsValidation = validateRegExpFlags(flags);
  return flagsValidation.kind === "valid"
    ? validateRegExpPattern(pattern)
    : flagsValidation;
}

function validateRegExpFlags(
  flags: string,
): CsharpJsRegExpValidationResult {
  const seen = new Set<string>();
  for (const flag of flags) {
    if (seen.has(flag)) {
      return {
        kind: "syntax-error",
        message: `Duplicate RegExp flag '${flag}'.`,
      };
    }
    seen.add(flag);
    switch (flag) {
      case "g":
      case "i":
      case "m":
      case "s":
      case "y":
        break;
      case "d":
        return {
          kind: "unsupported",
          message: "RegExp flag 'd' requires hasIndices match result semantics.",
        };
      case "u":
        return {
          kind: "unsupported",
          message: "RegExp flag 'u' requires ECMAScript Unicode-mode pattern semantics.",
        };
      case "v":
        return {
          kind: "unsupported",
          message: "RegExp flag 'v' requires ECMAScript Unicode-sets semantics.",
        };
      default:
        return {
          kind: "syntax-error",
          message: `Invalid RegExp flag '${flag}'.`,
        };
    }
  }
  return { kind: "valid" };
}

function validateRegExpPattern(
  pattern: string,
): CsharpJsRegExpValidationResult {
  for (let index = 0; index < pattern.length; index += 1) {
    const current = pattern[index]!;
    if (current === "\\") {
      const escape = validateEscape(pattern, index);
      if (escape.result.kind !== "valid") {
        return escape.result;
      }
      index = escape.nextIndex;
      continue;
    }
    if (current === "[") {
      const characterClass = validateCharacterClass(pattern, index);
      if (characterClass.result.kind !== "valid") {
        return characterClass.result;
      }
      index = characterClass.nextIndex;
      continue;
    }
    if (current === "(") {
      const group = validateGroupPrefix(pattern, index);
      if (group.kind !== "valid") {
        return group;
      }
    }
  }
  return { kind: "valid" };
}

function validateEscape(
  pattern: string,
  slashIndex: number,
): {
  readonly result: CsharpJsRegExpValidationResult;
  readonly nextIndex: number;
} {
  if (slashIndex + 1 >= pattern.length) {
    return {
      result: {
        kind: "syntax-error",
        message: "RegExp pattern ends with an incomplete escape.",
      },
      nextIndex: slashIndex,
    };
  }
  const escaped = pattern[slashIndex + 1]!;
  if (
    (escaped === "p" || escaped === "P") &&
    pattern[slashIndex + 2] === "{"
  ) {
    return {
      result: {
        kind: "unsupported",
        message: "Unicode property escapes require ECMAScript Unicode semantics.",
      },
      nextIndex: slashIndex + 1,
    };
  }
  if (escaped === "k" && pattern[slashIndex + 2] === "<") {
    return {
      result: {
        kind: "unsupported",
        message: "Named backreferences are not in the proven subset.",
      },
      nextIndex: slashIndex + 1,
    };
  }
  if (escaped >= "1" && escaped <= "9") {
    return {
      result: {
        kind: "unsupported",
        message:
          "Numeric backreferences and legacy numeric escapes are not in the proven subset.",
      },
      nextIndex: slashIndex + 1,
    };
  }
  return {
    result: { kind: "valid" },
    nextIndex: slashIndex + 1,
  };
}

function validateCharacterClass(
  pattern: string,
  classStart: number,
): {
  readonly result: CsharpJsRegExpValidationResult;
  readonly nextIndex: number;
} {
  let escaped = false;
  for (let index = classStart + 1; index < pattern.length; index += 1) {
    const current = pattern[index]!;
    if (escaped) {
      if (
        (current === "p" || current === "P") &&
        pattern[index + 1] === "{"
      ) {
        return {
          result: {
            kind: "unsupported",
            message:
              "Unicode property escapes inside character classes require ECMAScript Unicode semantics.",
          },
          nextIndex: index,
        };
      }
      escaped = false;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      continue;
    }
    if (current === "]") {
      return {
        result: { kind: "valid" },
        nextIndex: index,
      };
    }
  }
  return {
    result: {
      kind: "syntax-error",
      message: "Unterminated RegExp character class.",
    },
    nextIndex: pattern.length - 1,
  };
}

function validateGroupPrefix(
  pattern: string,
  groupStart: number,
): CsharpJsRegExpValidationResult {
  if (pattern[groupStart + 1] !== "?") {
    return { kind: "valid" };
  }
  const marker = pattern[groupStart + 2];
  if (marker === undefined) {
    return {
      kind: "syntax-error",
      message: "Incomplete RegExp group prefix.",
    };
  }
  switch (marker) {
    case ":":
    case "=":
    case "!":
      return { kind: "valid" };
    case "<":
      return {
        kind: "unsupported",
        message: pattern[groupStart + 3] === "=" ||
            pattern[groupStart + 3] === "!"
          ? "Lookbehind assertions are not in the proven subset."
          : "Named capture groups are not in the proven subset.",
      };
    case ">":
      return {
        kind: "unsupported",
        message: ".NET atomic groups are not ECMAScript RegExp syntax.",
      };
    case "#":
      return {
        kind: "unsupported",
        message: ".NET comment groups are not ECMAScript RegExp syntax.",
      };
    case "(":
      return {
        kind: "unsupported",
        message: ".NET conditional groups are not ECMAScript RegExp syntax.",
      };
    default:
      return isAsciiLetter(marker) || marker === "-"
        ? {
            kind: "unsupported",
            message: ".NET inline option groups are not ECMAScript RegExp syntax.",
          }
        : {
            kind: "syntax-error",
            message: `Unsupported RegExp group prefix '(?${marker}'.`,
          };
  }
}

function isAsciiLetter(value: string): boolean {
  return (value >= "A" && value <= "Z") ||
    (value >= "a" && value <= "z");
}
