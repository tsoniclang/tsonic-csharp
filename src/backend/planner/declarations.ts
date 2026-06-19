import {
  AsBlock,
  AsCallExpression,
  AsClassDeclaration,
  AsConstructorDeclaration,
  AsExpressionStatement,
  AsFunctionDeclaration,
  AsInterfaceDeclaration,
  AsMethodDeclaration,
  AsMethodSignatureDeclaration,
  AsPropertyDeclaration,
  AsPropertySignatureDeclaration,
  KindCallExpression,
  KindConstructor,
  KindExpressionStatement,
  KindIndexSignature,
  KindMethodDeclaration,
  KindMethodSignature,
  KindPropertyDeclaration,
  KindPropertySignature,
  KindSuperKeyword,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpClassDeclaration,
  CsharpConstructorDeclaration,
  CsharpFieldDeclaration,
  CsharpInterfaceDeclaration,
  CsharpInterfaceMember,
  CsharpInterfaceMethodDeclaration,
  CsharpInterfacePropertyDeclaration,
  CsharpMethodDeclaration,
  CsharpTypeMember,
} from "../ast/csharp-ast.js";
import { getCsharpTypeForNode, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planCallArgument, planExpressionWithExpectedType } from "./expressions.js";
import { planClassHeritage, planInterfaceHeritage } from "./heritage.js";
import { planIdentifierName } from "./names.js";
import { planParameters } from "./parameters.js";
import { planBlockStatements, planStatements } from "./statements.js";
import { planTypeParameters } from "./type-parameters.js";

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const declaration = AsClassDeclaration(node)!;
  const className = planIdentifierName(declaration.name, "AnonymousClass", diagnostics, "Class name");
  const heritage = planClassHeritage(declaration.HeritageClauses?.Nodes ?? [], sourceFile, input, diagnostics);
  return {
    kind: "class",
    name: className,
    modifiers: ["public"],
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], diagnostics),
    ...(heritage.baseType === undefined ? {} : { baseType: heritage.baseType }),
    ...(heritage.interfaces.length === 0 ? {} : { interfaces: heritage.interfaces }),
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpTypeMember[] => {
      if (member === undefined) {
        return [];
      }
      switch (member.Kind) {
        case KindConstructor:
          return [planConstructorDeclaration(member, className, sourceFile, input, diagnostics)];
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

export function planInterfaceDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceDeclaration {
  const declaration = AsInterfaceDeclaration(node)!;
  const interfaces = planInterfaceHeritage(declaration.HeritageClauses?.Nodes ?? [], sourceFile, input, diagnostics);
  return {
    kind: "interface",
    name: planIdentifierName(declaration.name, "AnonymousInterface", diagnostics, "Interface name"),
    modifiers: ["public"],
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], diagnostics),
    ...(interfaces.length === 0 ? {} : { interfaces }),
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpInterfaceMember[] => {
      if (member === undefined) {
        return [];
      }
      switch (member.Kind) {
        case KindMethodSignature:
          return [planInterfaceMethodDeclaration(member, sourceFile, input, diagnostics)];
        case KindPropertySignature:
          return [planInterfacePropertyDeclaration(member, sourceFile, input, diagnostics)];
        case KindIndexSignature:
          diagnostics.push(unsupportedNodeDiagnostic(member, "Index signatures require finalized target indexer facts before C# interface emission."));
          return [];
        default:
          diagnostics.push(unsupportedNodeDiagnostic(member, "Interface member is outside the current C# planning surface."));
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
  const name = planIdentifierName(declaration.name, "__anonymous", diagnostics, "Function name");
  return {
    kind: "method",
    name,
    modifiers: ["public", "static"],
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], diagnostics),
    returnType: getCsharpTypeForNode(declaration.Type, sourceFile, input, predefined("void"), diagnostics),
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
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
  const bodyStatements = AsBlock(declaration.Body)?.Statements?.Nodes ?? [];
  const leadingSuperCall = getLeadingSuperCall(bodyStatements);
  return {
    kind: "constructor",
    name: className,
    modifiers: ["public"],
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    ...(leadingSuperCall === undefined
      ? {}
      : {
          baseArguments: (leadingSuperCall.Arguments?.Nodes ?? [])
            .filter((argument): argument is Node => argument !== undefined)
            .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics)),
        }),
    body: {
      statements: leadingSuperCall === undefined
        ? planBlockStatements(declaration.Body, sourceFile, input, diagnostics)
        : bodyStatements
            .slice(1)
            .filter((statement): statement is Node => statement !== undefined)
            .flatMap((statement) => planStatements(statement, sourceFile, input, diagnostics)),
    },
  };
}

function getLeadingSuperCall(statements: readonly (Node | undefined)[]): NonNullable<ReturnType<typeof AsCallExpression>> | undefined {
  const first = statements[0];
  if (first?.Kind !== KindExpressionStatement) {
    return undefined;
  }
  const expression = AsExpressionStatement(first)!.Expression;
  if (expression?.Kind !== KindCallExpression) {
    return undefined;
  }
  const call = AsCallExpression(expression)!;
  return call.Expression?.Kind === KindSuperKeyword ? call : undefined;
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
    name: planIdentifierName(declaration.name, "method", diagnostics, "Method name"),
    modifiers: ["public"],
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], diagnostics),
    returnType: getCsharpTypeForNode(declaration.Type, sourceFile, input, predefined("void"), diagnostics),
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
    body: {
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

function planInterfaceMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceMethodDeclaration {
  const declaration = AsMethodSignatureDeclaration(node)!;
  return {
    kind: "interface-method",
    name: planIdentifierName(declaration.name, "method", diagnostics, "Interface method name"),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], diagnostics),
    returnType: getCsharpTypeForNode(declaration.Type, sourceFile, input, predefined("void"), diagnostics),
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
  };
}

function planInterfacePropertyDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfacePropertyDeclaration {
  const declaration = AsPropertySignatureDeclaration(node)!;
  if (declaration.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Interface property initializers have no direct C# interface equivalent."));
  }
  return {
    kind: "interface-property",
    name: planIdentifierName(declaration.name, "property", diagnostics, "Interface property name"),
    type: getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, predefined("object"), diagnostics),
  };
}

function planPropertyDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpFieldDeclaration {
  const declaration = AsPropertyDeclaration(node)!;
  const type = getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, predefined("object"), diagnostics);
  return {
    kind: "field",
    name: planIdentifierName(declaration.name, "field", diagnostics, "Property name"),
    modifiers: ["public"],
    type,
    ...(declaration.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(declaration.Initializer, sourceFile, input, diagnostics, type) }
      : {}),
  };
}
