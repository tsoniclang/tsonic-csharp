import type { Node, SourceFile, Symbol, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import { csharpObjectShapeFactKey } from "../../source/csharp-facts.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../source/csharp-facts.js";
import { getTargetTypeRefForNode, getTargetTypeRefForType } from "./runtime-carriers.js";
import { HasSourceKind, IsTypeSyntaxNode, KindClassDeclaration, KindTypeLiteral } from "./source-ast.js";

export function getCsharpObjectShapeFactForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  if (node === undefined) {
    return undefined;
  }
  const direct = input.facts.getFact(node, csharpObjectShapeFactKey);
  if (direct !== undefined) {
    return direct;
  }
  if (HasSourceKind(input.ast, node, KindTypeLiteral)) {
    return deriveCsharpObjectShapeFactForNode(node, sourceFile, input);
  }
  const declarationAnnotation = getCsharpObjectShapeFactForDeclarationAnnotation(node, sourceFile, input);
  if (declarationAnnotation !== undefined) {
    return declarationAnnotation;
  }
  const semanticType = IsTypeSyntaxNode(input.ast, node)
    ? input.semantics.getTypeFromTypeNode(node, { sourceFile })
    : input.semantics.getTypeAtLocation(node, { sourceFile });
  return input.facts.getFact(semanticType, csharpObjectShapeFactKey) ??
    input.facts.getFact(semanticType?.symbol, csharpObjectShapeFactKey) ??
    deriveCsharpObjectShapeFactForSemanticType(node, sourceFile, input) ??
    deriveCsharpObjectShapeFactForNode(node, sourceFile, input);
}

function deriveCsharpObjectShapeFactForSemanticType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  const semanticType = IsTypeSyntaxNode(input.ast, node)
    ? input.semantics.getTypeFromTypeNode(node, { sourceFile })
    : input.semantics.getTypeAtLocation(node, { sourceFile });
  if (semanticType === undefined || input.types.isAny(semanticType) || input.types.isUnknown(semanticType)) {
    return undefined;
  }
  const implementedType = getTargetTypeRefForType(input, semanticType, sourceFile);
  if (implementedType?.kind !== "target-specific" ||
    implementedType.target !== "csharp" ||
    implementedType.name !== "project-source-type") {
    return undefined;
  }
  if (isNominalSemanticType(semanticType, input)) {
    return undefined;
  }
  const properties = input.types.getProperties(semanticType, { sourceFile })
    .filter((property): property is Symbol => property !== undefined);
  if (properties.length === 0) {
    return undefined;
  }
  const members = properties
    .map((property) => deriveObjectShapeMemberFromProperty(semanticType, property, sourceFile, input))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (members.length !== properties.length) {
    return undefined;
  }
  return {
    targetType: {
      kind: "target-specific",
      target: "csharp",
      name: "project-source-type",
      value: `${objectShapeBaseName(implementedType)}_${stableNodeId(node, sourceFile, input)}`,
    },
    implements: [implementedType],
    members,
  };
}

function isNominalSemanticType(type: Type, input: TargetCompileInput): boolean {
  const declaration = (type.symbol as { readonly ValueDeclaration?: Node; readonly Declarations?: readonly Node[] } | undefined)?.ValueDeclaration ??
    (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations?.find((candidate) => candidate !== undefined);
  return HasSourceKind(input.ast, declaration, KindClassDeclaration) ||
    HasSourceKind(input.ast, declaration, KindTypeLiteral);
}

function deriveObjectShapeMemberFromProperty(
  ownerType: Type,
  property: Symbol,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = (property as { readonly Name?: unknown }).Name;
  if (typeof sourceName !== "string" || sourceName.length === 0) {
    return undefined;
  }
  const propertyType = input.types.getPropertyType(ownerType, sourceName, { sourceFile });
  const signatures = input.types.getCallSignatures(propertyType, { sourceFile });
  const memberKind = signatures.length > 0 ? "method" : "property";
  const type = memberKind === "method"
    ? deriveFunctionTargetTypeRefFromSignature(signatures[0], sourceFile, input)
    : getTargetTypeRefForType(input, propertyType, sourceFile);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sourceNameToCsharpMemberName(sourceName),
    memberKind,
    type,
  };
}

function deriveFunctionTargetTypeRefFromSignature(
  signature: Parameters<TargetCompileInput["types"]["getReturnTypeOfSignature"]>[0],
  sourceFile: SourceFile,
  input: TargetCompileInput,
): TargetTypeRef | undefined {
  if (signature === undefined) {
    return undefined;
  }
  const parameters = ((signature as { readonly parameters?: readonly Symbol[] }).parameters ?? [])
    .map((parameter) => getTargetTypeRefForType(input, input.semantics.getTypeOfSymbol(parameter, { sourceFile }), sourceFile));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForType(input, input.types.getReturnTypeOfSignature(signature, { sourceFile }), sourceFile);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return {
      kind: "target-named",
      id: `System.Action\`${parameters.length}`,
      typeArguments: parameters as readonly TargetTypeRef[],
    };
  }
  return {
    kind: "target-named",
    id: `System.Func\`${parameters.length + 1}`,
    typeArguments: [...(parameters as readonly TargetTypeRef[]), returnType],
  };
}

function objectShapeBaseName(type: TargetTypeRef): string {
  if (type.kind !== "target-specific" || typeof type.value !== "object" || type.value === null) {
    return "__TsonicShape";
  }
  const value = type.value as { readonly name?: unknown };
  return typeof value.name === "string" && value.name.length > 0
    ? `__TsonicShape_${sourceNameToCsharpMemberName(value.name)}`
    : "__TsonicShape";
}

function getCsharpObjectShapeFactForDeclarationAnnotation(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  const symbol = input.semantics.getSymbolAtLocation(node, { sourceFile });
  const declarations = (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined ? [] : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
  for (const declaration of declarations) {
    const typeNode = asNode(getNodeField(declaration, "Type") ?? getNodeField(declaration, "type"));
    const fact = input.facts.getFact(typeNode, csharpObjectShapeFactKey) ??
      (typeNode === undefined ? undefined : deriveCsharpObjectShapeFactForNode(typeNode, sourceFile, input));
    if (fact !== undefined) {
      return fact;
    }
  }
  return undefined;
}

function deriveCsharpObjectShapeFactForNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  const typeLiteral = findTypeLiteralNode(node, input);
  if (typeLiteral === undefined) {
    return undefined;
  }
  const members = getNodeList(getNodeField(typeLiteral, "Members"));
  if (members.length === 0) {
    return undefined;
  }
  const shapeMembers = members
    .map((member) => deriveObjectShapeMember(member, sourceFile, input))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (shapeMembers.length !== members.length) {
    return undefined;
  }
  return {
    targetType: {
      kind: "target-specific",
      target: "csharp",
      name: "project-source-type",
      value: `__TsonicShape${stableNodeId(typeLiteral, sourceFile, input)}`,
    },
    members: shapeMembers,
  };
}

function findTypeLiteralNode(node: Node, input: TargetCompileInput): Node | undefined {
  if (input.ast.kindName(node) === "KindTypeLiteral") {
    return node;
  }
  const typeNode = asNode(getNodeField(node, "Type"));
  if (typeNode !== undefined && input.ast.kindName(typeNode) === "KindTypeLiteral") {
    return typeNode;
  }
  return undefined;
}

function deriveObjectShapeMember(
  member: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = getNodeNameText(member, input);
  if (sourceName.length === 0) {
    return undefined;
  }
  const parameters = getNodeList(getNodeField(member, "Parameters"));
  const memberKind = parameters.length === 0 ? "property" : "method";
  const type = memberKind === "method"
    ? deriveFunctionTargetTypeRef(member, sourceFile, input)
    : getTargetTypeRefForNode(input, asNode(getNodeField(member, "Type")), sourceFile);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sourceNameToCsharpMemberName(sourceName),
    memberKind,
    type,
    ...(getNodeField(member, "QuestionToken") !== undefined ? { optional: true } : {}),
  };
}

function deriveFunctionTargetTypeRef(
  member: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): TargetTypeRef | undefined {
  const parameters = getNodeList(getNodeField(member, "Parameters"))
    .map((parameter) => getTargetTypeRefForNode(input, asNode(getNodeField(parameter, "Type")), sourceFile));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForNode(input, asNode(getNodeField(member, "Type")), sourceFile);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return {
      kind: "target-named",
      id: `System.Action\`${parameters.length}`,
      typeArguments: parameters as readonly TargetTypeRef[],
    };
  }
  return {
    kind: "target-named",
    id: `System.Func\`${parameters.length + 1}`,
    typeArguments: [...(parameters as readonly TargetTypeRef[]), returnType],
  };
}

function getNodeList(value: unknown): readonly Node[] {
  const nodes = (value as { readonly Nodes?: readonly unknown[] } | undefined)?.Nodes;
  return nodes === undefined
    ? []
    : nodes.map(asNode).filter((node): node is Node => node !== undefined);
}

function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  const record = node as unknown as Record<string, unknown>;
  const exact = record[field];
  if (exact !== undefined) {
    return exact;
  }
  const alternate = `${field[0]!.toLowerCase()}${field.slice(1)}`;
  return record[alternate];
}

function asNode(value: unknown): Node | undefined {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly Kind?: unknown }).Kind === "number"
    ? value as Node
    : undefined;
}

function getNodeNameText(node: Node, input: TargetCompileInput): string {
  const astName = input.ast.text(input.ast.name(node));
  if (astName.length > 0) {
    return astName;
  }
  const name = asNode(getNodeField(node, "Name") ?? getNodeField(node, "name"));
  const text = (name as { readonly Text?: unknown } | undefined)?.Text;
  return typeof text === "string" ? text : "";
}

function stableNodeId(node: Node, sourceFile: SourceFile, input: TargetCompileInput): string {
  const fileName = input.ast.getFileName(sourceFile);
  const id = (node as { readonly id?: unknown }).id;
  const loc = (node as { readonly Loc?: unknown }).Loc as { readonly pos?: unknown; readonly end?: unknown } | undefined;
  const pos = typeof loc?.pos === "number" || typeof loc?.pos === "string" ? loc.pos : input.ast.pos(node);
  const end = typeof loc?.end === "number" || typeof loc?.end === "string" ? loc.end : input.ast.end(node);
  return [fileName, id, pos, end]
    .filter((part) => part !== undefined && part !== "")
    .map(String)
    .join("_")
    .replace(/[^A-Za-z0-9_]/g, "_");
}

function sourceNameToCsharpMemberName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function isVoidTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && type.id === "System.Void";
}
