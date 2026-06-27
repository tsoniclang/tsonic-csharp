import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  KindTypeAliasDeclaration,
  KindTypeReference,
} from "../source-ast.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  substituteCsharpTypeNode,
} from "./source-generic-types.js";
import type {
  CsharpTypeResolver,
} from "./types.js";

export function getCsharpTypeFromTypeAliasReferenceNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) !== KindTypeReference) {
    return undefined;
  }
  const typeName = getNodeField(node, "TypeName");
  const declarations = [
    input.analysis.getSymbolAtLocation(typeName, { sourceFile }),
    input.analysis.getResolvedSymbol(typeName, { sourceFile }),
  ].flatMap((symbol) => symbol?.Declarations ?? [])
    .filter((declaration): declaration is Node => declaration !== undefined);
  for (const declaration of declarations) {
    if (input.ast.kindName(declaration) !== KindTypeAliasDeclaration) {
      continue;
    }
    const aliasedType = getNodeField(declaration, "Type");
    if (aliasedType === undefined || aliasedType === node) {
      continue;
    }
    if (!input.ast.is.IsFunctionTypeNode(aliasedType)) {
      continue;
    }
    const aliasSourceFile = input.ast.getSourceFile(declaration) ?? sourceFile;
    const type = resolveCsharpType(aliasedType, aliasSourceFile, input, invalidCsharpType("type alias target"), diagnostics);
    const substitutions = getTypeAliasSubstitutions(declaration, node, sourceFile, input, resolveCsharpType, diagnostics);
    return substituteCsharpTypeNode(type, substitutions);
  }
  return undefined;
}

function getTypeAliasSubstitutions(
  aliasDeclaration: Node,
  referenceNode: Node,
  referenceSourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): ReadonlyMap<string, CsharpTypeNode> {
  const substitutions = new Map<string, CsharpTypeNode>();
  const typeParameters = getNodeList(getNodeField(aliasDeclaration, "TypeParameters"));
  const typeArguments = input.ast.typeArguments(referenceNode);
  for (let index = 0; index < typeParameters.length; index += 1) {
    const typeParameter = typeParameters[index];
    const argument = typeArguments[index];
    if (typeParameter === undefined || argument === undefined) {
      continue;
    }
    const name = input.ast.text(input.ast.name(typeParameter));
    if (name.length === 0) {
      continue;
    }
    substitutions.set(name, resolveCsharpType(argument, referenceSourceFile, input, invalidCsharpType("type alias argument"), diagnostics));
  }
  return substitutions;
}

function getNodeList(value: unknown): readonly Node[] {
  if (value === undefined || value === null || typeof value !== "object") {
    return [];
  }
  const nodes = (value as { readonly Nodes?: readonly (Node | undefined)[] }).Nodes;
  return nodes === undefined ? [] : nodes.filter((node): node is Node => node !== undefined);
}

function getNodeField(node: Node | undefined, field: string): Node | undefined {
  if (node === undefined) {
    return undefined;
  }
  const value = Object.getOwnPropertyDescriptor(node, field)?.value;
  return typeof value === "object" && value !== null ? value as Node : undefined;
}
