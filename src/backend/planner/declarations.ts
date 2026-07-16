import {
  AsClassDeclaration,
  AsExpressionWithTypeArguments,
  AsFunctionDeclaration,
  AsInterfaceDeclaration,
  AsPropertySignatureDeclaration,
  KindInterfaceDeclaration,
  KindPropertySignature,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpClassDeclaration,
  CsharpMethodDeclaration,
} from "../roslyn/syntax.js";
import { planAttributesForSubject } from "./attributes.js";
import {
  createDestructuringPlannerState,
} from "./bindings.js";
import { planClassHeritage } from "./heritage.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers, isAsyncNode } from "./modifiers.js";
import { planIdentifierName } from "./names.js";
import { planParametersWithPrelude } from "./parameters.js";
import { planBlockStatements } from "./statements.js";
import { planTypeParameters } from "./type-parameters.js";
import { getAsyncReturnExpressionExpectedType, getExplicitReturnType } from "./declaration-return-types.js";
import {
  planClassMembers,
} from "./declaration-class-members.js";
import {
  csharpJsonValueInterfaceType,
  objectShapeRequiresJsonSerialization,
  renderJsonSerializableObjectShapeMethod,
} from "./json-object-shapes.js";
import {
  getCsharpObjectShapeFactForNode,
} from "./csharp-fact-queries.js";

export { planEnumDeclaration } from "./declaration-enums.js";
export { planInterfaceDeclaration } from "./declaration-interfaces.js";

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const declaration = AsClassDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "class declaration", diagnostics);
  const className = planIdentifierName(declaration.name, "AnonymousClass", input, diagnostics, "Class name");
  const heritage = planClassHeritage(node, sourceFile, input, diagnostics);
  const autoPropertyNames = getImplementedInterfacePropertyNames(node, sourceFile, input);
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const members = planClassMembers(declaration.Members?.Nodes ?? [], className, autoPropertyNames, sourceFile, input, diagnostics);
  return {
    kind: "ClassDeclaration",
    name: className,
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    ...(heritage.baseType === undefined ? {} : { baseType: heritage.baseType }),
    ...(heritage.interfaces.length === 0 && !jsonSerializable
      ? {}
      : { interfaces: jsonSerializable ? [...heritage.interfaces, csharpJsonValueInterfaceType()] : heritage.interfaces }),
    members: jsonSerializable && objectShape !== undefined
      ? [...members, renderJsonSerializableObjectShapeMethod(objectShape)]
      : members,
  };
}

function getImplementedInterfacePropertyNames(
  classDeclaration: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const heritageType of input.ast.implementsHeritageElements(classDeclaration)) {
    if (heritageType !== undefined) {
      collectImplementedInterfacePropertyNames(heritageType, sourceFile, input, names, new Set<Node>());
    }
  }
  return names;
}

function collectImplementedInterfacePropertyNames(
  heritageType: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  names: Set<string>,
  seen: Set<Node>,
): void {
  const referenceNode = AsExpressionWithTypeArguments(heritageType)?.Expression ?? heritageType;
  const reference = input.analysis.getProjectSourceReferenceForNode(referenceNode, { sourceFile });
  const declaration = reference?.declaration ??
    input.analysis.getProjectSourceDeclarationForNode(referenceNode, { sourceFile });
  if (declaration === undefined || seen.has(declaration) || SourceKind(input.ast, declaration) !== KindInterfaceDeclaration) {
    return;
  }
  seen.add(declaration);
  const interfaceDeclaration = AsInterfaceDeclaration(declaration);
  if (interfaceDeclaration === undefined) {
    return;
  }
  for (const member of interfaceDeclaration.Members?.Nodes ?? []) {
    if (SourceKind(input.ast, member) !== KindPropertySignature) {
      continue;
    }
    const property = AsPropertySignatureDeclaration(member);
    const name = property?.name === undefined ? undefined : planIdentifierName(property.name, "PropertyDeclaration", input, [], "Interface property name");
    if (name !== undefined) {
      names.add(name);
    }
  }
  const declarationSourceFile = reference?.sourceFile ?? input.ast.getSourceFile(declaration) ?? sourceFile;
  for (const baseType of input.ast.extendsHeritageElements(declaration)) {
    if (baseType !== undefined) {
      collectImplementedInterfacePropertyNames(baseType, declarationSourceFile, input, names, seen);
    }
  }
}

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsFunctionDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "function declaration", diagnostics);
  const name = planIdentifierName(declaration.name, "__anonymous", input, diagnostics, "Function name");
  const state = createDestructuringPlannerState(node, input.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const returnType = getExplicitReturnType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
  state.currentReturnType = returnType;
  state.currentReturnTypeSubject = declaration.Type;
  if (isAsyncNode(input.ast, node)) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
    state.currentReturnExpressionType = returnExpressionType?.type;
    state.currentReturnExpressionTypeSubject = returnExpressionType?.subject;
    state.currentReturnExpressionTargetType = returnExpressionType?.targetType;
  }
  return {
    kind: "MethodDeclaration",
    name,
    modifiers: isAsyncNode(input.ast, node) ? ["public", "static", "async"] : ["public", "static"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    returnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...parameters.prelude,
        ...planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
      ],
    },
  };
}
