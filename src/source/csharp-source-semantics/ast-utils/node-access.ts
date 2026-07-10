import type {
  AstModifierKind,
  AstReader,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../../fact-subjects.js";

export function getNodeList(value: unknown): readonly Node[] {
  const nodes = (value as { readonly Nodes?: readonly unknown[] } | undefined)?.Nodes;
  return nodes === undefined
    ? []
    : nodes.map(asNodeSubject).filter((node): node is Node => node !== undefined);
}

export function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(node, field)?.value;
}

export function nodeHasModifierKind(ast: AstReader, node: Node | undefined, modifierKind: AstModifierKind): boolean {
  return node !== undefined && ast.hasModifierKind(node, modifierKind);
}

export function getNodeParent(ast: AstReader | undefined, node: Node | undefined): Node | undefined {
  return ast === undefined || node === undefined ? undefined : ast.parent(node);
}

export function getPropertyAccessName(node: Node, ast: AstReader): string | undefined {
  if (!ast.is.IsPropertyAccessExpression(node)) {
    return undefined;
  }
  const name = ast.name(node);
  const text = name === undefined ? "" : ast.text(name);
  return text.length === 0 ? undefined : text;
}

export function getNodeNameText(ast: AstReader, node: Node): string {
  const name = ast.name(node);
  return name === undefined ? "" : ast.text(name);
}
