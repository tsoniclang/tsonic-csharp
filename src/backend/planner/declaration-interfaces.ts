import {
  AsIndexSignatureDeclaration,
  AsInterfaceDeclaration,
  AsMethodSignatureDeclaration,
  AsParameterDeclaration,
  AsPropertySignatureDeclaration,
  KindIndexSignature,
  KindMethodSignature,
  KindPropertySignature,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpInterfaceDeclaration,
  CsharpInterfaceIndexerDeclaration,
  CsharpInterfaceMember,
  CsharpInterfaceMethodDeclaration,
  CsharpInterfacePropertyDeclaration,
} from "../roslyn/syntax.js";
import { planAttributesForSubject } from "./attributes.js";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { getExplicitReturnType } from "./declaration-return-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planInterfaceHeritage } from "./heritage.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";
import { planIdentifierName } from "./names.js";
import { planParameters } from "./parameters.js";
import { planTypeParameters } from "./type-parameters.js";

export function planInterfaceDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceDeclaration {
  const declaration = AsInterfaceDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "interface declaration", diagnostics);
  const interfaces = planInterfaceHeritage(declaration.HeritageClauses?.Nodes ?? [], sourceFile, input, diagnostics);
  return {
    kind: "InterfaceDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousInterface", input, diagnostics, "Interface name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    ...(interfaces.length === 0 ? {} : { interfaces }),
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpInterfaceMember[] => {
      if (member === undefined) {
        return [];
      }
      switch (input.ast.kindName(member)) {
        case KindMethodSignature:
          return [planInterfaceMethodDeclaration(member, sourceFile, input, diagnostics)];
        case KindPropertySignature:
          return [planInterfacePropertyDeclaration(member, sourceFile, input, diagnostics)];
        case KindIndexSignature:
          return [planInterfaceIndexerDeclaration(member, sourceFile, input, diagnostics)];
        default:
          diagnostics.push(unsupportedNodeDiagnostic(member, "Interface member is outside the current C# planning surface."));
          return [];
      }
    }),
  };
}

function planInterfaceMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceMethodDeclaration {
  const declaration = AsMethodSignatureDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "interface method declaration", diagnostics);
  return {
    kind: "MethodDeclaration",
    name: planIdentifierName(declaration.name, "MethodDeclaration", input, diagnostics, "Interface method name"),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    returnType: getExplicitReturnType(declaration.Type, node, "interface method declaration", sourceFile, input, diagnostics),
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
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "interface property declaration", diagnostics);
  if (declaration.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Interface property initializers have no direct C# interface equivalent."));
  }
  return {
    kind: "PropertyDeclaration",
    name: planIdentifierName(declaration.name, "PropertyDeclaration", input, diagnostics, "Interface property name"),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    type: getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, invalidCsharpType("interface property type"), diagnostics),
  };
}

function planInterfaceIndexerDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceIndexerDeclaration {
  const declaration = AsIndexSignatureDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "interface index signature", diagnostics);
  const parameterNodes = declaration.Parameters?.Nodes ?? [];
  const parameterNode = parameterNodes.find((item): item is Node => item !== undefined);
  if (parameterNode === undefined || parameterNodes.filter((item) => item !== undefined).length !== 1) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Interface index signature requires exactly one key parameter."));
  }
  const parameterDeclaration = parameterNode === undefined ? undefined : AsParameterDeclaration(parameterNode);
  return {
    kind: "IndexerDeclaration",
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    keyName: planIdentifierName(parameterDeclaration?.name, "key", input, diagnostics, "Interface indexer key name"),
    keyType: getCsharpTypeForNode(parameterDeclaration?.Type ?? parameterDeclaration?.name, sourceFile, input, undefined, diagnostics),
    valueType: getCsharpTypeForNode(declaration.Type, sourceFile, input, undefined, diagnostics),
  };
}
