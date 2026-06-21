import type { Node, SourceFile } from "@tsonic/tsts";

export const ModifierFlagsPublic = 1 << 0;
export const ModifierFlagsPrivate = 1 << 1;
export const ModifierFlagsProtected = 1 << 2;
export const ModifierFlagsReadonly = 1 << 3;
export const ModifierFlagsOverride = 1 << 4;
export const ModifierFlagsAbstract = 1 << 6;
export const ModifierFlagsAmbient = 1 << 7;
export const ModifierFlagsStatic = 1 << 8;
export const ModifierFlagsAccessor = 1 << 9;
export const ModifierFlagsAsync = 1 << 10;
export const NodeFlagsConst = 1 << 1;

export function HasSyntacticModifier(node: Node, flag: number): boolean {
  const modifierFlags = Number(
    (node as { readonly ModifierFlags?: unknown }).ModifierFlags ??
      (node as { readonly modifiers?: { readonly ModifierFlags?: unknown } }).modifiers?.ModifierFlags ??
      0,
  );
  return (modifierFlags & flag) !== 0;
}

export function Node_Text(node: Node | undefined): string {
  const text = (node as { readonly Text?: unknown; readonly text?: unknown } | undefined)?.Text ??
    (node as { readonly text?: unknown } | undefined)?.text;
  return typeof text === "function" ? "" : String(text ?? "");
}

export function Node_Name(node: Node | undefined): Node | undefined {
  return nodeField(node, "Name", "name");
}

export function Node_Expression(node: Node | undefined): Node | undefined {
  return nodeField(node, "Expression", "expression");
}

export function Node_Symbol(node: Node | undefined): object | undefined {
  return (node as { readonly Symbol?: object } | undefined)?.Symbol;
}

export function SourceFile_FileName(sourceFile: SourceFile): string {
  const fileName = (sourceFile as { readonly FileName?: unknown }).FileName;
  return typeof fileName === "function" ? String(fileName()) : String(fileName ?? "");
}

export function isAstNode(value: unknown): value is Node {
  const kind = (value as { readonly Kind?: unknown } | undefined)?.Kind;
  return typeof value === "object" &&
    value !== null &&
    (typeof kind === "number" || typeof kind === "string");
}

function nodeField(node: Node | undefined, upperName: string, lowerName: string): Node | undefined {
  const upperValue = (node as Record<string, unknown> | undefined)?.[upperName];
  if (isAstNode(upperValue)) {
    return upperValue;
  }
  const lowerValue = (node as Record<string, unknown> | undefined)?.[lowerName];
  return isAstNode(lowerValue) ? lowerValue : undefined;
}
