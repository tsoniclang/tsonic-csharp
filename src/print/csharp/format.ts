export function indentLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.length === 0 ? line : `    ${line}`);
}

export function printLiteral(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return `"${escapeCsharpStringText(value, false)}"`;
  }
  return String(value);
}

export function printNumericLiteral(value: number, suffix: "F" | "D" | "M" | undefined): string {
  return `${String(value)}${suffix ?? ""}`;
}

export function printIntegerLiteral(value: string, suffix: "L" | "UL"): string {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error("C# integer literal digits must be canonical unsigned decimal text.");
  }
  return `${value}${suffix}`;
}

export function printCharLiteral(value: string): string {
  return `'${escapeCsharpCharLiteral(value)}'`;
}

export function escapeCsharpInterpolatedStringText(value: string): string {
  return escapeCsharpStringText(value, true);
}

function escapeCsharpStringText(value: string, interpolated: boolean): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    const code = value.charCodeAt(index);
    switch (character) {
      case "\\":
        result += "\\\\";
        break;
      case "\"":
        result += "\\\"";
        break;
      case "\0":
        result += "\\0";
        break;
      case "\b":
        result += "\\b";
        break;
      case "\f":
        result += "\\f";
        break;
      case "\n":
        result += "\\n";
        break;
      case "\r":
        result += "\\r";
        break;
      case "\t":
        result += "\\t";
        break;
      case "\v":
        result += "\\v";
        break;
      case "{":
        result += interpolated ? "{{" : character;
        break;
      case "}":
        result += interpolated ? "}}" : character;
        break;
      default:
        if (code >= 0xd800 && code <= 0xdbff) {
          const nextCode = value.charCodeAt(index + 1);
          if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
            result += character + value[index + 1]!;
            index += 1;
          } else {
            result += unicodeEscape(code);
          }
        } else if (
          code < 0x20 ||
          code >= 0x7f && code <= 0x9f ||
          code >= 0xdc00 && code <= 0xdfff ||
          code === 0x2028 ||
          code === 0x2029
        ) {
          result += unicodeEscape(code);
        } else {
          result += character;
        }
        break;
    }
  }
  return result;
}

function unicodeEscape(code: number): string {
  return `\\u${code.toString(16).padStart(4, "0")}`;
}

function escapeCsharpCharLiteral(value: string): string {
  switch (value) {
    case "'":
      return "\\'";
    case "\\":
      return "\\\\";
    case "\0":
      return "\\0";
    case "\b":
      return "\\b";
    case "\f":
      return "\\f";
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "\t":
      return "\\t";
    case "\v":
      return "\\v";
    default: {
      const code = value.charCodeAt(0);
      if (code < 0x20 || code >= 0xd800 && code <= 0xdfff) {
        return `\\u${code.toString(16).padStart(4, "0")}`;
      }
      return value;
    }
  }
}
