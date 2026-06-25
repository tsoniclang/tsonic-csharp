import {
  KindClassDeclaration,
  KindEnumDeclaration,
  KindInterfaceDeclaration,
  Node_Name,
} from "./source-ast.js";
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
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import { planIdentifierName } from "./names.js";
import {
  invalidCsharpType,
} from "./csharp-type-primitives.js";
import {
  isProviderVirtualSourceFile,
} from "./provider-virtual-source-files.js";

export function getCsharpTypeFromProjectSourceReferenceNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  return getCsharpTypeFromProjectSourceReference(
    input.semantics.getProjectSourceReferenceForNode(node, { sourceFile }),
    input,
    diagnostics,
  );
}

export function getCsharpTypeFromProjectSourceTypeReferenceNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: (
    typeNode: Node | undefined,
    typeSourceFile: SourceFile,
    typeInput: TargetCompileInput,
    errorType: CsharpTypeNode,
    typeDiagnostics?: TargetDiagnostic[],
  ) => CsharpTypeNode,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const referenceNode = input.ast.name(node) ?? node;
  const type = getCsharpTypeFromProjectSourceReferenceNode(referenceNode, sourceFile, input, diagnostics);
  if (type === undefined) {
    return undefined;
  }
  const typeArguments = input.ast.typeArguments(node)
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => resolveCsharpType(argument, sourceFile, input, invalidCsharpType("project source type argument"), diagnostics));
  return withCsharpTypeArguments(type, typeArguments);
}

export function getCsharpTypeFromProjectSourceReference(
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (reference === undefined) {
    return undefined;
  }
  if (input.facts.getTargetBindingFact(reference.symbol) !== undefined) {
    return undefined;
  }
  if (
    !input.sourceFiles.some((sourceFile) => sourceFile === reference.sourceFile) ||
    reference.sourceFile.IsDeclarationFile ||
    isProviderVirtualSourceFile(input, reference.sourceFile)
  ) {
    return undefined;
  }
  if (
    input.ast.kindName(reference.declaration) !== KindClassDeclaration &&
    input.ast.kindName(reference.declaration) !== KindInterfaceDeclaration &&
    input.ast.kindName(reference.declaration) !== KindEnumDeclaration
  ) {
    return undefined;
  }
  const nameNode = Node_Name(reference.declaration);
  if (nameNode === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(reference.declaration, "Project source type reference requires a declaration name resolved by TSTS."));
    return invalidCsharpType("project source type reference");
  }
  return {
    kind: "IdentifierName",
    name: planIdentifierName(
      nameNode,
      "InvalidProjectSourceTypeReference",
      input,
      diagnostics ?? [],
      "Project source type reference",
    ),
  };
}

export function withCsharpTypeArguments(
  type: CsharpTypeNode,
  typeArguments: readonly CsharpTypeNode[],
): CsharpTypeNode {
  if (typeArguments.length === 0) {
    return type;
  }
  return type.kind === "IdentifierName" || type.kind === "QualifiedName"
    ? { ...type, typeArguments }
    : type;
}
