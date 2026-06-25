import {
  KindArrayType,
  KindTupleType,
} from "../source-ast.js";
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
  csharpArrayBoundaryFactKey,
} from "../../../source/csharp-facts.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import type {
  CsharpTypeResolver,
} from "./types.js";

export function getCsharpTypeFromArrayBoundaryFact(
  node: Node,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const boundary = input.facts.getFact(node, csharpArrayBoundaryFactKey);
  return boundary === undefined ? undefined : csharpTypeFromTargetTypeRef(boundary.publicType);
}

export function getCsharpTypeFromArrayOrTupleTypeNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) === KindArrayType) {
    const elementTypeNode = (node as { readonly ElementType?: Node }).ElementType;
    const elementType = resolveCsharpType(elementTypeNode, sourceFile, input, invalidCsharpType("array element type"), diagnostics);
    return elementType.kind === "InvalidType"
      ? invalidCsharpType("array type")
      : { kind: "ArrayType", elementType };
  }
  if (input.ast.kindName(node) === KindTupleType) {
    const elements = input.ast.elements(node)
      .map((element) => resolveCsharpType(getTupleElementTypeNode(element), sourceFile, input, invalidCsharpType("tuple element type"), diagnostics));
    return elements.some((element) => element.kind === "InvalidType")
      ? invalidCsharpType("tuple type")
      : { kind: "TupleType", elements };
  }
  return undefined;
}

function getTupleElementTypeNode(element: Node | undefined): Node | undefined {
  return getNodeField(element, "Type") ?? getNodeField(element, "type") ?? element;
}

function getNodeField(node: Node | undefined, field: string): Node | undefined {
  if (node === undefined) {
    return undefined;
  }
  const value = Object.getOwnPropertyDescriptor(node, field)?.value;
  return typeof value === "object" && value !== null ? value as Node : undefined;
}
