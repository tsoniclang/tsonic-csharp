import type {
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

export function nodeHasModifierKind(ast: AstReader, node: Node | undefined, modifierKind: string): boolean {
  const modifiers = getNodeField(node, "modifiers") ?? getNodeField(node, "Modifiers");
  if (typeof modifiers === "function") {
    return getNodeList(modifiers.call(node)).some((modifier) => ast.kindName(modifier) === modifierKind);
  }
  return getNodeList(modifiers).some((modifier) => ast.kindName(modifier) === modifierKind);
}

export function getNodeParent(node: Node | undefined): Node | undefined {
  return asNodeSubject(getNodeField(node, "Parent"));
}

export function getPropertyAccessName(node: Node, ast: AstReader): string | undefined {
  if (!ast.is.IsPropertyAccessExpression(node)) {
    return undefined;
  }
  const name = asNodeSubject(getNodeField(node, "name"));
  const text = name === undefined ? "" : ast.text(name);
  return text.length === 0 ? undefined : text;
}

export function getNodeNameText(node: Node): string {
  const name = asNodeSubject(getNodeField(node, "name"));
  const text = (name as { readonly Text?: unknown } | undefined)?.Text;
  return typeof text === "function" || text === undefined ? "" : String(text);
}

export function getStructuralChildNodes(node: Node): readonly Node[] {
  const children: Node[] = [];
  const listFields = ["Statements", "Members", "Parameters", "TypeParameters", "TypeArguments", "Types", "Arguments", "Elements", "Properties", "Declarations"];
  for (const key of listFields) {
    children.push(...getNodeList(getNodeField(node, key)));
  }
  const nodeFields = [
    "name",
    "Body",
    "Type",
    "ElementType",
    "Constraint",
    "Expression",
    "Initializer",
    "Left",
    "Right",
    "ThenStatement",
    "ElseStatement",
    "Statement",
    "DeclarationList",
    "ImportClause",
    "NamedBindings",
    "ModuleSpecifier",
    "TypeName",
  ];
  for (const key of nodeFields) {
    const direct = asNodeSubject(getNodeField(node, key));
    if (direct !== undefined) {
      children.push(direct);
    }
  }
  return children;
}
