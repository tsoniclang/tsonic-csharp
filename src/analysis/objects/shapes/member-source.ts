import type { Node, SourceFile, Type, TypePropertyInfo } from "@tsonic/tsts";
import { ObjectLiteralProperty_Value, sourceClassFieldIsTypeOnly, sourcePropertyTypeEvidenceNodes,
  sourceTransformedTypeFactEvidenceNodes, sourcePresentCallableType,
  type SourceFileSemantics, type SourceStructuralMemberPair } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { formCsharpCallableDeclaration,
  type CsharpCallableDeclarationEvidence } from "../../source-evidence/types/resolution/callable-type-parameters.js";
import { objectShapeMemberTargetNameForKey } from "../../../policy/identities/source-member-names.js";
import { resolveObjectShapeSourceMemberKey } from "../../../source/extension/member-keys.js";
import { isCsharpNativeSourceProfileMemberDeclaration, typeIncludesNullish } from "./source-evidence.js";
import { matchesMemberSubjects, type CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import type { CsharpCurrentProjectDeclaration } from "../../source-evidence/model.js";

export interface CsharpInheritedObjectShapeMemberSource {
  readonly declaration: Node;
  readonly owner: CsharpCurrentProjectDeclaration;
  readonly typeNode: Node | undefined;
  readonly methodType: Type | undefined;
}

export interface CsharpCollectedObjectShapeMember {
  readonly property: TypePropertyInfo;
  readonly propertyType: Type;
  readonly declarations: readonly Node[];
  readonly declarationValues: readonly { readonly declaration: Node; readonly value: Node | undefined }[];
  readonly authoredTypeNodes: readonly Node[];
  readonly state: CsharpTypeResolutionState;
  readonly sourceStorageSubject: CsharpTypeResolutionState["sourceStorageSubject"];
  readonly sourceKey: NonNullable<ReturnType<typeof resolveObjectShapeSourceMemberKey>>;
  readonly targetName: string;
  readonly method: boolean;
  readonly getters: readonly Node[];
  readonly setters: readonly Node[];
  readonly methodDeclaration: Node | undefined;
  readonly callableDeclaration: CsharpCallableDeclarationEvidence;
  readonly inheritedDeclarations: readonly CsharpInheritedObjectShapeMemberSource[];
  readonly value: Node | undefined;
  readonly bound: boolean;
  readonly nullish: boolean;
  readonly correspondence: Extract<SourceStructuralMemberPair, { readonly kind: "present" }>;
  readonly proofInput: CsharpObjectShapeMemberProofInput;
}

export interface CsharpCollectedObjectShapeMembers {
  readonly ownerType: Type;
  readonly queries: SourceFileSemantics;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
  readonly authoredTypeRoot: Node | undefined;
  readonly correspondence: Extract<ReturnType<SourceFileSemantics["types"]["structuralMembers"]>, { readonly kind: "available" }>;
  readonly members: readonly CsharpCollectedObjectShapeMember[];
}

export interface CsharpLiteralMemberEvidenceSource {
  readonly objectLiteral: Node;
  readonly queries: SourceFileSemantics;
  readonly elements: readonly NonNullable<ReturnType<SourceFileSemantics["operations"]["objectLiteralElement"]>>[];
}

export interface CsharpLiteralMemberEvidenceProjection<TMember extends CsharpObjectShapeMemberProofInput> {
  readonly source: CsharpLiteralMemberEvidenceSource;
  readonly members: readonly {
    readonly input: TMember;
    readonly output: Omit<TMember, "sourceSubjects" | "sourceDeclarations"> & CsharpObjectShapeMemberProofInput;
  }[];
}

export function retainCheckedMemberDeclarationEvidence(
  members: readonly Pick<CsharpObjectShapeMemberProofInput,
    "sourceSubjects" | "sourceDeclarations" | "sourceTypes" | "optional">[],
  ownerType: Type,
  selected: ReturnType<SourceFileSemantics["types"]["structuralMembers"]>,
): readonly CsharpObjectShapeMemberProofInput[] | undefined {
  if (selected.kind !== "available") return undefined;
  const retained = members.map(member => {
    const matching = selected.members.filter(pair => pair.kind === "present" &&
      pair.destination.receiverType === ownerType && pair.source.receiverType === ownerType &&
      matchesMemberSubjects(member, pair.destination));
    if (matching.length !== 1) return undefined;
    return Object.freeze({ sourceSubjects: member.sourceSubjects, sourceDeclarations: member.sourceDeclarations,
      sourceTypes: member.sourceTypes, optional: member.optional,
      sourceMemberEvidence: Object.freeze([Object.freeze({ ownerType, sourceType: ownerType,
        correspondence: matching[0]! })]) });
  });
  return retained.some(member => member === undefined) ? undefined
    : Object.freeze(retained as readonly CsharpObjectShapeMemberProofInput[]);
}

export function formLiteralMemberEvidence(
  host: Pick<CsharpObjectShapePolicyHost, "ast">,
  objectLiteral: Node,
  queries: SourceFileSemantics,
): CsharpLiteralMemberEvidenceSource {
  const selected = host.ast.properties(objectLiteral).flatMap(element => {
    const evidence = element === undefined ? undefined : queries.operations.objectLiteralElement(element);
    return evidence === undefined || evidence.objectLiteral !== objectLiteral || evidence.element !== element
      ? [] : [evidence];
  });
  return Object.freeze({ objectLiteral, queries, elements: Object.freeze(selected) });
}

export function projectLiteralMemberEvidence<TMember extends CsharpObjectShapeMemberProofInput>(
  members: readonly TMember[],
  source: CsharpLiteralMemberEvidenceSource,
): CsharpLiteralMemberEvidenceProjection<TMember> {
  const projected = members.map(member => {
    const elements = source.elements.filter(evidence => member.sourceSubjects?.some(subject =>
      subject === evidence.sourceSelectedSymbol || evidence.sourceSelectedDeclarations.some(declaration => declaration === subject)) === true);
    if (elements.length === 0) return Object.freeze({ input: member, output: member });
    const output = Object.freeze({ ...member,
      sourceSubjects: Object.freeze([...new Set([
        ...(member.sourceSubjects ?? []),
        ...elements.flatMap(evidence => evidence.sourceElementSymbol === undefined
          ? [evidence.element] : [evidence.element, evidence.sourceElementSymbol]),
      ])]),
      sourceDeclarations: Object.freeze([...new Set([
        ...(member.sourceDeclarations ?? []),
        ...elements.map(evidence => evidence.element),
      ])]),
    });
    return Object.freeze({ input: member, output });
  });
  return Object.freeze({ source, members: Object.freeze(projected) });
}

export function createCsharpObjectShapeMemberSource(host: CsharpObjectShapePolicyHost) {
  function collectMember(
    property: TypePropertyInfo,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    authoredTypeRoot: Node | undefined,
    literalOwner: Node | undefined,
  ): Omit<CsharpCollectedObjectShapeMember, "correspondence" | "proofInput"> | undefined {
    const declarations = [...new Set([
      ...queries.declarations.symbolDeclarations(property.symbol),
      ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol)),
    ])].filter((declaration): declaration is Node => declaration !== undefined);
    const selection = declarations.length !== 1 ? undefined : host.sourceStorage.memberSubjectFor(declarations[0]!);
    const sourceType = property.type;
    const sourceKey = resolveObjectShapeSourceMemberKey(declarations, property.name, host.ast, host.semanticsFor);
    const targetName = sourceKey === undefined ? undefined : objectShapeMemberTargetNameForKey(sourceKey);
    if (sourceKey === undefined || targetName === undefined) return undefined;
    const method = declarations.some(declaration =>
      host.ast.is.IsMethodDeclaration(declaration) || host.ast.is.IsMethodSignatureDeclaration(declaration));
    const getters = declarations.filter(declaration => host.ast.is.IsGetAccessorDeclaration(declaration) &&
      (literalOwner === undefined || host.ast.parent(declaration) === literalOwner));
    const setters = declarations.filter(declaration => host.ast.is.IsSetAccessorDeclaration(declaration) &&
      (literalOwner === undefined || host.ast.parent(declaration) === literalOwner));
    if (getters.length > 1 || setters.length > 1 || getters.length === 0 && setters.length > 0) return undefined;
    const callableType = method ? sourcePresentCallableType(sourceType, queries) : undefined;
    const signatures = callableType === undefined ? [] : queries.types.callSignatures(callableType);
    const methodDeclaration = signatures.length === 1 ? queries.declarations.signatureDeclaration(signatures[0]!) : undefined;
    const callableDeclaration = formCsharpCallableDeclaration(methodDeclaration, queries.sourceFile, host.ast);
    if (callableDeclaration === undefined) return undefined;
    const inheritedDeclarations = declarations.flatMap(declaration => {
      const owner = host.projectDeclarations.declarationForNode(host.ast.parent(declaration));
      if (owner === undefined || host.ast.hasModifierKind(declaration, "static")) return [];
      const typeNode = host.ast.typeNode(declaration) ??
        (host.ast.is.IsSetAccessorDeclaration(declaration) ? host.ast.typeNode(host.ast.parameters(declaration)[0]) : undefined);
      const methodType = method ? host.semantics(owner.sourceFile).types.expressionType(declaration) : undefined;
      return [Object.freeze({ declaration, owner, typeNode, methodType })];
    });
    const declarationValues = Object.freeze(declarations.map(declaration => Object.freeze({ declaration,
      value: host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration)
        ? ObjectLiteralProperty_Value(host.ast, declaration) : undefined,
    })));
    const authoredTypeNodes = Object.freeze([
      ...sourcePropertyTypeEvidenceNodes(host.ast, queries, property),
      ...(authoredTypeRoot === undefined ? []
        : sourceTransformedTypeFactEvidenceNodes(host.ast, queries, authoredTypeRoot, sourceType)),
    ]);
    const sourceStorageSubject = selection?.kind === "resolved" ? selection.subject : undefined;
    return Object.freeze({ property, propertyType: sourceType, declarations: Object.freeze(declarations), declarationValues,
      authoredTypeNodes, state: Object.freeze({ ...state, sourceStorageSubject }), sourceStorageSubject,
      sourceKey, targetName, method, getters: Object.freeze(getters), setters: Object.freeze(setters), methodDeclaration,
      callableDeclaration, inheritedDeclarations: Object.freeze(inheritedDeclarations),
      value: !method && declarationValues.length === 1 ? declarationValues[0]!.value : undefined,
      bound: host.memoryBindings.hasBoundField([property.symbol, ...declarations]),
      nullish: typeIncludesNullish(sourceType, queries),
    });
  }

  function collectMembers(
    ownerType: Type,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node,
  ): CsharpCollectedObjectShapeMembers | undefined {
    const symbol = queries.declarations.typeSymbol(ownerType);
    const literals = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol)
      .filter(declaration => host.ast.is.IsObjectLiteralExpression(declaration));
    if (literals.length > 1) return undefined;
    const correspondence = queries.types.structuralMembers(ownerType, ownerType, "correspondence");
    if (correspondence.kind !== "available") return undefined;
    const members: CsharpCollectedObjectShapeMember[] = [];
    for (const property of queries.types.propertyInfos(ownerType)) {
      const declarations = [...new Set([
        ...queries.declarations.symbolDeclarations(property.symbol),
        ...property.rootSymbols.flatMap(root => queries.declarations.symbolDeclarations(root)),
      ])].filter((declaration): declaration is Node => declaration !== undefined);
      if (declarations.length !== 0 && declarations.every(declaration => sourceClassFieldIsTypeOnly(host.ast, declaration))) continue;
      if (declarations.some(declaration => isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast))) {
        if (!declarations.every(declaration => isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast))) return undefined;
        continue;
      }
      const member = collectMember(property, queries, state, authoredTypeRoot, literals[0]);
      if (member === undefined) return undefined;
      const sourceDeclarations = [...new Set([...member.declarations,
        ...(member.methodDeclaration === undefined ? [] : [member.methodDeclaration])])];
      const subjects = Object.freeze({ sourceSubjects: Object.freeze([property.symbol, ...member.declarations]),
        sourceDeclarations: sourceDeclarations.length === 0 ? undefined : Object.freeze(sourceDeclarations),
        sourceTypes: Object.freeze([member.propertyType]), optional: property.optional ? true : undefined });
      const proofInput = retainCheckedMemberDeclarationEvidence([subjects], ownerType, correspondence)?.[0];
      const selected = proofInput?.sourceMemberEvidence?.[0]?.correspondence;
      if (proofInput === undefined || selected?.kind !== "present") return undefined;
      members.push(Object.freeze({ ...member, correspondence: selected, proofInput }));
    }
    return Object.freeze({ ownerType, queries, sourceFile: queries.sourceFile, state, authoredTypeRoot,
      correspondence, members: Object.freeze(members) });
  }

  return { collectMembers };
}
