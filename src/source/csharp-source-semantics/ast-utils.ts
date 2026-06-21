import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";

export function asNodeSubject(subject: unknown): Node | undefined {
  return typeof subject === "object" &&
    subject !== null &&
    typeof (subject as { readonly Kind?: unknown }).Kind === "number"
    ? subject as Node
    : undefined;
}

export function isTypeSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  const kind = ast.kindName(node);
  if (
    kind === "KindAnyKeyword" ||
    kind === "KindUnknownKeyword" ||
    kind === "KindBooleanKeyword" ||
    kind === "KindNumberKeyword" ||
    kind === "KindStringKeyword" ||
    kind === "KindBigIntKeyword" ||
    kind === "KindVoidKeyword" ||
    kind === "KindNeverKeyword" ||
    kind === "KindObjectKeyword" ||
    kind === "KindSymbolKeyword" ||
    kind === "KindTypeReference" ||
    kind === "KindUnionType" ||
    kind === "KindIntersectionType" ||
    kind === "KindArrayType" ||
    kind === "KindTupleType" ||
    kind === "KindTypeLiteral" ||
    kind === "KindFunctionType" ||
    kind === "KindConstructorType" ||
    kind === "KindLiteralType" ||
    kind === "KindIndexedAccessType" ||
    kind === "KindConditionalType" ||
    kind === "KindInferType" ||
    kind === "KindMappedType" ||
    kind === "KindOptionalType" ||
    kind === "KindRestType" ||
    kind === "KindParenthesizedType" ||
    kind === "KindTemplateLiteralType" ||
    kind === "KindImportType" ||
    kind === "KindThisType"
  ) {
    return true;
  }
  return ast.is.IsKeywordTypeNode(node) ||
    ast.is.IsTypeReferenceNode(node) ||
    ast.is.IsUnionTypeNode(node) ||
    ast.is.IsIntersectionTypeNode(node) ||
    ast.is.IsConditionalTypeNode(node) ||
    ast.is.IsInferTypeNode(node) ||
    ast.is.IsArrayTypeNode(node) ||
    ast.is.IsIndexedAccessTypeNode(node) ||
    ast.is.IsLiteralTypeNode(node) ||
    ast.is.IsThisTypeNode(node) ||
    ast.is.IsMappedTypeNode(node) ||
    ast.is.IsTupleTypeNode(node) ||
    ast.is.IsOptionalTypeNode(node) ||
    ast.is.IsRestTypeNode(node) ||
    ast.is.IsParenthesizedTypeNode(node) ||
    ast.is.IsFunctionTypeNode(node) ||
    ast.is.IsConstructorTypeNode(node) ||
    ast.is.IsTemplateLiteralTypeNode(node) ||
    ast.is.IsImportTypeNode(node);
}

export function isTypeLiteralLikeNode(node: Node): boolean {
  return getNodeList(getNodeField(node, "Members")).length > 0 &&
    getNodeField(node, "name") === undefined &&
    getNodeField(node, "HeritageClauses") === undefined;
}

export function visitStructuralNodes(
  node: Node,
  visitor: (node: Node) => void,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  visitor(node);
  for (const child of getStructuralChildNodes(node)) {
    visitStructuralNodes(child, visitor, seen);
  }
}

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
  const record = node as unknown as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(record, field) ? record[field] : undefined;
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
