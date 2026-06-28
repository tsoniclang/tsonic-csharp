import type {
  ExtensionObservationContext,
  Node,
  Type,
} from "@tsonic/tsts";
import {
  getNodeField,
  getNodeList,
} from "../ast-utils.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";

export function isClassObjectInitializerConstructible(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const ast = compiler?.ast;
  if (compiler === undefined || ast === undefined) {
    return false;
  }
  const classDeclarations = getSymbolDeclarations(compiler.checker.getTypeSymbol(type), compiler.checker)
    .filter((declaration) => ast.kindName(declaration) === "KindClassDeclaration");
  if (classDeclarations.length === 0) {
    return false;
  }
  return classDeclarations.some((declaration) => {
    const constructors = getNodeList(getNodeField(declaration, "Members"))
      .filter((member) => ast.kindName(member) === "KindConstructor");
    return constructors.length === 0 ||
      constructors.some(constructorAllowsParameterlessCall);
  });
}

function constructorAllowsParameterlessCall(
  constructorDeclaration: Node,
): boolean {
  return getNodeList(getNodeField(constructorDeclaration, "Parameters"))
    .every(parameterAllowsOmission);
}

function parameterAllowsOmission(
  parameter: Node,
): boolean {
  return getNodeField(parameter, "Initializer") !== undefined ||
    getNodeField(parameter, "QuestionToken") !== undefined;
}
