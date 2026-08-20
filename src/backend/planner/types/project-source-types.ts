import type { CsharpPlanningContext } from "../context.js";
import {
  KindClassDeclaration,
  KindEnumDeclaration,
  KindInterfaceDeclaration,
  Node_Name,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import {
  invalidCsharpType,
} from "./csharp-type-primitives.js";
import {
  isProviderVirtualSourceFile,
} from "../program/provider-virtual-source-files.js";
import {
  csharpSourceTypeArgumentNodes,
} from "../../../policy/types/index.js";

export function getCsharpTypeFromProjectSourceReferenceNode(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  return getCsharpTypeFromProjectSourceReference(
    input.program.source.navigation.referenceFor(node),
    input,
    diagnostics,
  );
}

export function getCsharpTypeFromProjectSourceTypeReferenceNode(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  resolveCsharpType: (
    typeNode: Node | undefined,
    typeSourceFile: SourceFile,
    typeInput: CsharpPlanningContext,
    errorType: CsharpTypeNode,
    typeDiagnostics?: TargetDiagnostic[],
  ) => CsharpTypeNode,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const referenceNode = input.program.source.ast.name(node) ?? node;
  const type = getCsharpTypeFromProjectSourceReferenceNode(referenceNode, sourceFile, input, diagnostics);
  if (type === undefined) {
    return undefined;
  }
  const typeArguments = csharpSourceTypeArgumentNodes(input.program.source.ast, node)
    .map((argument) => resolveCsharpType(argument, sourceFile, input, invalidCsharpType("project source type argument"), diagnostics));
  return withCsharpTypeArguments(type, typeArguments);
}

export function getCsharpTypeFromProjectSourceReference(
  reference: ReturnType<CsharpPlanningContext["program"]["source"]["navigation"]["referenceFor"]>,
  input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (reference === undefined) {
    return undefined;
  }
  if (
    !input.program.source.navigation.isProjectDeclaration(reference.declaration) ||
    reference.sourceFile.IsDeclarationFile ||
    isProviderVirtualSourceFile(input, reference.sourceFile)
  ) {
    return undefined;
  }
  if (
    input.program.source.ast.kindName(reference.declaration) !== KindClassDeclaration &&
    input.program.source.ast.kindName(reference.declaration) !== KindInterfaceDeclaration &&
    input.program.source.ast.kindName(reference.declaration) !== KindEnumDeclaration
  ) {
    return undefined;
  }
  const nameNode = Node_Name(input.program.source.ast, reference.declaration);
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
