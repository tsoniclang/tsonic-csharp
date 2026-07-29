import type { AstReader, Node, SourceFile } from "@tsonic/tsts";

export const ModifierFlagsPublic = 1 << 0;
export const ModifierFlagsPrivate = 1 << 1;
export const ModifierFlagsProtected = 1 << 2;
export const ModifierFlagsReadonly = 1 << 3;
export const ModifierFlagsOverride = 1 << 4;
export const ModifierFlagsExport = 1 << 5;
export const ModifierFlagsAbstract = 1 << 6;
export const ModifierFlagsAmbient = 1 << 7;
export const ModifierFlagsStatic = 1 << 8;
export const ModifierFlagsAccessor = 1 << 9;
export const ModifierFlagsAsync = 1 << 10;
export const ModifierFlagsConst = 1 << 12;
export const NodeFlagsConst = 1 << 1;

export function HasSyntacticModifier(ast: AstReader, node: Node, flag: number): boolean {
  return ast.hasModifier(node, flag);
}

export function Node_Text(ast: AstReader, node: Node | undefined): string {
  return node === undefined ? "" : ast.text(node);
}

export function Node_Name(ast: AstReader, node: Node | undefined): Node | undefined {
  return node === undefined ? undefined : ast.name(node);
}

export function Node_Expression(ast: AstReader, node: Node | undefined): Node | undefined {
  if (node === undefined) {
    return undefined;
  }
  return ast.as.AsPropertyAccessExpression(node)?.Expression ??
    ast.as.AsElementAccessExpression(node)?.Expression ??
    ast.as.AsCallExpression(node)?.Expression ??
    ast.as.AsNewExpression(node)?.Expression ??
    ast.as.AsParenthesizedExpression(node)?.Expression ??
    ast.as.AsTypeAssertion(node)?.Expression ??
    ast.as.AsAsExpression(node)?.Expression ??
    ast.as.AsSatisfiesExpression(node)?.Expression ??
    ast.as.AsNonNullExpression(node)?.Expression ??
    ast.as.AsSpreadElement(node)?.Expression ??
    ast.as.AsDeleteExpression(node)?.Expression ??
    ast.as.AsTypeOfExpression(node)?.Expression ??
    ast.as.AsVoidExpression(node)?.Expression ??
    ast.as.AsAwaitExpression(node)?.Expression;
}

export function SourceFile_FileName(sourceFile: SourceFile): string {
  const fileName = (sourceFile as { readonly FileName?: unknown }).FileName;
  return typeof fileName === "function" ? String(fileName()) : String(fileName ?? "");
}

export function isAstNode(
  ast: AstReader,
  value: unknown,
): value is Node {
  return typeof value === "object" &&
    value !== null &&
    ast.kind(value as Node) !== undefined;
}
