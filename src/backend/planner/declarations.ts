import {
  AsClassDeclaration,
  AsConstructorDeclaration,
  AsFunctionDeclaration,
  AsMethodDeclaration,
  AsPropertyDeclaration,
  KindConstructor,
  KindMethodDeclaration,
  KindPropertyDeclaration,
  Node_Text,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpClassDeclaration,
  CsharpConstructorDeclaration,
  CsharpFieldDeclaration,
  CsharpMethodDeclaration,
  CsharpTypeMember,
} from "../ast/csharp-ast.js";
import { getCsharpTypeForNode, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planExpressionWithExpectedType } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { planParameters } from "./parameters.js";
import { planBlockStatements } from "./statements.js";

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const declaration = AsClassDeclaration(node)!;
  return {
    kind: "class",
    name: sanitizeIdentifier(declaration.name === undefined ? "AnonymousClass" : Node_Text(declaration.name)),
    modifiers: ["public"],
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpTypeMember[] => {
      if (member === undefined) {
        return [];
      }
      switch (member.Kind) {
        case KindConstructor:
          return [planConstructorDeclaration(member, declaration.name === undefined ? "AnonymousClass" : Node_Text(declaration.name), sourceFile, input, diagnostics)];
        case KindMethodDeclaration:
          return [planMethodDeclaration(member, sourceFile, input, diagnostics)];
        case KindPropertyDeclaration:
          return [planPropertyDeclaration(member, sourceFile, input, diagnostics)];
        default:
          diagnostics.push(unsupportedNodeDiagnostic(member, "Class member is outside the current C# planning surface."));
          return [];
      }
    }),
  };
}

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsFunctionDeclaration(node)!;
  const name = declaration.name === undefined ? "__anonymous" : sanitizeIdentifier(Node_Text(declaration.name));
  return {
    kind: "method",
    name,
    modifiers: ["public", "static"],
    returnType: getCsharpTypeForNode(declaration.Type, sourceFile, input, predefined("void")),
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input),
    body: {
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

function planConstructorDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsConstructorDeclaration(node)!;
  return {
    kind: "constructor",
    name: sanitizeIdentifier(className),
    modifiers: ["public"],
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input),
    body: {
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

function planMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsMethodDeclaration(node)!;
  return {
    kind: "method",
    name: sanitizeIdentifier(declaration.name === undefined ? "method" : Node_Text(declaration.name)),
    modifiers: ["public"],
    returnType: getCsharpTypeForNode(declaration.Type, sourceFile, input, predefined("void")),
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input),
    body: {
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

function planPropertyDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpFieldDeclaration {
  const declaration = AsPropertyDeclaration(node)!;
  const type = getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input);
  return {
    kind: "field",
    name: sanitizeIdentifier(declaration.name === undefined ? "field" : Node_Text(declaration.name)),
    modifiers: ["public"],
    type,
    ...(declaration.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(declaration.Initializer, sourceFile, input, diagnostics, type) }
      : {}),
  };
}
