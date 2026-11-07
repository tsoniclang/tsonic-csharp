// The C# source evidence index (nextgen C-2542, I2, I4). One syntax walk over the program that records, per node,
// the .NET representation of the Host's published answers (facts.values / selections / relations / navigation) and
// the extension-marker records (fields, structs, default values, fixed arrays, memory metadata, pointer backing).
// No checker Type, Signature or Symbol is read; no Source question is answered here. Host refusals are forwarded
// before C# analysis (analysis/program/analyze.ts), so a refused Host outcome reached here is an invariant failure.
// A CSHARP_ representation refusal is a .NET-capability issue and is reported at its site.
import type { ExtensionFactSubject, Node, SourceFile } from "@tsonic/tsts";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { SourceTypeDescriptor, SourceYieldSelection, TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { sourceClassFieldIsTypeOnly, sourceTypeDescriptorsEqual } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { tsonicCoreAnalysisKey, type TsonicPointerStorageRelation } from "@tsonic/source-core/facts";
import { selectCsharpFlowReadCarrier } from "../../policy/conversions/flow-read.js";
import { csharpFlowReadPrincipalDeclaration, isCsharpFlowReadEvidenceNode, freezeSourceArgumentClassification } from "./source-values.js";
import { csharpNativePropertyNameIssue } from "../objects/computed-field-names.js";
import { isCsharpJsValueTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../policy/types/index.js";
import { isTypeParameterTargetRef } from "../../policy/ownership/type-categories.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import type { CsharpWellKnownSymbolKind, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpWellKnownSymbolKind } from "../../target-model/types/source-member-keys.js";
import type { CsharpContextualTupleClassification, CsharpContextualTypeEvidence, CsharpSourceEvidenceIndex,
  CsharpSourceArgumentClassification, CsharpValueRefinementClassification } from "../../target-model/records/program/source-evidence.js";
import type { CsharpSourceDefaultValue, CsharpSourceField, CsharpSourceStruct } from "../../target-model/records/program/source-markers.js";
import type { CsharpBindingProjection } from "../../target-model/records/storage/binding-projection-policy.js";
import type { CsharpTypeParameterConstraintResolution } from "../../target-model/types/generic-constraints.js";
import type { CsharpPointerReturnContract } from "../../target-model/records/calls/pointer-return.js";
import type { CsharpSourceEvidenceResult } from "./model.js";
import { selectCsharpSourceArgument } from "../../source/extension/arguments.js";
import { readCsharpSourceDefaultValue, readCsharpSourceField, readCsharpSourceStruct } from "../../source/extension/markers.js";
import { createCsharpPointerBackingDemands } from "./pointer-backing.js";
import { analyzeCsharpTypeOnlyDeclarations } from "../declarations/type-only.js";
import { selectCsharpClassFactoryType } from "../../policy/types/objects/class-factory-types.js";
import { isCsharpRefusal, type CsharpRefusal, type CsharpRepresentation } from "../../representation/index.js";
import { csharpFixedArrayRefusalCode } from "../../policy/types/collections/fixed-arrays.js";

export function analyzeCsharpSourceEvidence(
  source: TargetSourceProgramFacts,
  sourceFiles: readonly SourceFile[],
  types: CsharpTypeQueries,
  policy: CsharpPolicyContext,
  pointerStorage: TsonicPointerStorageRelation,
): CsharpSourceEvidenceResult {
  const { syntax: ast, facts, sourceFacts } = source;
  const core = facts.analyses.extension(tsonicCoreAnalysisKey);
  const pointerBacking = createCsharpPointerBackingDemands(source, pointerStorage, types);
  const typeOnlyDeclarations = analyzeCsharpTypeOnlyDeclarations(source, sourceFiles);
  const compileTimeMetadata = new WeakSet<Node>(typeOnlyDeclarations);
  let compileTimeDeclarationsOpen = true;
  const memoryMetadataIssues: { readonly node: Node; readonly code: string; readonly message: string }[] = [];
  const fixedArrayIssues: { readonly node: Node; readonly code: string; readonly message: string }[] = [];
  const fixedArrayMessages = new Set<string>();
  const nativeExpressionIssues = new Map<Node, { readonly diagnostic: TargetDiagnostic; readonly requiredBy: Set<Node> }>();
  const nodeTargetTypes = new WeakMap<Node, TargetTypeRef>();
  const bindingProjections = new WeakMap<Node, CsharpBindingProjection>();
  const classConstructorTypes = new WeakMap<Node, TargetTypeRef>();
  const storageTargetTypes = new WeakMap<Node, TargetTypeRef>();
  const readStorageTargetTypes = new WeakMap<Node, TargetTypeRef>();
  const contextualTypes = new WeakMap<Node, CsharpContextualTypeEvidence>();
  const constants = new WeakMap<Node, { readonly value: unknown }>();
  const refinements = new WeakMap<Node, CsharpValueRefinementClassification>();
  const generators = new WeakMap<Node, NonNullable<ReturnType<typeof facts.selections.generator>>>();
  const generatorTargetTypes = new WeakMap<Node, TargetTypeRef>();
  const yields = new WeakMap<Node, SourceYieldSelection>();
  const yieldTargetTypes = new WeakMap<Node, TargetTypeRef>();
  const wellKnownSymbols = new WeakMap<Node, CsharpWellKnownSymbolKind>();
  const inferredReturns = new WeakMap<Node, TargetTypeRef>();
  const pointerReturns = new WeakMap<Node, CsharpPointerReturnContract>();
  const arguments_ = new WeakMap<Node, CsharpSourceArgumentClassification>();
  const defaultValues = new WeakMap<Node, CsharpSourceDefaultValue>();
  const sourceFields = new WeakMap<Node, CsharpSourceField>();
  const sourceStructs = new WeakMap<Node, CsharpSourceStruct>();
  const providerVirtualDeclarations = new WeakSet<Node>();
  const contextualTuples = new WeakMap<Node, CsharpContextualTupleClassification>();
  const typeParameterConstraints = new WeakMap<Node, CsharpTypeParameterConstraintResolution>();
  const sourceOwnedProjectShapes = new WeakMap<Node, boolean>();
  const targetTypes = new Map<string, TargetTypeRef>();

  const recordTargetType = (type: TargetTypeRef | undefined): TargetTypeRef | undefined => {
    if (type === undefined) return undefined;
    const key = targetTypeRefKey(type);
    if (targetTypes.has(key)) return type;
    targetTypes.set(key, type);
    for (const component of csharpTargetTypeComponents(type)) recordTargetType(component);
    return type;
  };

  /** A CSHARP_ representation refusal: fixed-array extents go to the fixed-array issues, the rest to native issues. */
  const recordRefusal = (refusal: CsharpRefusal, requiredBy: Node): void => {
    if (refusal.code === csharpFixedArrayRefusalCode) {
      if (fixedArrayMessages.has(refusal.message)) return;
      fixedArrayMessages.add(refusal.message);
      fixedArrayIssues.push(Object.freeze({ node: refusal.site, code: refusal.code, message: refusal.message }));
      return;
    }
    const previous = nativeExpressionIssues.get(refusal.site);
    if (previous !== undefined) previous.requiredBy.add(requiredBy);
    else nativeExpressionIssues.set(refusal.site, {
      diagnostic: Object.freeze({ code: refusal.code, category: "error", source: "tsonic-csharp",
        sourceNode: refusal.site, message: refusal.message }),
      requiredBy: new Set([requiredBy]),
    });
  };

  /**
   * Records a represented type. A CSHARP_ refusal of a node's own value is reported at its site (outside type-only
   * declarations); a refused derived carrier (storage, contextual, generator, return) is left unrecorded, and the
   * reader that needs it reports its own .NET reason.
   */
  const represented = (selected: CsharpRepresentation, node: Node, typeOnly: boolean, report = false): TargetTypeRef | undefined => {
    if (!isCsharpRefusal(selected)) return recordTargetType(selected);
    if (report && !typeOnly) recordRefusal(selected, node);
    return undefined;
  };

  /** The Host value type of a node with a published value (I4: `type` answers exactly where `has` is true). */
  const hostValue = (node: Node): SourceTypeDescriptor | undefined => {
    if (!facts.values.has(node)) return undefined;
    const outcome = facts.values.type(node);
    if (outcome.kind === "refused") return failTargetAnalysisInvariant("tsonic-csharp",
      `A Host refusal (${outcome.code}) reached the C# source evidence; Host refusals are forwarded before C# analysis.`, node);
    return outcome.type;
  };

  for (const sourceFile of sourceFiles) visit(sourceFile, sourceFile);

  function requirePropertyName(name: Node, requiredBy: Node): void {
    const previous = nativeExpressionIssues.get(name);
    if (previous !== undefined) {
      previous.requiredBy.add(requiredBy);
      return;
    }
    const selected = facts.analyses.propertyName(name);
    if (selected === undefined) {
      if (ast.is.IsComputedPropertyName(name)) failTargetAnalysisInvariant("tsonic-csharp",
        "A native computed field requires its Host property-name selection.", name);
      return;
    }
    const diagnostic = csharpNativePropertyNameIssue(name, selected);
    if (diagnostic !== undefined) nativeExpressionIssues.set(name, { diagnostic, requiredBy: new Set([requiredBy]) });
  }

  /** Project member names of an authored object type (Host object facts), each a native field name requirement. */
  function requireAuthoredMemberNames(node: Node, authoredType: Node): void {
    const type = hostValue(authoredType);
    if (type === undefined || type.kind !== "shape" && (type.kind !== "declared" || ast.is.IsTypeParameterDeclaration(type.declaration))) return;
    const members = facts.objects.members(type);
    if (!Array.isArray(members)) return failTargetAnalysisInvariant("tsonic-csharp",
      "Host object members of an authored type were refused after Host refusals were forwarded.", authoredType);
    for (const member of members as Exclude<typeof members, { readonly kind: "refused" }>) {
      for (const declaration of member.declarations) {
        if (!facts.navigation.identity.isProjectDeclaration(declaration) || sourceClassFieldIsTypeOnly(ast, declaration)) continue;
        let owner: Node | undefined = declaration;
        while (owner !== undefined && !compileTimeMetadata.has(owner)) owner = ast.parent(owner);
        if (owner !== undefined) continue;
        const name = ast.name(declaration);
        if (name !== undefined) requirePropertyName(name, node);
      }
    }
  }

  /**
   * Storage of a node: the Host slot it names (a catch variable included: its Source type is the Host slot of the catch
   * declaration, represented by the one mapping; R3 #12), else its own value.
   */
  function storageOf(node: Node): CsharpRepresentation | undefined {
    if (ast.is.IsParenthesizedExpression(node)) {
      const inner = ast.as.AsParenthesizedExpression(node)?.Expression;
      return inner === undefined || !facts.values.has(inner) ? undefined : types.readStorage(inner);
    }
    const declaration = isValueDeclaration(node) ? node : facts.navigation.identity.target(node)?.declaration;
    if (declaration !== undefined && isValueDeclaration(declaration)) {
      return facts.values.has(declaration) ? types.storage(declaration) : undefined;
    }
    return facts.values.has(node) ? types.value(node) : undefined;
  }

  function isValueDeclaration(node: Node): boolean {
    return ast.is.IsVariableDeclaration(node) || ast.is.IsParameterDeclaration(node) || ast.is.IsBindingElement(node) ||
      ast.is.IsPropertyDeclaration(node) || ast.is.IsPropertySignatureDeclaration(node);
  }

  function isCallableBody(node: Node): boolean {
    return (ast.is.IsFunctionDeclaration(node) || ast.is.IsFunctionExpression(node) || ast.is.IsArrowFunction(node) ||
      ast.is.IsMethodDeclaration(node) || ast.is.IsGetAccessorDeclaration(node)) && ast.body(node) !== undefined;
  }

  function visit(node: Node, sourceFile: SourceFile, typeOnly = false): void {
    if (!typeOnly && facts.navigation.scopes.unreachable(node)) return;
    if (ast.is.IsVariableDeclaration(node)) {
      const alias = policy.callOnlyAlias(node);
      if (alias !== undefined) {
        for (const declaration of alias.declarations) compileTimeMetadata.add(declaration);
        return;
      }
    }
    pointerBacking.record(node);
    const declaration = core.memoryMetadata.declaration(node);
    if (declaration !== undefined || core.memoryMetadata.isCompileTimeExpression(node)) {
      compileTimeMetadata.add(node);
      for (const issue of declaration?.issues ?? []) memoryMetadataIssues.push(Object.freeze({
        node: issue.node, code: "CSHARP_MEMORY_METADATA_RUNTIME_ESCAPE", message: issue.reason,
      }));
      return;
    }
    if (node === sourceFile || ast.is.IsImportDeclaration(node) || ast.is.IsImportClause(node) || ast.kindName(node) === "KindEndOfFile") {
      ast.forEachChild(node, child => {
        if (child !== undefined) visit(child, sourceFile, typeOnly || ast.is.IsImportDeclaration(node) || ast.is.IsImportClause(node));
      });
      return;
    }
    if (ast.is.IsBindingElement(node)) {
      const projection = types.resolveBindingProjection(node);
      if (projection !== undefined) {
        recordTargetType(projection.storageCarrier);
        bindingProjections.set(node, projection);
      }
    }
    typeOnly ||= ast.is.IsTypeAliasDeclaration(node) || ast.is.IsInterfaceDeclaration(node) || ast.is.IsExportDeclaration(node);
    if (!typeOnly) {
      const members = ast.is.IsObjectLiteralExpression(node) ? ast.properties(node)
        : ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node) ? ast.members(node) : [];
      for (const member of members) {
        if (member === undefined || sourceClassFieldIsTypeOnly(ast, member)) continue;
        const name = ast.name(member);
        if (name !== undefined) requirePropertyName(name, node);
      }
      const argument = ast.is.IsElementAccessExpression(node) ? ast.as.AsElementAccessExpression(node)?.ArgumentExpression
        : ast.is.IsBindingElement(node) ? ast.as.AsBindingElement(node)?.PropertyName : undefined;
      if (argument !== undefined) requirePropertyName(argument, node);
      const authoredType = ast.is.IsTypeReferenceNode(node) ? node : ast.typeNode(node);
      if (authoredType !== undefined) requireAuthoredMemberNames(node, authoredType);
    }
    arguments_.set(node, freezeSourceArgumentClassification(selectCsharpSourceArgument(sourceFacts, node)));
    const defaultValue = readCsharpSourceDefaultValue(sourceFacts, node);
    if (defaultValue !== undefined) defaultValues.set(node, defaultValue);
    const sourceField = readCsharpSourceField(sourceFacts, [node]);
    if (sourceField !== undefined) sourceFields.set(node, sourceField);
    const sourceStruct = readCsharpSourceStruct(sourceFacts, node);
    if (sourceStruct !== undefined) sourceStructs.set(node, sourceStruct);
    if (sourceFacts.getFact(node as ExtensionFactSubject, providerVirtualDeclarationFactKey) !== undefined) providerVirtualDeclarations.add(node);

    const value = hostValue(node);
    const nodeTargetType = value === undefined ? undefined : represented(types.value(node), node, typeOnly, true);
    if (nodeTargetType !== undefined) nodeTargetTypes.set(node, nodeTargetType);
    if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) {
      const constructorType = recordTargetType(selectCsharpClassFactoryType(ast, policy.projectTypes.catalog, nodeTargetType));
      if (constructorType !== undefined) classConstructorTypes.set(node, constructorType);
    }
    sourceOwnedProjectShapes.set(node, !isCsharpJsValueTargetType(nodeTargetType) &&
      (isTypeParameterTargetRef(nodeTargetType) || facts.navigation.identity.isProjectShape(node)));
    const storage = storageOf(node);
    const storageTargetType = storage === undefined ? undefined : represented(storage, node, typeOnly);
    if (storageTargetType !== undefined) storageTargetTypes.set(node, storageTargetType);
    const readStorageTargetType = value === undefined || isValueDeclaration(node) ? undefined
      : represented(types.readStorage(node), node, typeOnly);
    if (readStorageTargetType !== undefined) readStorageTargetTypes.set(node, readStorageTargetType);

    // A refused destination is a Host refusal, forwarded with facts.refusals() before C# analysis; no C# carrier (R5).
    const contextualOutcome = value === undefined ? undefined : facts.values.contextual(node);
    const contextual = contextualOutcome === undefined || contextualOutcome.kind === "refused" ? undefined : contextualOutcome.type;
    if (contextual !== undefined) contextualTypes.set(node, Object.freeze({ type: contextual,
      targetType: represented(types.represent(contextual, node, "storage"), node, typeOnly) }));
    if (ast.is.IsEnumMember(node)) {
      const constant = facts.analyses.enumConstant(node);
      if (constant === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An enum member requires its Host constant selection.", node);
      if (constant.kind === "resolved") {
        constants.set(node, Object.freeze({ value: constant.value }));
        const initializer = ast.as.AsEnumMember(node)?.Initializer;
        if (initializer !== undefined) compileTimeMetadata.add(initializer);
      }
    }
    if (value !== undefined && isCsharpFlowReadEvidenceNode(ast, node)) {
      refinements.set(node, valueRefinement(node, value, nodeTargetType, readStorageTargetType));
    }

    const generator = facts.selections.generator(node);
    if (generator !== undefined) {
      generators.set(node, generator);
      const carrier = represented(types.callableReturn(node), node, typeOnly);
      if (carrier !== undefined) generatorTargetTypes.set(node, carrier);
    }
    const yielded = ast.is.IsYieldExpression(node) ? facts.selections.yield(node) : undefined;
    if (ast.is.IsYieldExpression(node) && yielded === undefined) {
      failTargetAnalysisInvariant("tsonic-csharp", "A yield expression requires its Host yield selection.", node);
    }
    // A refused yield (delegation) is a Host refusal, forwarded before C# analysis; it records no yield evidence.
    if (yielded !== undefined && yielded.kind !== "refused") {
      const enclosing = facts.selections.generator(yielded.generator);
      if (enclosing === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A yield expression requires its generator's Host generator selection.", node);
      yields.set(node, yielded);
      const carrier = represented(yielded.operand === undefined ? types.represent(enclosing.yieldType, node, "value")
        : types.value(yielded.operand), node, typeOnly);
      if (carrier !== undefined) yieldTargetTypes.set(node, carrier);
    }
    const wellKnownSymbol = facts.selections.wellKnownSymbol(node);
    if (wellKnownSymbol !== undefined) wellKnownSymbols.set(node, csharpWellKnownSymbolKind(wellKnownSymbol));
    if (ast.is.IsArrayLiteralExpression(node)) contextualTuples.set(node, contextualTuple(node, contextual, typeOnly));
    if (isCallableBody(node)) {
      const pointerReturn = types.resolvePointerReturn(node);
      if (pointerReturn !== undefined) pointerReturns.set(node, pointerReturn);
      const outcome = facts.values.callableReturn(node);
      // .NET rule (R3 #29): the return carrier is the PHYSICAL pointer-return carrier when the native storage analysis
      // proved one (pointer-return.ts: every return produces pointer storage of one exact native pointee, so the C#
      // method returns that Location<P>), as a physical read replaces a logical carrier (physical-reads.ts). Every other
      // callable returns the represented Host result. A refused Host result is forwarded before C# analysis.
      const inferred = pointerReturn?.type ?? (outcome.kind === "refused" ? undefined
        : represented(types.represent(outcome.type, node, "return"), node, typeOnly));
      if (inferred !== undefined) inferredReturns.set(node, recordTargetType(inferred)!);
    }
    if (ast.is.IsTypeParameterDeclaration(node)) {
      const parameter = csharpSourceTypeParameter(node, ast, facts.navigation.identity);
      if (parameter !== undefined) typeParameterConstraints.set(node, types.typeParameterConstraints(node, parameter));
    }
    ast.forEachChild(node, child => {
      if (child !== undefined) visit(child, sourceFile, typeOnly);
    });
  }

  /**
   * A flow read: the Host publishes the narrowed read type at the occurrence (relations narrowed-read), so the
   * selected carrier is the occurrence's own representation; `exact` when it equals the principal slot type.
   * The principal is the Host navigation target of the read (its storage declaration) and nothing else (R3 #11, C6-D5:
   * never the solved group or an association component). A read with no storage declaration reads its own storage, so
   * it is exact unless the Host publishes a narrowing relation at it (narrowed-read map or extract-arm). Pending Host
   * request R-FXCR-11: publish the principal and exactness at the read.
   */
  function valueRefinement(node: Node, value: SourceTypeDescriptor, selectedTargetType: TargetTypeRef | undefined,
    readStorageTargetType: TargetTypeRef | undefined): CsharpValueRefinementClassification {
    const relation = facts.relations.at(node);
    const narrowed = relation !== undefined && (relation.kind === "extract-arm" ||
      relation.kind === "map" && relation.mode === "narrowed-read");
    const principalNode = csharpFlowReadPrincipalDeclaration(ast, facts.navigation.identity, node);
    const principal = principalNode === undefined || !facts.values.has(principalNode) ? undefined : facts.values.type(principalNode);
    const exact = principalNode === undefined ? !narrowed
      : principal !== undefined && principal.kind !== "refused" && sourceTypeDescriptorsEqual(value, principal.type);
    const flowReadTargetType = recordTargetType(selectCsharpFlowReadCarrier({
      exactSourceRead: exact,
      nativeSourceRead: narrowed,
      unrelatedSourceTypesShareTargetRepresentation: selectedTargetType !== undefined && readStorageTargetType !== undefined &&
        targetTypeRefEquals(selectedTargetType, readStorageTargetType),
      selectedTargetType,
      readStorageTargetType,
    }));
    return Object.freeze({
      kind: "resolved",
      exact,
      ...(selectedTargetType === undefined ? {} : { selectedTargetType }),
      ...(flowReadTargetType === undefined ? {} : { flowReadTargetType }),
    });
  }

  /** The Host contextual tuple of an array literal: element carriers, optional and omitted optional positions. */
  function contextualTuple(node: Node, contextual: SourceTypeDescriptor | undefined, typeOnly: boolean): CsharpContextualTupleClassification {
    const tuple = contextual?.kind === "optional" ? contextual.value : contextual;
    if (tuple?.kind !== "tuple") return Object.freeze({ kind: "unavailable" });
    const count = ast.elements(node).length;
    return Object.freeze({
      kind: "selected",
      elementTypes: Object.freeze(tuple.elements.map(element =>
        represented(types.represent(element.type, node, "storage"), node, typeOnly))),
      optionalElementIndexes: Object.freeze(tuple.elements.flatMap((element, index) => element.kind === "optional" ? [index] : [])),
      omittedOptionalElementIndexes: Object.freeze(tuple.elements.flatMap((element, index) =>
        element.kind === "optional" && index >= count ? [index] : [])),
    });
  }

  const pointerBackingRecords = pointerBacking.seal();
  const index: CsharpSourceEvidenceIndex = {
    bindingProjection: Object.freeze({ get: (node: Node) => bindingProjections.get(node) }),
    pointerBackingUses: pointerBackingRecords.uses,
    memoryMetadataIssues: Object.freeze([...memoryMetadataIssues, ...pointerBackingRecords.issues.map(issue => ({
      node: issue.node, code: "CSHARP_POINTER_BACKING_NOT_PROVEN", message: issue.reason,
    }))]),
    fixedArrayIssues: Object.freeze(fixedArrayIssues),
    compileTimeMetadata: Object.freeze({ get: (node: Node) => compileTimeMetadata.has(node) }),
    classConstructorType: Object.freeze({ get: (node: Node) => classConstructorTypes.get(node) }),
    targetTypes: Object.freeze([...targetTypes.values()]),
    nodeTargetType: Object.freeze({ get: (node: Node) => nodeTargetTypes.get(node) }),
    storageTargetType: Object.freeze({ get: (node: Node) => storageTargetTypes.get(node) }),
    readStorageTargetType: Object.freeze({ get: (node: Node) => readStorageTargetTypes.get(node) }),
    contextualType: Object.freeze({ get: (node: Node) => contextualTypes.get(node) }),
    contextualTuple: Object.freeze({ get: (node: Node) => contextualTuples.get(node) }),
    constantValue: Object.freeze({ get: (node: Node) => constants.get(node) }),
    valueRefinement: Object.freeze({ get: (node: Node) => refinements.get(node) }),
    generator: Object.freeze({ get: (node: Node) => generators.get(node) }),
    generatorTargetType: Object.freeze({ get: (node: Node) => generatorTargetTypes.get(node) }),
    yield: Object.freeze({ get: (node: Node) => yields.get(node) }),
    yieldTargetType: Object.freeze({ get: (node: Node) => yieldTargetTypes.get(node) }),
    wellKnownSymbol: Object.freeze({ get: (node: Node) => wellKnownSymbols.get(node) }),
    inferredCallableReturnType: Object.freeze({ get: (node: Node) => inferredReturns.get(node) }),
    pointerReturn: Object.freeze({ get: (node: Node) => pointerReturns.get(node) }),
    sourceArgument: Object.freeze({ get: (node: Node) => arguments_.get(node) }),
    sourceDefaultValue: Object.freeze({ get: (node: Node) => defaultValues.get(node) }),
    sourceField: Object.freeze({ get(subjects: readonly (Node | undefined)[]) {
      for (const subject of subjects) {
        if (subject === undefined) continue;
        const field = sourceFields.get(subject);
        if (field !== undefined) return field;
      }
      return undefined;
    } }),
    sourceStruct: Object.freeze({ get: (node: Node) => sourceStructs.get(node) }),
    providerVirtualDeclaration: Object.freeze({ get: (node: Node) => providerVirtualDeclarations.has(node) }),
    typeParameterConstraints: Object.freeze({ get: (node: Node) => typeParameterConstraints.get(node) }),
    sourceOwnedProjectShape: Object.freeze({ get: (node: Node) => sourceOwnedProjectShapes.get(node) }),
  };
  return Object.freeze({
    index: Object.freeze(index),
    nativeExpressionIssues: Object.freeze([...nativeExpressionIssues].map(([sourceNode, issue]) =>
      Object.freeze({ ...issue.diagnostic, sourceNode, requiredBy: Object.freeze([...issue.requiredBy]) }))),
    inspectClosedArrayStorage: core.closedArrayStorage,
    eraseCompileTimeDeclaration(declaration: Node): void {
      if (!compileTimeDeclarationsOpen) failTargetAnalysisInvariant("tsonic-csharp",
        "Compile-time declaration selection cannot change after native admission is sealed.", declaration);
      compileTimeMetadata.add(declaration);
    },
    sealCompileTimeDeclarations(): void {
      if (!compileTimeDeclarationsOpen) failTargetAnalysisInvariant("tsonic-csharp",
        "Compile-time declaration selection must be sealed exactly once.");
      compileTimeDeclarationsOpen = false;
    },
  });
}
