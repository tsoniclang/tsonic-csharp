export function indentLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.length === 0 ? line : `    ${line}`);
}

export function printLiteral(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function printCharLiteral(value: string): string {
  return `'${escapeCsharpCharLiteral(value)}'`;
}

export function escapeCsharpInterpolatedStringText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/{/g, "{{")
    .replace(/}/g, "}}")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
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
