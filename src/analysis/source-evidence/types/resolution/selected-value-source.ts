import type { Node, SourceFile, Type } from "@tsonic/tsts";
import { Node_Expression, sourceAbsenceUse, type SourceFileSemantics, type SourceTypeRelationship } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { combineCsharpTargetUnionMembers, csharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpUnionLeaves } from "../../../../target-model/types/union-relations.js";
import { reconcileCsharpSelectedTargetType } from "../../../../policy/types/resolution/selected-type-evidence.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
import { formCsharpSourceValueSource, type CsharpSourceValueDeclarationSource, type CsharpSourceValueSource } from "./value-source.js";
import { completeCsharpAuthoredUnionRefinement, formCsharpAuthoredUnionRefinement,
  formCsharpAuthoredUnionRefinementFromChecked, retainCsharpUnionObjectShapes,
  type CsharpAuthoredUnionRefinementEvidence } from "./source-union-refinement.js";
import { resolveCsharpUnionMemberCarrier } from "./source-evidence.js";
import { selectCsharpNativeFlowMembers } from "./native-flow-refinement.js";
import { resolveCsharpInstanceType } from "./instance-tests.js";

export interface CsharpSelectedValueSource {
  readonly kind: "selected-value";
  readonly selection: CsharpSourceValueDeclarationSource;
  readonly node: Node;
  readonly selectedType: Type;
  readonly queries: SourceFileSemantics;
  readonly sourceFile: SourceFile;
  readonly storage: ReturnType<CsharpTypeResolutionScope["host"]["sourceStorage"]["subjectFor"]>;
  readonly inputState: CsharpTypeResolutionState;
  readonly state: CsharpTypeResolutionState;
  readonly valueState: CsharpTypeResolutionState;
  readonly value: CsharpSourceValueSource;
  readonly binding: boolean;
  readonly member: boolean;
  readonly absenceUse: ReturnType<typeof sourceAbsenceUse>;
  readonly declared: {
    readonly type: Type;
    readonly union: boolean;
    readonly apparentSelected: boolean;
    readonly refinement: ReturnType<SourceFileSemantics["types"]["refinement"]>;
    readonly authored: CsharpAuthoredUnionRefinementEvidence;
    readonly relationship: SourceTypeRelationship;
    readonly selectedNonPrimitive: boolean;
    readonly bindingPresent: boolean;
    readonly nominal: {
      readonly symbol: ReturnType<SourceFileSemantics["declarations"]["typeSymbol"]>;
      readonly declarations: readonly Node[];
      readonly projectClass: boolean;
    } | undefined;
  } | undefined;
  readonly expression: {
    readonly type: Type;
    readonly refinement: CsharpAuthoredUnionRefinementEvidence;
  } | undefined;
}

export function formCsharpSelectedValueSource(
  scope: Pick<CsharpTypeResolutionScope,
    "host" | "sourceValueDeclaration" | "sourceValueDeclarationSyntax" | "sourceCallSelectedDeclaration">,
  selection: CsharpSourceValueDeclarationSource,
  selectedType: Type,
  queries: SourceFileSemantics,
  inputState: CsharpTypeResolutionState,
): CsharpSelectedValueSource {
  const { host } = scope;
  if (selection.node === undefined || !Object.prototype.hasOwnProperty.call(selection, "reference") ||
      !Object.prototype.hasOwnProperty.call(selection, "declaration")) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A selected value requires its retained declaration selection before source observations.", selection.node);
  }
  const { node, declaration } = selection;
  const storage = host.sourceStorage.subjectFor(node);
  const state = { ...inputState, sourceStorageSubject: storage.kind === "resolved" ? storage.subject : undefined };
  const valueState = Object.freeze(nextState(state));
  const value = formCsharpSourceValueSource(scope, selection, queries, valueState, selectedType);
  const binding = declaration !== undefined && host.ast.is.IsBindingElement(declaration);
  const member = host.ast.is.IsPropertyAccessExpression(node) || host.ast.is.IsElementAccessExpression(node);
  const declaredType = declaration === undefined ? undefined : queries.declarations.declaredValueType(declaration);
  let declared: CsharpSelectedValueSource["declared"];
  if (declaredType !== undefined) {
    const union = queries.types.isUnion(declaredType);
    const refinement = queries.types.refinement(declaredType, selectedType);
    let bindingPresent = false;
    if (binding && refinement.kind === "exact") {
      let receiver = node;
      let parent = host.ast.parent(receiver);
      while (parent !== undefined && (host.ast.is.IsParenthesizedExpression(parent) || host.ast.is.IsSatisfiesExpression(parent)) &&
        Node_Expression(host.ast, parent) === receiver) {
        receiver = parent;
        parent = host.ast.parent(receiver);
      }
      const members = queries.types.isUnion(selectedType) ? queries.types.unionOrIntersectionTypes(selectedType) : [selectedType];
      bindingPresent = !members.some(candidate => queries.types.isNullish(candidate)) && !host.ast.is.IsTypeOfExpression(parent);
    }
    const symbol = union ? queries.declarations.typeSymbol(selectedType) : undefined;
    const declarations = symbol === undefined ? undefined : queries.declarations.symbolDeclarations(symbol);
    declared = Object.freeze({ type: declaredType, union, refinement,
      authored: formCsharpAuthoredUnionRefinementFromChecked(declaredType, refinement, queries),
      apparentSelected: declaredType !== selectedType && queries.types.apparentType(declaredType) === selectedType,
      relationship: queries.types.relationship(declaredType, selectedType),
      selectedNonPrimitive: queries.types.isNonPrimitive(selectedType), bindingPresent,
      nominal: declarations === undefined ? undefined : Object.freeze({ symbol, declarations,
        projectClass: declarations.some(candidate => host.navigation.isProjectDeclaration(candidate) &&
          (host.ast.is.IsClassDeclaration(candidate) || host.ast.is.IsClassExpression(candidate))) }),
    });
  }
  const expressionType = member || declaration === undefined ? queries.types.expressionType(node) : undefined;
  return Object.freeze({ kind: "selected-value", selection, node, selectedType, queries, sourceFile: queries.sourceFile,
    inputState, state, storage, valueState, value, binding, member, declared, absenceUse: sourceAbsenceUse(node, host),
    expression: expressionType === undefined ? undefined : Object.freeze({ type: expressionType,
      refinement: formCsharpAuthoredUnionRefinement(expressionType, selectedType, queries) }),
  });
}

export function resolveFormedCsharpSelectedValueResult(
  scope: CsharpTypeResolutionScope,
  source: CsharpSelectedValueSource,
): CsharpSourceCallResult | undefined {
  if (source.kind !== "selected-value" || source.node === undefined || source.selection?.node !== source.node ||
    source.value === undefined || source.value.selection !== source.selection || source.value.node !== source.node ||
    source.value.queries !== source.queries || source.value.state !== source.valueState ||
    source.value.selectedType !== source.selectedType || source.queries.sourceFile !== source.sourceFile ||
    source.state.depth !== source.inputState.depth || source.state.sourceBindings !== source.inputState.sourceBindings ||
    source.state.sourceStorageBindings !== source.inputState.sourceStorageBindings ||
    source.state.rejectNativeResolution !== source.inputState.rejectNativeResolution ||
    source.state.sourceStorageSubject !== (source.storage.kind === "resolved" ? source.storage.subject : undefined) ||
    source.valueState.depth !== source.state.depth + 1 || source.valueState.sourceBindings !== source.state.sourceBindings ||
    source.valueState.sourceStorageBindings !== source.state.sourceStorageBindings ||
    source.valueState.sourceStorageSubject !== source.state.sourceStorageSubject ||
    source.valueState.rejectNativeResolution !== source.state.rejectNativeResolution) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A selected value requires its exact retained declaration, checked type and bound Source occurrence.", source.node);
  }
  const { host, resolveNodeWithState, resolveNodeValueWithState, resolveMemberAccessTargetType,
    resolveFormedSourceValueResult, resolveTypeWithState } = scope;
  const { node, selectedType, queries, sourceFile, state, value: valueSource, declared } = source;
  const declaration = source.selection.declaration;
  const scopedTarget = host.representations.scopedTargetType(
    declaration ?? node,
  ) ?? host.representations.scopedTargetType(node) ??
    (source.binding && declaration !== undefined ? host.bindingProjection(declaration, sourceFile)?.bindingCarrier : undefined);
  if (scopedTarget !== undefined && getCsharpNullableElementTargetType(scopedTarget) !== undefined &&
    source.absenceUse !== undefined) return csharpSourceValueResult(scopedTarget);
  if (declared?.union === true) {
    const storage = scopedTarget ?? resolveNodeWithState(declaration, sourceFile, nextState(state));
    const guarded = storage === undefined ? undefined : selectCsharpNativeFlowMembers(host, node, storage,
      guard => {
        const semantics = host.semanticsFor(guard.sourceConstructor);
        return resolveCsharpInstanceType(semantics, guard.sourceConstructor,
          type => resolveTypeWithState(type, semantics.sourceFile, nextState(state)));
      });
    if (guarded !== undefined && guarded.length > 0) {
      if (declared.nominal?.projectClass === true) {
        const nominal = resolveTypeWithState(selectedType, sourceFile, nextState(state));
        if (host.projectTypeCatalog.declarationForTarget(nominal)?.kind === "class") return csharpSourceValueResult(nominal);
      }
      if (storage !== undefined && declared.refinement.kind === "members") {
        const refinement = completeCsharpAuthoredUnionRefinement(
          storage, declared.authored,
          type => resolveCsharpUnionMemberCarrier(scope, storage, type, queries, state),
          host.structuralTypes.resolveTarget, host.typeDefinitions,
        );
        if (refinement.kind === "resolved") {
          const present = getCsharpNullableElementTargetType(refinement.type) ?? refinement.type;
          const checkedMembers = csharpUnionLeaves(present, host.typeDefinitions)?.map(member => member.carrier) ?? [present];
          if (present !== refinement.type) checkedMembers.push(csharpAbsenceTargetType());
          const selected = guarded.filter(member => checkedMembers.some(checked => targetTypeRefEquals(member, checked)));
          return csharpSourceValueResult(retainCsharpUnionObjectShapes(combineCsharpTargetUnionMembers(selected), host.structuralTypes.resolveTarget));
        }
      }
      return csharpSourceValueResult(retainCsharpUnionObjectShapes(combineCsharpTargetUnionMembers(guarded), host.structuralTypes.resolveTarget));
    }
  }
  if (declared?.apparentSelected === true) {
    const storage = scopedTarget ?? resolveNodeWithState(declaration, sourceFile, nextState(state));
    if (storage?.kind === "type-parameter") return csharpSourceValueResult(storage);
  }
  if (scopedTarget !== undefined) {
    if (declared !== undefined) {
      const payload = getCsharpNullableElementTargetType(scopedTarget);
      if (payload !== undefined && source.binding && declared.refinement.kind === "exact" && declared.bindingPresent) {
        return csharpSourceValueResult(payload);
      }
      const refinement = completeCsharpAuthoredUnionRefinement(
        scopedTarget, declared.authored,
        type => resolveCsharpUnionMemberCarrier(scope, scopedTarget, type, queries, state),
        host.structuralTypes.resolveTarget,
        host.typeDefinitions,
      );
      if (refinement.kind !== "not-applicable") {
        return refinement.kind === "resolved" ? csharpSourceValueResult(refinement.type) : undefined;
      }
    }
    if (declared?.refinement.kind === "unrelated") {
      return csharpSourceValueResult(reconcileCsharpSelectedTargetType(
        scopedTarget,
        resolveTypeWithState(selectedType, sourceFile, nextState(state)),
        declared.relationship,
        declared.selectedNonPrimitive,
      ));
    }
    return declaration === undefined ? csharpSourceValueResult(scopedTarget)
      : refineCsharpSourceValueResult(resolveFormedSourceValueResult(valueSource), scopedTarget);
  }
  const member = source.member;
  if (!member && declaration !== undefined) {
    const declaredValue = resolveFormedSourceValueResult(valueSource);
    if (declaredValue !== undefined) return declaredValue;
    return undefined;
  }
  const selected = member
    ? csharpSourceValueResult(resolveMemberAccessTargetType(node, queries, nextState(state), "selected", selectedType))
    : resolveNodeValueWithState(node, sourceFile, nextState(state));
  if (selected?.selectedType !== undefined && source.expression !== undefined) {
    const resolved = selected.selectedType;
    const refinement = completeCsharpAuthoredUnionRefinement(
      resolved, source.expression.refinement,
      type => resolveCsharpUnionMemberCarrier(scope, resolved, type, queries, state),
      host.structuralTypes.resolveTarget, host.typeDefinitions,
    );
    if (refinement.kind !== "not-applicable") return refinement.kind === "resolved"
      ? refineCsharpSourceValueResult(selected, refinement.type) : undefined;
  }
  if (member) return selected;
  return selected ?? csharpSourceValueResult(resolveTypeWithState(selectedType, sourceFile, nextState(state)));
}
