import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceErrorDeclarationQuery, type SourceErrorDeclarationQueries, type SourceErrorDeclaredSlot, type SourceErrorScalarSlot } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpSourceProfileDeclarationIdentity, type CsharpSourceProfileOwner } from "../../policy/identities/selected-source.js";
import { csharpSourceErrorNames } from "../../target-model/identities/source-errors.js";

export function createCsharpErrorDeclarationQuery(source: TargetSourceProgram): SourceErrorDeclarationQueries {
  const fields: SourceErrorDeclaredSlot[] = [];
  const constructors: SourceErrorDeclaredSlot[] = [];
  const stackCaptures: { readonly declaration: Node; readonly owner: CsharpSourceProfileOwner }[] = [];
  const stackFields = new Map<CsharpSourceProfileOwner, Node>();
  const slot = (declaration: Node, construction: boolean): SourceErrorDeclaredSlot => {
    const queries = source.semantics.forNode(declaration);
    const selectedType = construction ? queries.types.declarationSignatureInfo(declaration)?.returnType
      : queries.declarations.declaredValueType(declaration);
    if (selectedType === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A selected Error declaration requires its original checked type component.", declaration);
    const authoredTypeNode = source.ast.typeNode(declaration);
    return Object.freeze({ declaration, component: Object.freeze({ declaration, selectedType,
      ...(authoredTypeNode === undefined ? {} : { authoredTypeNode }) }) });
  };
  for (const file of source.sourceFiles) {
    if (!source.semantics.includes(file)) continue;
    const semantics = source.semantics.forFile(file);
    for (const statement of source.ast.statements(file)) {
      if (statement === undefined || !source.ast.is.IsInterfaceDeclaration(statement)) continue;
      for (const member of source.ast.members(statement)) {
        const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, member);
        if (member === undefined || identity === undefined) continue;
        if ((identity.kind === "call" || identity.kind === "construct") &&
          csharpSourceErrorNames.some(name => identity.declaringName === `${name}Constructor`)) constructors.push(slot(member, true));
        if (identity.kind === "member" && identity.declaringName === "Error" &&
          ["name", "message", "stack"].includes(identity.name ?? "")) {
          fields.push(slot(member, false));
          if (identity.name === "stack") stackFields.set(identity.owner, member);
        }
        if (identity.kind === "member" && identity.declaringName === "ErrorConstructor" &&
          identity.name === "captureStackTrace") stackCaptures.push({ declaration: member, owner: identity.owner });
      }
    }
  }
  const scalarMutators: SourceErrorScalarSlot[] = stackCaptures.map(({ declaration: signatureDeclaration, owner }) => {
    const stackField = stackFields.get(owner);
    const parameterDeclaration = source.ast.parameters(signatureDeclaration)[0];
    if (parameterDeclaration === undefined || stackField === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "The selected Error stack capture requires its checked scalar parameter and stack field.", signatureDeclaration);
    return Object.freeze({ signatureDeclaration, parameterDeclaration, parameterIndex: 0,
      component: slot(parameterDeclaration, false).component, fields: Object.freeze([stackField]) });
  });
  return createSourceErrorDeclarationQuery(source, { fields: Object.freeze(fields), constructors: Object.freeze(constructors),
    scalarMutators: Object.freeze(scalarMutators) });
}
