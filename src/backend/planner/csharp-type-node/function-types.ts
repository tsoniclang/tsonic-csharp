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
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  invalidCsharpType,
  predefined,
} from "../csharp-type-primitives.js";
import type {
  CsharpTypeResolver,
} from "./types.js";

export function getCsharpTypeFromFunctionTypeNode(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (!input.ast.is.IsFunctionTypeNode(node)) {
    return undefined;
  }
  const parameters = getNodeList(getNodeField(node, "Parameters"));
  const parameterTypes = parameters.map((parameter) => {
    const parameterTypeNode = getNodeField(parameter, "Type");
    if (parameterTypeNode === undefined) {
      diagnostics?.push(unsupportedNodeDiagnostic(parameter, "Function type parameters require explicit TSTS-resolved parameter type nodes before C# delegate emission."));
      return invalidCsharpType("function type parameter");
    }
    return resolveCsharpType(parameterTypeNode, sourceFile, input, invalidCsharpType("function type parameter"), diagnostics);
  });
  if (parameterTypes.some((parameterType) => parameterType.kind === "InvalidType")) {
    return invalidCsharpType("function type");
  }
  const returnTypeNode = getNodeField(node, "Type");
  const returnType = returnTypeNode === undefined
    ? predefined("void")
    : resolveCsharpType(returnTypeNode, sourceFile, input, invalidCsharpType("function type return"), diagnostics);
  if (returnType.kind === "InvalidType") {
    return invalidCsharpType("function type");
  }
  if (returnType.kind === "PredefinedType" && returnType.name === "void") {
    return delegateType("Action", parameterTypes);
  }
  return delegateType("Func", [...parameterTypes, returnType]);
}

function delegateType(
  name: "Action" | "Func",
  typeArguments: readonly CsharpTypeNode[],
): CsharpTypeNode {
  return {
    kind: "IdentifierName",
    name,
    ...(typeArguments.length === 0 ? {} : { typeArguments }),
  };
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
