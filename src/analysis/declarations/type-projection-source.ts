import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode, isSourceCallableBodyBoundary, type TargetSourceProgram } from "@tsonic/target-api/source";
import { csharpSourceTypeParameter, csharpSourceTypeParameters } from "../../source/extension/type-parameters.js";
import type { CsharpDeclaredObjectReceiverSource, CsharpObjectMethodSources,
  CsharpDeclaredObjectReceiverContextSource, CsharpDeclaredObjectReceiverSources } from "../../target-model/records/native/native-value-carriers.js";

export interface CsharpTypeProjectionScopeSource {
  readonly declaration: Node;
  readonly parameterIdentities: readonly string[];
  readonly capturedParameterIdentities: readonly string[];
  readonly parent: CsharpTypeProjectionScopeSource | undefined;
}

export interface CsharpTypeProjectionNodeSource {
  readonly node: Node;
  readonly parent: CsharpTypeProjectionNodeSource | undefined;
  readonly scopes: CsharpTypeProjectionScopeSource | undefined;
  readonly declarationOnly: boolean;
  readonly name: boolean;
  readonly declaredReceiver: CsharpDeclaredObjectReceiverSource | undefined;
  readonly receiverContext: CsharpDeclaredObjectReceiverContextSource | undefined;
}

export interface CsharpTypeProjectionSource {
  readonly nodes: readonly CsharpTypeProjectionNodeSource[];
  readonly owners: readonly CsharpTypeProjectionOwnerSource[];
  ownerFor(declaration: Node): CsharpTypeProjectionOwnerSource | undefined;
  readonly declaredReceivers: CsharpDeclaredObjectReceiverSources;
}

export interface CsharpTypeProjectionOwnerSource {
  readonly declaration: Node;
  readonly nodes: readonly CsharpTypeProjectionNodeSource[];
}

export function formCsharpTypeProjectionSource(
  source: TargetSourceProgram,
  objectMethods: CsharpObjectMethodSources,
): CsharpTypeProjectionSource {
  const { ast } = source;
  const nodes: CsharpTypeProjectionNodeSource[] = [];
  const receivers = new WeakMap<Node, CsharpDeclaredObjectReceiverContextSource>();
  const owners = new Map<Node, CsharpTypeProjectionNodeSource[]>();
  const ownerOrder: Node[] = [];
  const visit = (node: Node, parent: CsharpTypeProjectionNodeSource | undefined,
    enclosingOwners: readonly Node[]): void => {
    if (ast.is.IsTypeAliasDeclaration(node) || ast.is.IsImportDeclaration(node)) return;
    const declarationOnly = ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node) || ast.is.IsInterfaceDeclaration(node);
    const parameterIdentities = csharpSourceTypeParameters(node, ast).flatMap(parameter => {
      const identity = parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, ast)?.identity;
      return identity === undefined ? [] : [identity];
    });
    const classDeclaration = ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node);
    const queries = classDeclaration ? source.semantics.forNode(node) : undefined;
    const declared = queries?.declarations.declaredType(node);
    const capturedParameterIdentities = declared === undefined ? [] : queries!.types.typeArgumentBindings(declared)
      ?.filter(binding => binding.scope === "outer")
      .map(binding => csharpSourceTypeParameter(binding.declaration, ast)?.identity)
      .filter((identity): identity is string => identity !== undefined) ?? [];
    const scopes = parameterIdentities.length === 0 && !classDeclaration ? parent?.scopes : Object.freeze({
      declaration: node, parameterIdentities: Object.freeze(parameterIdentities),
      capturedParameterIdentities: Object.freeze(capturedParameterIdentities), parent: parent?.scopes,
    });
    const astParent = ast.parent(node);
    const memberBody = ast.is.IsMethodDeclaration(node) || ast.is.IsGetAccessorDeclaration(node) || ast.is.IsSetAccessorDeclaration(node);
    const receiverBoundary = memberBody || classDeclaration || ast.is.IsInterfaceDeclaration(node) ||
      ast.is.IsFunctionDeclaration(node) || ast.is.IsFunctionExpression(node);
    const declaredReceiver = memberBody && astParent !== undefined && ast.is.IsObjectLiteralExpression(astParent)
      ? objectMethods.get(astParent)?.declaredReceiver
      : receiverBoundary ? undefined : parent?.declaredReceiver;
    const receiverContext = receiverBoundary
      ? declaredReceiver === undefined ? undefined : Object.freeze({ member: node, receiver: declaredReceiver })
      : parent?.receiverContext;
    const selected = Object.freeze({ node, parent, scopes, declarationOnly,
      name: astParent !== undefined && ast.name(astParent) === node,
      declaredReceiver, receiverContext,
    });
    const ownsBody = isSourceCallableBodyBoundary(ast, node) || scopes?.declaration === node;
    const currentOwners = ownsBody ? [...enclosingOwners, node] : enclosingOwners;
    if (ownsBody) owners.set(node, []);
    for (const owner of currentOwners) owners.get(owner)!.push(selected);
    if (receiverContext !== undefined) receivers.set(node, receiverContext);
    nodes.push(selected);
    if (!IsTypeSyntaxNode(ast, node)) ast.forEachChild(node, child => { if (child !== undefined) visit(child, selected, currentOwners); });
    if (ownsBody) ownerOrder.push(node);
  };
  source.navigation.sourceFiles.forEach(sourceFile => visit(sourceFile, undefined, []));
  const published = new Map([...owners].map(([declaration, nodes]) => [declaration,
    Object.freeze({ declaration, nodes: Object.freeze(nodes) })]));
  return Object.freeze({ nodes: Object.freeze(nodes), owners: Object.freeze(ownerOrder.map(owner => published.get(owner)!)),
    ownerFor: (declaration: Node) => published.get(declaration),
    declaredReceivers: Object.freeze({ get: (node: Node) => receivers.get(node) }),
  });
}
