export type CsharpJsRegExpValidationResult =
  | { readonly kind: "valid" }
  | { readonly kind: "syntax-error"; readonly message: string }
  | { readonly kind: "unsupported"; readonly message: string };

export function validateCsharpJsRegExpPatternAndFlags(
  pattern: string,
  flags: string,
): CsharpJsRegExpValidationResult {
  const flagsValidation = validateRegExpFlags(flags);
  if (flagsValidation.kind !== "valid") {
    return flagsValidation;
  }
  return validateRegExpPattern(pattern);
}

function validateRegExpFlags(flags: string): CsharpJsRegExpValidationResult {
  const seen = new Set<string>();
  for (const flag of flags) {
    if (seen.has(flag)) {
      return { kind: "syntax-error", message: `Duplicate RegExp flag '${flag}'.` };
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
        return { kind: "unsupported", message: "RegExp flag 'd' requires hasIndices match result semantics." };
      case "u":
        return { kind: "unsupported", message: "RegExp flag 'u' requires ECMAScript Unicode-mode pattern semantics." };
      case "v":
        return { kind: "unsupported", message: "RegExp flag 'v' requires ECMAScript Unicode-sets semantics." };
      default:
        return { kind: "syntax-error", message: `Invalid RegExp flag '${flag}'.` };
    }
  }
  return { kind: "valid" };
}

function validateRegExpPattern(pattern: string): CsharpJsRegExpValidationResult {
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
): { readonly result: CsharpJsRegExpValidationResult; readonly nextIndex: number } {
  if (slashIndex + 1 >= pattern.length) {
    return { result: { kind: "syntax-error", message: "RegExp pattern ends with an incomplete escape." }, nextIndex: slashIndex };
  }
  const escaped = pattern[slashIndex + 1]!;
  switch (escaped) {
    case "p":
    case "P":
      if (slashIndex + 2 < pattern.length && pattern[slashIndex + 2] === "{") {
        return { result: { kind: "unsupported", message: "Unicode property escapes require ECMAScript Unicode semantics." }, nextIndex: slashIndex + 1 };
      }
      return { result: { kind: "valid" }, nextIndex: slashIndex + 1 };
    case "k":
      if (slashIndex + 2 < pattern.length && pattern[slashIndex + 2] === "<") {
        return { result: { kind: "unsupported", message: "Named backreferences are not in the proven RegExp subset." }, nextIndex: slashIndex + 1 };
      }
      return { result: { kind: "valid" }, nextIndex: slashIndex + 1 };
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
    case "7":
    case "8":
    case "9":
      return { result: { kind: "unsupported", message: "Numeric backreferences and legacy numeric escapes are not in the proven RegExp subset." }, nextIndex: slashIndex + 1 };
    default:
      return { result: { kind: "valid" }, nextIndex: slashIndex + 1 };
  }
}

function validateCharacterClass(
  pattern: string,
  classStart: number,
): { readonly result: CsharpJsRegExpValidationResult; readonly nextIndex: number } {
  let escaped = false;
  for (let index = classStart + 1; index < pattern.length; index += 1) {
    const current = pattern[index]!;
    if (escaped) {
      if ((current === "p" || current === "P") && index + 1 < pattern.length && pattern[index + 1] === "{") {
        return { result: { kind: "unsupported", message: "Unicode property escapes inside character classes require ECMAScript Unicode semantics." }, nextIndex: index };
      }
      escaped = false;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      continue;
    }
    if (current === "]") {
      return { result: { kind: "valid" }, nextIndex: index };
    }
  }
  return { result: { kind: "syntax-error", message: "Unterminated RegExp character class." }, nextIndex: pattern.length - 1 };
}

function validateGroupPrefix(
  pattern: string,
  groupStart: number,
): CsharpJsRegExpValidationResult {
  if (groupStart + 1 >= pattern.length || pattern[groupStart + 1] !== "?") {
    return { kind: "valid" };
  }
  if (groupStart + 2 >= pattern.length) {
    return { kind: "syntax-error", message: "Incomplete RegExp group prefix." };
  }
  const marker = pattern[groupStart + 2]!;
  switch (marker) {
    case ":":
    case "=":
    case "!":
      return { kind: "valid" };
    case "<":
      if (groupStart + 3 < pattern.length && (pattern[groupStart + 3] === "=" || pattern[groupStart + 3] === "!")) {
        return { kind: "unsupported", message: "Lookbehind assertions are not in the proven RegExp subset." };
      }
      return { kind: "unsupported", message: "Named capture groups are not in the proven RegExp subset." };
    case ">":
      return { kind: "unsupported", message: ".NET atomic groups are not ECMAScript RegExp syntax." };
    case "#":
      return { kind: "unsupported", message: ".NET comment groups are not ECMAScript RegExp syntax." };
    case "(":
      return { kind: "unsupported", message: ".NET conditional groups are not ECMAScript RegExp syntax." };
    default:
      if (/^[A-Za-z-]$/.test(marker)) {
        return { kind: "unsupported", message: ".NET inline option groups are not ECMAScript RegExp syntax." };
      }
      return { kind: "syntax-error", message: `Unsupported RegExp group prefix '(?${marker}'.` };
  }
}
