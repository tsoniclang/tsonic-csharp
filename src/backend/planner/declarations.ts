import {
  AsClassDeclaration,
  AsExpressionWithTypeArguments,
  AsFunctionDeclaration,
  AsHeritageClause,
  AsInterfaceDeclaration,
  AsPropertySignatureDeclaration,
  KindImplementsKeyword,
  KindInterfaceDeclaration,
  KindPropertySignature,
  SourceKind,
  SourceTokenKind,
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

export { planEnumDeclaration } from "./declaration-enums.js";
export { planInterfaceDeclaration } from "./declaration-interfaces.js";

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const declaration = AsClassDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "class declaration", diagnostics);
  const className = planIdentifierName(declaration.name, "AnonymousClass", input, diagnostics, "Class name");
  const heritage = planClassHeritage(declaration.HeritageClauses?.Nodes ?? [], sourceFile, input, diagnostics);
  const autoPropertyNames = getImplementedInterfacePropertyNames(declaration.HeritageClauses?.Nodes ?? [], sourceFile, input);
  return {
    kind: "ClassDeclaration",
    name: className,
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    ...(heritage.baseType === undefined ? {} : { baseType: heritage.baseType }),
    ...(heritage.interfaces.length === 0 ? {} : { interfaces: heritage.interfaces }),
    members: planClassMembers(declaration.Members?.Nodes ?? [], className, autoPropertyNames, sourceFile, input, diagnostics),
  };
}

function getImplementedInterfacePropertyNames(
  heritageClauses: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const clause of heritageClauses) {
    const heritageClause = AsHeritageClause(clause);
    if (heritageClause === undefined || SourceTokenKind(input.ast, heritageClause.Token) !== KindImplementsKeyword) {
      continue;
    }
    const types = heritageClause.Types?.Nodes ?? [];
    for (const heritageType of types) {
      const referenceNode = AsExpressionWithTypeArguments(heritageType)?.Expression ?? heritageType;
      const declaration = input.analysis.getProjectSourceReferenceForNode(referenceNode, { sourceFile })?.declaration ??
        input.analysis.getProjectSourceDeclarationForNode(referenceNode, { sourceFile });
      if (SourceKind(input.ast, declaration) !== KindInterfaceDeclaration) {
        continue;
      }
      const interfaceDeclaration = AsInterfaceDeclaration(declaration);
      if (interfaceDeclaration === undefined) {
        continue;
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
    }
  }
  return names;
}

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsFunctionDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "function declaration", diagnostics);
  const name = planIdentifierName(declaration.name, "__anonymous", input, diagnostics, "Function name");
  const state = createDestructuringPlannerState(node, input.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const returnType = getExplicitReturnType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
  state.currentReturnType = returnType;
  state.currentReturnTypeSubject = declaration.Type;
  if (isAsyncNode(node)) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
    state.currentReturnExpressionType = returnExpressionType?.type;
    state.currentReturnExpressionTypeSubject = returnExpressionType?.subject;
  }
  return {
    kind: "MethodDeclaration",
    name,
    modifiers: isAsyncNode(node) ? ["public", "static", "async"] : ["public", "static"],
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
