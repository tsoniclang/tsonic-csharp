import { KindString, SourceFile_FileName } from "./source-ast.js";
import type {
  ExtensionDiagnostic,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api";

export interface BackendDiagnosticOptions {
  readonly evidence?: readonly string[];
  readonly sourceFile?: SourceFile;
}

export function selectedPolicyDiagnostic(
  node: Node,
  diagnostic: ExtensionDiagnostic,
  sourceFile?: SourceFile,
): TargetDiagnostic {
  const evidence = uniqueEvidence([
    ...(diagnostic.evidence?.map((entry) => entry.message) ?? []),
    ...sourceLocationEvidence(node, sourceFile),
  ]);
  const sourceSpan = structuredSourceSpan(node, sourceFile);
  return {
    code: `TS${diagnostic.numericCode}`,
    category: diagnostic.category,
    source: diagnostic.extensionId,
    message: diagnostic.message,
    ...(sourceSpan === undefined ? {} : { sourceSpan }),
    ...(evidence.length === 0 ? {} : { evidence }),
  };
}

export function targetPolicyDiagnostic(
  node: Node,
  code: string,
  message: string,
  sourceFile?: SourceFile,
  evidence: readonly string[] = [],
): TargetDiagnostic {
  const completeEvidence = uniqueEvidence([
    ...evidence,
    ...sourceLocationEvidence(node, sourceFile),
  ]);
  const sourceSpan = structuredSourceSpan(node, sourceFile);
  return {
    code,
    category: "error",
    source: "tsonic-csharp",
    message,
    ...(sourceSpan === undefined ? {} : { sourceSpan }),
    ...(completeEvidence.length === 0
      ? {}
      : { evidence: completeEvidence }),
  };
}

export function unsupportedNodeDiagnostic(
  node: Node,
  message: string,
  evidenceOrOptions: readonly string[] | BackendDiagnosticOptions = [],
): TargetDiagnostic {
  const options: BackendDiagnosticOptions = isStringEvidenceArray(evidenceOrOptions)
    ? { evidence: evidenceOrOptions }
    : evidenceOrOptions;
  const evidence = uniqueEvidence([
    ...(options.evidence ?? []),
    ...sourceLocationEvidence(node, options.sourceFile),
  ]);
  const sourceSpan = structuredSourceSpan(node, options.sourceFile);
  return {
    code: "CSHARP_UNSUPPORTED_AST",
    category: "error",
    source: "tsonic-csharp",
    message: `${message} Node kind: ${KindString(node.Kind)}.`,
    ...(sourceSpan === undefined ? {} : { sourceSpan }),
    ...(evidence.length === 0 ? {} : { evidence }),
  };
}

export function sourceLocationEvidence(
  node: Node | undefined,
  sourceFile: SourceFile | undefined = sourceFileForNode(node),
): readonly string[] {
  if (sourceFile === undefined) {
    return [];
  }
  const fileName = SourceFile_FileName(sourceFile);
  const span = sourceByteSpan(node);
  return [
    ...(fileName.length === 0 ? [] : [`source.module=${fileName}`, `source.file=${fileName}`]),
    ...(span === undefined ? [] : sourceSpanEvidence(sourceFile, span)),
  ];
}

function sourceSpanEvidence(
  sourceFile: SourceFile,
  span: { readonly pos: number; readonly end: number },
): readonly string[] {
  const text = sourceFileText(sourceFile);
  if (text === undefined) {
    return [`source.byteSpan=${span.pos}-${span.end}`];
  }
  const start = sourceLocationFromByteOffset(text, span.pos);
  const end = sourceLocationFromByteOffset(text, span.end);
  return start === undefined || end === undefined
    ? [`source.byteSpan=${span.pos}-${span.end}`]
    : [
        `source.span=${start.line}:${start.column}-${end.line}:${end.column}`,
        `source.byteSpan=${span.pos}-${span.end}`,
      ];
}

function structuredSourceSpan(
  node: Node | undefined,
  sourceFile: SourceFile | undefined = sourceFileForNode(node),
): TargetDiagnostic["sourceSpan"] | undefined {
  if (sourceFile === undefined) {
    return undefined;
  }
  const fileName = SourceFile_FileName(sourceFile);
  if (fileName.length === 0) {
    return undefined;
  }
  const span = sourceByteSpan(node);
  const text = sourceFileText(sourceFile);
  if (span === undefined || text === undefined) {
    return undefined;
  }
  const start = sourceLocationFromByteOffset(text, span.pos);
  const end = sourceLocationFromByteOffset(text, span.end);
  return start === undefined || end === undefined
    ? undefined
    : {
        fileName,
        line: start.line,
        column: start.column,
        endLine: end.line,
        endColumn: end.column,
      };
}

function sourceFileForNode(node: Node | undefined): SourceFile | undefined {
  let current: unknown = node;
  const seen = new Set<object>();
  while (isObject(current) && !seen.has(current)) {
    seen.add(current);
    if (isSourceFileLike(current)) {
      return current as SourceFile;
    }
    current = getObjectMember(current, "Parent") ?? getObjectMember(current, "parent");
  }
  return undefined;
}

function sourceByteSpan(node: Node | undefined): { readonly pos: number; readonly end: number } | undefined {
  if (!isObject(node)) {
    return undefined;
  }
  const loc = getObjectMember(node, "Loc");
  const locPos = isObject(loc) ? numberMember(loc, "pos") : undefined;
  const locEnd = isObject(loc) ? numberMember(loc, "end") : undefined;
  const pos = locPos ?? numberMember(node, "pos") ?? numberMethod(node, "Pos");
  const end = locEnd ?? numberMember(node, "end") ?? numberMethod(node, "End");
  return pos === undefined || end === undefined || pos < 0 || end < pos
    ? undefined
    : { pos, end };
}

function isSourceFileLike(value: object): boolean {
  return hasSourceFileName(value) &&
    (getObjectMember(value, "Statements") !== undefined || String(getObjectMember(value, "Kind") ?? "") === "KindSourceFile");
}

function hasSourceFileName(value: object): boolean {
  const fileName = getObjectMember(value, "FileName") ?? getObjectMember(value, "fileName");
  return typeof fileName === "string" || typeof fileName === "function";
}

function sourceFileText(sourceFile: SourceFile): string | undefined {
  const text = getObjectMember(sourceFile, "Text") ?? getObjectMember(sourceFile, "text");
  if (typeof text === "string") {
    return text;
  }
  if (typeof text !== "function") {
    return undefined;
  }
  const result = text.call(sourceFile);
  return typeof result === "string" ? result : undefined;
}

function sourceLocationFromByteOffset(
  text: string,
  targetOffset: number,
): { readonly line: number; readonly column: number } | undefined {
  if (!Number.isSafeInteger(targetOffset) || targetOffset < 0) {
    return undefined;
  }
  let byteOffset = 0;
  let line = 1;
  let column = 1;
  for (let index = 0; index < text.length;) {
    if (byteOffset === targetOffset) {
      return { line, column };
    }
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }
    const width = codePoint > 0xffff ? 2 : 1;
    if (codePoint === 0x0d && text.codePointAt(index + width) === 0x0a) {
      const nextByteOffset = byteOffset + utf8ByteLength(codePoint) + utf8ByteLength(0x0a);
      if (targetOffset < nextByteOffset) {
        return { line, column };
      }
      byteOffset = nextByteOffset;
      index += width + 1;
      line += 1;
      column = 1;
      continue;
    }
    const nextByteOffset = byteOffset + utf8ByteLength(codePoint);
    if (targetOffset < nextByteOffset) {
      return { line, column };
    }
    byteOffset = nextByteOffset;
    index += width;
    if (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x2028 || codePoint === 0x2029) {
      line += 1;
      column = 1;
    } else {
      column += width;
    }
  }
  return byteOffset === targetOffset ? { line, column } : undefined;
}

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) {
    return 1;
  }
  if (codePoint <= 0x7ff) {
    return 2;
  }
  return codePoint <= 0xffff ? 3 : 4;
}

function uniqueEvidence(evidence: readonly string[]): readonly string[] {
  return [...new Set(evidence)];
}

function isStringEvidenceArray(value: readonly string[] | BackendDiagnosticOptions): value is readonly string[] {
  return Array.isArray(value);
}

function numberMethod(value: object, methodName: string): number | undefined {
  const method = getObjectMember(value, methodName);
  if (typeof method !== "function") {
    return undefined;
  }
  const result = method.call(value);
  return typeof result === "number" && Number.isSafeInteger(result) ? result : undefined;
}

function numberMember(value: object, memberName: string): number | undefined {
  const member = getObjectMember(value, memberName);
  return typeof member === "number" && Number.isSafeInteger(member) ? member : undefined;
}

function getObjectMember(value: object, memberName: string): unknown {
  return (value as Record<string, unknown>)[memberName];
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
