import type { Node, TypePropertyInfo } from "@tsonic/tsts";
import { sourcePresentCallableType, sourcePropertyTypeEvidenceNodes,
  sourceTransformedTypeFactEvidenceNodes, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectMemberDeclarationSource } from "../../../target-model/records/objects/member-declarations.js";
import type { CsharpTypePolicyBaseHost } from "../../source-evidence/types/resolution/model.js";
import { formCsharpCallableDeclaration } from "../../source-evidence/types/resolution/callable-type-parameters.js";
import { objectShapeMemberTargetNameForKey } from "../../../policy/identities/source-member-names.js";
import { resolveObjectShapeSourceMemberKey } from "../../../source/extension/member-keys.js";

export function formCsharpObjectMemberDeclarationSource(
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "semanticsFor">,
  property: TypePropertyInfo,
  queries: SourceFileSemantics,
  authoredTypeRoot: Node | undefined,
  literalOwner: Node | undefined,
): CsharpObjectMemberDeclarationSource | undefined {
  const declarations = Object.freeze([...new Set([
    ...queries.declarations.symbolDeclarations(property.symbol),
    ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol)),
  ])].filter((declaration): declaration is Node => declaration !== undefined));
  const sourceType = property.type;
  const sourceKey = resolveObjectShapeSourceMemberKey(declarations, property.name, host.ast, host.semanticsFor);
  const targetName = sourceKey === undefined ? undefined : objectShapeMemberTargetNameForKey(sourceKey);
  if (sourceKey === undefined || targetName === undefined) return undefined;
  const method = declarations.some(declaration =>
    host.ast.is.IsMethodDeclaration(declaration) || host.ast.is.IsMethodSignatureDeclaration(declaration));
  const getters = Object.freeze(declarations.filter(declaration => host.ast.is.IsGetAccessorDeclaration(declaration) &&
    (literalOwner === undefined || host.ast.parent(declaration) === literalOwner)));
  const setters = Object.freeze(declarations.filter(declaration => host.ast.is.IsSetAccessorDeclaration(declaration) &&
    (literalOwner === undefined || host.ast.parent(declaration) === literalOwner)));
  if (getters.length > 1 || setters.length > 1 || getters.length === 0 && setters.length > 0) return undefined;
  const callableType = method ? sourcePresentCallableType(sourceType, queries) : undefined;
  const signatures = callableType === undefined ? [] : queries.types.callSignatures(callableType);
  const methodDeclaration = signatures.length === 1 ? queries.declarations.signatureDeclaration(signatures[0]!) : undefined;
  const callableDeclaration = formCsharpCallableDeclaration(methodDeclaration, queries.sourceFile, host.ast);
  if (callableDeclaration === undefined) return undefined;
  const authoredTypeNodes = Object.freeze([
    ...sourcePropertyTypeEvidenceNodes(host.ast, queries, property),
    ...(authoredTypeRoot === undefined ? []
      : sourceTransformedTypeFactEvidenceNodes(host.ast, queries, authoredTypeRoot, sourceType)),
  ]);
  return Object.freeze({ property, propertyType: sourceType, queries, declarations,
    subjects: Object.freeze([property.symbol, ...declarations]), authoredTypeNodes,
    sourceKey, targetName, method, getters, setters, methodDeclaration, callableDeclaration,
  });
}
