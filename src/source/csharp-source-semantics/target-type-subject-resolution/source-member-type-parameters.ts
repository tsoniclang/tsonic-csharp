import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "../ast-utils.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "../target-type-resolution-host.js";
import {
  substituteTargetTypeParameters,
} from "../target-types.js";

export function resolveSourceMemberTypeParameterFromReceiver(
  typeParameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>,
  memberAccess: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolveSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    host: CsharpTargetTypeResolutionHost,
  ) => TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (ast === undefined || checker === undefined || !ast.is.IsPropertyAccessExpression(memberAccess)) {
    return undefined;
  }
  const receiver = asNodeSubject(getNodeField(memberAccess, "Expression"));
  const memberName = asNodeSubject(getNodeField(memberAccess, "Name")) ??
    asNodeSubject(getNodeField(memberAccess, "name"));
  if (receiver === undefined || memberName === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(memberAccess);
  const selectedMemberSymbol = checker.getResolvedSymbol(memberName, { sourceFile }) ??
    checker.getSymbolAtLocation(memberName, { sourceFile }) ??
    checker.getResolvedSymbol(memberAccess, { sourceFile }) ??
    checker.getSymbolAtLocation(memberAccess, { sourceFile });
  const declaringType = getDeclaringSourceTypeDeclaration(selectedMemberSymbol, context);
  if (declaringType === undefined || !sourceTypeDeclaresTypeParameter(declaringType, typeParameter.name, context)) {
    return undefined;
  }
  const receiverType = checker.getTypeAtLocation(receiver, { sourceFile });
  for (const receiverDeclaration of getSymbolDeclarations(checker.getTypeSymbol(receiverType), checker)) {
    const substitution = resolveTypeParameterThroughSourceBaseChain(
      receiverDeclaration,
      declaringType,
      typeParameter.name,
      new Map(),
      context,
      {
        ...options,
        sourceFile,
      },
      host,
      resolveSubject,
      new Set(),
    );
    if (substitution !== undefined) {
      return substitution;
    }
  }
  return undefined;
}

function getDeclaringSourceTypeDeclaration(
  symbol: unknown,
  context: ExtensionObservationContext,
): Node | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  for (const declaration of getSymbolDeclarations(symbol as ExtensionFactSubject | undefined, context.compiler?.checker)) {
    for (let current = ast.parent(declaration); current !== undefined; current = ast.parent(current)) {
      const kind = ast.kindName(current);
      if (kind === "KindClassDeclaration" || kind === "KindInterfaceDeclaration") {
        return current;
      }
      if (kind === "KindSourceFile") {
        break;
      }
    }
  }
  return undefined;
}

function sourceTypeDeclaresTypeParameter(
  declaration: Node,
  typeParameterName: string,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  return ast?.typeParameters(declaration).some((parameter) => ast.text(ast.name(parameter)) === typeParameterName) === true;
}

function resolveTypeParameterThroughSourceBaseChain(
  currentDeclaration: Node,
  targetDeclaration: Node,
  targetTypeParameterName: string,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolveSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    host: CsharpTargetTypeResolutionHost,
  ) => TargetTypeRef | undefined,
  seen: Set<Node>,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined || seen.has(currentDeclaration)) {
    return undefined;
  }
  seen.add(currentDeclaration);
  if (sameSourceDeclaration(currentDeclaration, targetDeclaration, context)) {
    return substitutions.get(targetTypeParameterName);
  }
  for (const heritage of ast.extendsHeritageElements(currentDeclaration)) {
    if (heritage === undefined) {
      continue;
    }
    const baseDeclaration = getHeritageTargetDeclaration(heritage, context);
    if (baseDeclaration === undefined) {
      continue;
    }
    const baseSubstitutions = getHeritageTypeParameterSubstitutions(
      heritage,
      baseDeclaration,
      substitutions,
      context,
      options,
      host,
      resolveSubject,
    );
    const result = resolveTypeParameterThroughSourceBaseChain(
      baseDeclaration,
      targetDeclaration,
      targetTypeParameterName,
      baseSubstitutions,
      context,
      options,
      host,
      resolveSubject,
      seen,
    );
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

function getHeritageTargetDeclaration(
  heritage: Node,
  context: ExtensionObservationContext,
): Node | undefined {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (ast === undefined || checker === undefined) {
    return undefined;
  }
  const expression = asNodeSubject(getNodeField(heritage, "Expression")) ??
    asNodeSubject(getNodeField(heritage, "expression")) ??
    heritage;
  const sourceFile = ast.getSourceFile(heritage);
  const symbol = checker.getResolvedSymbol(expression, { sourceFile }) ??
    checker.getSymbolAtLocation(expression, { sourceFile });
  return getSymbolDeclarations(symbol, checker).find((declaration) =>
    ast.kindName(declaration) === "KindClassDeclaration" ||
    ast.kindName(declaration) === "KindInterfaceDeclaration"
  );
}

function getHeritageTypeParameterSubstitutions(
  heritage: Node,
  baseDeclaration: Node,
  inheritedSubstitutions: ReadonlyMap<string, TargetTypeRef>,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolveSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    host: CsharpTargetTypeResolutionHost,
  ) => TargetTypeRef | undefined,
): ReadonlyMap<string, TargetTypeRef> {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return new Map();
  }
  const baseTypeParameters = ast.typeParameters(baseDeclaration);
  const typeArguments = ast.typeArguments(heritage).length > 0
    ? ast.typeArguments(heritage)
    : getNodeList(getNodeField(heritage, "TypeArguments"));
  if (baseTypeParameters.length === 0 || typeArguments.length === 0) {
    return new Map();
  }
  const substitutions = new Map<string, TargetTypeRef>();
  for (let index = 0; index < baseTypeParameters.length; index += 1) {
    const typeParameter = baseTypeParameters[index];
    const typeArgument = typeArguments[index];
    if (typeParameter === undefined || typeArgument === undefined) {
      continue;
    }
    const name = ast.text(ast.name(typeParameter));
    const resolved = resolveSubject(typeArgument, context, options, host);
    if (name.length > 0 && resolved !== undefined) {
      substitutions.set(name, substituteTargetTypeParameters(resolved, inheritedSubstitutions));
    }
  }
  return substitutions;
}

function sameSourceDeclaration(
  left: Node,
  right: Node,
  context: ExtensionObservationContext,
): boolean {
  if (left === right) {
    return true;
  }
  const ast = context.compiler?.ast;
  if (ast === undefined || ast.kindName(left) !== ast.kindName(right)) {
    return false;
  }
  const leftSource = ast.getSourceFile(left);
  const rightSource = ast.getSourceFile(right);
  if (
    leftSource !== undefined &&
    rightSource !== undefined &&
    ast.getFileName(leftSource) === ast.getFileName(rightSource) &&
    ast.pos(left) === ast.pos(right) &&
    ast.end(left) === ast.end(right)
  ) {
    return true;
  }
  return false;
}
