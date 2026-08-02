import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsClassDeclaration,
  AsFunctionDeclaration,
  AsInterfaceDeclaration,
  AsPropertySignatureDeclaration,
  KindInterfaceDeclaration,
  KindPropertySignature,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
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
import {
  registerSourceObjectShape,
} from "./object-shapes.js";
import {
  planImplicitForwardingConstructors,
} from "./project-type-constructors.js";

export { planEnumDeclaration } from "./declaration-enums.js";
export { planInterfaceDeclaration } from "./declaration-interfaces.js";

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const declaration = AsClassDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "class declaration", diagnostics);
  const className = planIdentifierName(declaration.name, "AnonymousClass", input, diagnostics, "Class name");
  const heritage = planClassHeritage(node, input, diagnostics);
  const autoPropertyNames = getImplementedInterfacePropertyNames(node, input);
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  if (objectShape !== undefined) {
    registerSourceObjectShape(input, objectShape, diagnostics, node);
  }
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const members = planClassMembers(declaration.Members?.Nodes ?? [], className, autoPropertyNames, sourceFile, input, diagnostics);
  const implicitConstructors = planImplicitForwardingConstructors(
    node,
    className,
    input,
    diagnostics,
  );
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
      ? [
          ...implicitConstructors,
          ...members,
          renderJsonSerializableObjectShapeMethod(objectShape),
        ]
      : [...implicitConstructors, ...members],
  };
}

function getImplementedInterfacePropertyNames(
  classDeclaration: Node,
  input: CsharpTranslationContext,
): ReadonlySet<string> {
  const names = new Set<string>();
  const heritage = input.navigation.declaredHeritage(classDeclaration);
  if (heritage.kind !== "resolved") {
    return names;
  }
  for (const edge of heritage.edges) {
    if (edge.kind === "implements") {
      collectImplementedInterfacePropertyNames(
        edge.target.declaration,
        input,
        names,
        new Set<Node>(),
      );
    }
  }
  return names;
}

function collectImplementedInterfacePropertyNames(
  declaration: Node,
  input: CsharpTranslationContext,
  names: Set<string>,
  seen: Set<Node>,
): void {
  if (seen.has(declaration) || SourceKind(input.ast, declaration) !== KindInterfaceDeclaration) {
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
  const heritage = input.navigation.declaredHeritage(declaration);
  if (heritage.kind !== "resolved") {
    return;
  }
  for (const edge of heritage.edges) {
    if (edge.kind === "extends") {
      collectImplementedInterfacePropertyNames(
        edge.target.declaration,
        input,
        names,
        seen,
      );
    }
  }
}

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
