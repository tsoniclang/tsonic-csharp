import {
  AsBlock,
  AsCallExpression,
  AsClassDeclaration,
  AsConstructorDeclaration,
  AsExpressionStatement,
  AsFunctionDeclaration,
  AsGetAccessorDeclaration,
  AsInterfaceDeclaration,
  AsMethodDeclaration,
  AsMethodSignatureDeclaration,
  AsParameterDeclaration,
  AsPropertyDeclaration,
  AsPropertySignatureDeclaration,
  AsSetAccessorDeclaration,
  KindCallExpression,
  KindConstructor,
  KindExpressionStatement,
  KindGetAccessor,
  KindIndexSignature,
  KindMethodDeclaration,
  KindMethodSignature,
  KindPropertyDeclaration,
  KindPropertySignature,
  KindSetAccessor,
  KindSuperKeyword,
  HasSyntacticModifier,
  ModifierFlagsStatic,
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
  CsharpParameter,
  CsharpPropertyDeclaration,
  CsharpStatement,
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
    members: planClassMembers(declaration.Members?.Nodes ?? [], className, sourceFile, input, diagnostics),
  };
}

function planClassMembers(
  members: readonly (Node | undefined)[],
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const planned: CsharpTypeMember[] = [];
  const accessorProperties = new Map<string, CsharpPropertyDeclaration>();
  for (const member of members) {
    if (member === undefined) {
      continue;
    }
    switch (member.Kind) {
      case KindConstructor:
        planned.push(planConstructorDeclaration(member, className, sourceFile, input, diagnostics));
        break;
      case KindMethodDeclaration:
        planned.push(planMethodDeclaration(member, sourceFile, input, diagnostics));
        break;
      case KindPropertyDeclaration:
        planned.push(planPropertyDeclaration(member, sourceFile, input, diagnostics));
        break;
      case KindGetAccessor:
      case KindSetAccessor:
        mergeAccessorProperty(member, planned, accessorProperties, sourceFile, input, diagnostics);
        break;
      default:
        diagnostics.push(unsupportedNodeDiagnostic(member, "Class member is outside the current C# planning surface."));
        break;
    }
  }
  return planned;
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
    modifiers: planClassMemberModifiers(node),
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
    modifiers: planClassMemberModifiers(node),
    type,
    ...(declaration.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(declaration.Initializer, sourceFile, input, diagnostics, type) }
      : {}),
  };
}

function mergeAccessorProperty(
  node: Node,
  planned: CsharpTypeMember[],
  accessorProperties: Map<string, CsharpPropertyDeclaration>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): void {
  const accessor = node.Kind === KindGetAccessor
    ? AsGetAccessorDeclaration(node)!
    : AsSetAccessorDeclaration(node)!;
  const name = planIdentifierName(accessor.name, "property", diagnostics, "Accessor name");
  const existing = accessorProperties.get(name);
  const next = node.Kind === KindGetAccessor
    ? mergeGetterAccessor(existing, node, name, sourceFile, input, diagnostics)
    : mergeSetterAccessor(existing, node, name, sourceFile, input, diagnostics);
  accessorProperties.set(name, next);
  if (existing === undefined) {
    planned.push(next);
    return;
  }
  const index = planned.indexOf(existing);
  if (index >= 0) {
    planned[index] = next;
  }
}

function mergeGetterAccessor(
  existing: CsharpPropertyDeclaration | undefined,
  node: Node,
  name: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpPropertyDeclaration {
  const declaration = AsGetAccessorDeclaration(node)!;
  const type = getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, existing?.type ?? predefined("object"), diagnostics);
  return {
    kind: "property",
    name,
    modifiers: existing?.modifiers ?? planClassMemberModifiers(node),
    type,
    getter: {
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
    ...(existing?.setter === undefined ? {} : { setter: existing.setter }),
  };
}

function mergeSetterAccessor(
  existing: CsharpPropertyDeclaration | undefined,
  node: Node,
  name: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpPropertyDeclaration {
  const declaration = AsSetAccessorDeclaration(node)!;
  const parameters = planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics);
  const parameter = parameters[0];
  if (parameter === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Set accessor requires exactly one parameter."));
  }
  if (parameters.length > 1) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Set accessor has more than one parameter."));
  }
  const parameterNode = declaration.Parameters?.Nodes?.[0];
  const type = getCsharpTypeForNode(
    parameterNode === undefined ? declaration.Type ?? declaration.name : AsParameterDeclaration(parameterNode)!.Type,
    sourceFile,
    input,
    existing?.type ?? predefined("object"),
    diagnostics,
  );
  return {
    kind: "property",
    name,
    modifiers: existing?.modifiers ?? planClassMemberModifiers(node),
    type,
    ...(existing?.getter === undefined ? {} : { getter: existing.getter }),
    setter: {
      statements: planSetAccessorStatements(declaration.Body, parameter, sourceFile, input, diagnostics),
    },
  };
}

function planSetAccessorStatements(
  body: Node | undefined,
  parameter: Pick<CsharpParameter, "name" | "type"> | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] {
  const statements = planBlockStatements(body, sourceFile, input, diagnostics);
  if (parameter === undefined || parameter.name === "value") {
    return statements;
  }
  return [
    {
      kind: "local",
      name: parameter.name,
      type: parameter.type,
      initializer: { kind: "identifier", name: "value" },
    },
    ...statements,
  ];
}

function planClassMemberModifiers(node: Node): readonly ("public" | "static")[] {
  return HasSyntacticModifier(node, ModifierFlagsStatic)
    ? ["public", "static"]
    : ["public"];
}
