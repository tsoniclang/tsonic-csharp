import type { Node, Type } from "@tsonic/tsts";
import type { TargetSourceProgram, SourceFileSemantics } from "@tsonic/target-api/source";
import { createSourceErrorDeclarationQuery, type SourceErrorDeclarationQueries, type SourceErrorDeclaredSlot, type SourceErrorScalarSlot } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpSourceProfileDeclarationIdentity, type CsharpSourceProfileOwner } from "../../policy/identities/selected-source.js";
import { csharpSourceErrorNames } from "../../target-model/identities/source-errors.js";
import { classifyCsharpSourceProfileType } from "../../policy/identities/source-types.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";

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
          ["name", "message", "stack", "cause"].includes(identity.name ?? "")) {
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

export function analyzeCsharpNativeErrorAdmission(source: TargetSourceProgram): {
  readonly issues: readonly TargetDiagnostic[];
  readonly nameInitializations: ReadonlySet<Node>;
} {
  const issues: TargetDiagnostic[] = [];
  const nameInitializations = new Set<Node>();
  const { ast, navigation, semantics } = source;
  const errorOwner = (type: Type, queries: SourceFileSemantics, seen = new Set<Node>()): { readonly declaration: Node; readonly plain: boolean } | undefined => {
    const present = queries.types.nonNullableType(type) ?? type;
    const identity = classifyCsharpSourceProfileType(present, queries, ast);
    const symbol = queries.declarations.typeSymbol(present);
    const declarations = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol);
    if (identity?.kind === "error") {
      const declaration = declarations.find(declaration => ast.is.IsInterfaceDeclaration(declaration) || ast.is.IsClassDeclaration(declaration));
      return declaration === undefined ? undefined : { declaration, plain: true };
    }
    for (const declaration of declarations) {
      if (!ast.is.IsClassDeclaration(declaration) || seen.has(declaration)) continue;
      seen.add(declaration);
      const heritage = navigation.declaredHeritage(declaration);
      if (heritage.kind !== "resolved") continue;
      for (const edge of heritage.edges) if (edge.kind === "extends" && errorOwner(edge.selectedType, semantics.forNode(edge.heritage), seen) !== undefined)
        return { declaration, plain: false };
    }
    return undefined;
  };
  const refuse = (node: Node, code: string, message: string): void => {
    issues.push(Object.freeze({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }));
  };
  for (const node of navigation.nodes) {
    if (!navigation.isProjectDeclaration(node)) continue;
    const queries = semantics.forNode(node);
    if (ast.is.IsObjectLiteralExpression(node)) {
      const contextual = queries.types.contextualType(node);
      if (contextual !== undefined && errorOwner(contextual.selectedType, queries) !== undefined) refuse(node,
        "CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED", "An Error is a native C# exception, not a structural object literal; construct a new Error instead.");
      continue;
    }
    const property = queries.operations.propertyAccess(node);
    if (property === undefined || property.accessMode === "read") continue;
    const declaration = property.selectedWriteDeclaration ?? property.selectedDeclaration;
    const name = declaration === undefined ? undefined : ast.name(declaration);
    const memberName = name !== undefined && (ast.is.IsIdentifier(name) || ast.is.IsStringLiteral(name)) ? ast.text(name) : undefined;
    if (memberName !== "message" && memberName !== "stack" && memberName !== "name") continue;
    const owner = errorOwner(property.receiver.type, queries);
    if (owner === undefined) continue;
    const assignment = ast.parent(node);
    const binary = assignment === undefined ? undefined : ast.as.AsBinaryExpression(assignment);
    const statement = assignment === undefined ? undefined : ast.parent(assignment);
    const className = ast.name(owner.declaration);
    if (memberName === "name" && !owner.plain && ast.kindName(property.receiver.expression) === "KindThisKeyword" &&
      binary?.Left === node && sourceOperatorFromKindName(ast.operatorKindName(assignment!)) === "=" &&
      ast.is.IsStringLiteral(binary.Right) && className !== undefined && ast.text(binary.Right) === ast.text(className) &&
      statement !== undefined && ast.is.IsExpressionStatement(statement)) {
      nameInitializations.add(statement);
      continue;
    }
    refuse(node, "CSHARP_ERROR_READONLY_STORAGE",
      "C# exceptions are immutable after construction; create a new Error or pass the message to super instead.");
  }
  return Object.freeze({ issues: Object.freeze(issues), nameInitializations: Object.freeze(nameInitializations) });
}
