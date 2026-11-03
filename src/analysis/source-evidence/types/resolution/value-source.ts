import type { Node, SourceFile, Type } from "@tsonic/tsts";
import { sourceIntegerInduction, type SourceFileSemantics, type SourceTypeRelationship } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTargetNamedTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { reconcileCsharpSelectedTargetType, retainCsharpBroadValueCarrier } from "../../../../policy/types/resolution/selected-type-evidence.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
import { formAuthoredAndSelectedSourceType, resolveFormedAuthoredAndSelectedSourceType,
  type CsharpAuthoredTypeSelectionEvidence } from "./selected-values.js";
import { formCsharpNativeParameterSource, resolveFormedCsharpNativeParameterCarrier,
  type CsharpNativeParameterSource } from "./native-parameter-source.js";
import { formCsharpContextualParameterSourceFromSyntax, resolveFormedCsharpContextualParameterCarrier,
  type CsharpContextualParameterSource } from "./contextual-parameter-source.js";
import { formCsharpDirectSourceEvidence, resolveFormedCsharpDirectSourceFacts,
  type CsharpDirectSourceEvidence } from "./direct-source-evidence.js";
import { formCsharpSelectedExpressionSource, type CsharpSelectedExpressionSource } from "./expression-source.js";
import { resolveFormedCsharpSelectedExpressionResult } from "./expressions.js";
import { formCsharpPrimitivePreservationSource, completeCsharpPrimitivePreservation,
  type CsharpPrimitivePreservationSource } from "./primitive-preservation-source.js";
import { formCsharpAuthoredUnionRefinement, completeCsharpAuthoredUnionRefinement,
  type CsharpAuthoredUnionRefinementEvidence } from "./source-union-refinement.js";
import { resolveCsharpUnionMemberCarrier } from "./source-evidence.js";

export interface CsharpSourceValueDeclarationSource {
  readonly node: Node;
  readonly reference: ReturnType<CsharpTypeResolutionScope["host"]["navigation"]["referenceFor"]>;
  readonly declaration: Node | undefined;
}

interface CsharpValueRefinementSource {
  readonly declared: Type;
  readonly selected: Type;
  readonly refinement: ReturnType<SourceFileSemantics["types"]["refinement"]> | undefined;
  readonly union: CsharpAuthoredUnionRefinementEvidence;
  readonly relationship: SourceTypeRelationship;
  readonly nonPrimitive: boolean;
  readonly enumNumeric: boolean;
  readonly enumAbsence: boolean;
  readonly nonNullMembers: boolean;
}

interface CsharpValueTypeRequest {
  readonly type: Type | undefined;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
}

type CsharpValueTailSource =
  | { readonly kind: "uninitialized"; readonly contextual: CsharpContextualParameterSource;
      readonly refinement: CsharpValueRefinementSource | undefined }
  | ({ readonly kind: "initialized"; readonly initializer: Node;
      readonly mutable: boolean; readonly declarationKind: ReturnType<CsharpTypeResolutionScope["host"]["ast"]["variableDeclarationKind"]>;
      readonly widening: boolean; readonly preservation: CsharpPrimitivePreservationSource | undefined;
      readonly nodeState: CsharpTypeResolutionState; readonly refinement: CsharpValueRefinementSource | undefined } & (
      | { readonly array: true; readonly direct: undefined; readonly expression: undefined }
      | { readonly array: false; readonly direct: CsharpDirectSourceEvidence; readonly expression: CsharpSelectedExpressionSource }
    ));

type CsharpValueBodySource =
  | { readonly kind: "unavailable"; readonly sourceFile: SourceFile; readonly error: unknown }
  | { readonly kind: "available"; readonly queries: SourceFileSemantics; readonly induction: ReturnType<typeof sourceIntegerInduction>;
      readonly inductionState: CsharpTypeResolutionState; readonly declared: CsharpValueTypeRequest;
      readonly selected: CsharpValueTypeRequest; readonly nonPrimitive: boolean; readonly tail: CsharpValueTailSource };

export type CsharpSourceValueSource = {
  readonly selection: CsharpSourceValueDeclarationSource;
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly selectedType: Type | undefined;
} & (
  | { readonly kind: "missing" }
  | { readonly kind: "binding" | "value"; readonly declaration: Node; readonly sourceFile: SourceFile;
      readonly syntax: ReturnType<CsharpTypeResolutionScope["sourceValueDeclarationSyntax"]>;
      readonly selectedSourceType: Type | undefined;
      readonly authored: CsharpAuthoredTypeSelectionEvidence | undefined; readonly nativeParameter: CsharpNativeParameterSource;
      readonly body: CsharpValueBodySource | undefined }
);

type ValueSourceScope = Pick<CsharpTypeResolutionScope,
  "host" | "sourceValueDeclaration" | "sourceValueDeclarationSyntax" | "sourceCallSelectedDeclaration">;

function declarationQueries(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  sourceFile: SourceFile,
): { readonly kind: "available"; readonly queries: SourceFileSemantics } | Extract<CsharpValueBodySource, { readonly kind: "unavailable" }> {
  if (host.hasSemantics(sourceFile)) return Object.freeze({ kind: "available", queries: host.semantics(sourceFile) });
  try {
    return Object.freeze({ kind: "available", queries: host.semantics(sourceFile) });
  } catch (error: unknown) {
    return Object.freeze({ kind: "unavailable", sourceFile, error });
  }
}

export function formCsharpSourceValueDeclarationSource(
  scope: Pick<CsharpTypeResolutionScope, "host" | "sourceValueDeclaration">,
  node: Node,
): CsharpSourceValueDeclarationSource {
  const reference = scope.host.navigation.referenceFor(node);
  return Object.freeze({ node, reference, declaration: scope.sourceValueDeclaration(node, reference?.declaration) });
}

function formRefinement(
  declared: Type | undefined,
  selected: Type | undefined,
  queries: SourceFileSemantics,
  value: boolean,
  enumCandidate: boolean,
): CsharpValueRefinementSource | undefined {
  if (declared === undefined || selected === undefined) return undefined;
  const refinement = value ? queries.types.refinement(declared, selected) : undefined;
  const members = enumCandidate && refinement?.kind === "unrelated"
    ? queries.types.isUnion(selected) ? queries.types.unionOrIntersectionTypes(selected) : [selected] : [];
  const enumNumeric = members.length > 0 && members.every(member => queries.types.isNullish(member) || queries.types.isNumberLike(member));
  return Object.freeze({ declared, selected, refinement, union: formCsharpAuthoredUnionRefinement(declared, selected, queries),
    relationship: queries.types.relationship(declared, selected), nonPrimitive: queries.types.isNonPrimitive(selected),
    enumNumeric, enumAbsence: enumNumeric && members.some(member => queries.types.isNullish(member)),
    nonNullMembers: refinement?.kind === "members" && refinement.types.length > 0 &&
      refinement.types.every(member => !queries.types.isNullish(member)) });
}

export function formCsharpSourceValueSource(
  scope: ValueSourceScope,
  selection: CsharpSourceValueDeclarationSource,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  selectedType: Type | undefined,
): CsharpSourceValueSource {
  const { host } = scope;
  if (selection.node === undefined || !Object.hasOwn(selection, "reference") || !Object.hasOwn(selection, "declaration")) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Value Source formation requires its retained declaration selection.", selection.node);
  }
  const { node, declaration } = selection;
  const input = { selection, node, queries, state, selectedType };
  if (declaration === undefined) return Object.freeze({ ...input, kind: "missing" });
  const sourceFile = host.ast.getSourceFile(declaration) ?? queries.sourceFile;
  const syntax = scope.sourceValueDeclarationSyntax(declaration);
  const binding = host.ast.is.IsBindingElement(declaration);
  const selectedSource = binding && syntax.type === undefined ? undefined : selectedType ?? queries.types.expressionType(node);
  const authored = syntax.type === undefined ? undefined : formAuthoredAndSelectedSourceType(scope,
    syntax.type, sourceFile, selectedSource, queries.sourceFile, state);
  const nativeParameter = formCsharpNativeParameterSource(host.ast, declaration);
  if (binding) return Object.freeze({ ...input, kind: "binding",
    declaration, sourceFile, syntax, authored, nativeParameter, selectedSourceType: selectedSource, body: undefined });
  const checker = declarationQueries(scope, sourceFile);
  if (checker.kind === "unavailable") return Object.freeze({ ...input, kind: "value", declaration, sourceFile, syntax, authored,
    nativeParameter, selectedSourceType: selectedSource, body: checker });
  const declaredQueries = checker.queries;
  const induction = sourceIntegerInduction(declaration, host.ast, host.navigation, {
    sourceFacts: host.sourceFacts, semanticsFor: host.semanticsFor,
  });
  const declaredSource = declaredQueries.declarations.declaredValueType(declaration);
  const declared = Object.freeze({ type: declaredSource, sourceFile, state: Object.freeze(nextState(state)) });
  const selected = Object.freeze({ type: selectedSource, sourceFile: queries.sourceFile, state: Object.freeze(nextState(state)) });
  let tail: CsharpValueTailSource;
  if (syntax.initializer === undefined) {
    tail = Object.freeze({ kind: "uninitialized", contextual: formCsharpContextualParameterSourceFromSyntax(scope, declaration, declaredQueries, syntax),
      refinement: formRefinement(declaredSource, selectedSource, queries, false, false) });
  } else {
    const initializer = syntax.initializer;
    const array = host.ast.is.IsArrayLiteralExpression(initializer);
    const declarationKind = host.ast.variableDeclarationKind(declaration);
    const mutable = syntax.type === undefined && host.ast.is.IsVariableDeclaration(declaration) &&
      (declarationKind === "let" || declarationKind === "var");
    const initializerType = mutable ? declaredQueries.types.expressionType(initializer) : undefined;
    const literalBase = initializerType === undefined ? undefined : declaredQueries.types.literalBaseType(initializerType);
    const widening = declaredSource !== undefined && initializerType !== undefined && literalBase !== undefined &&
      !declaredQueries.types.isIdentical(initializerType, literalBase) && declaredQueries.types.isIdentical(declaredSource, literalBase);
    const children = array ? { array: true as const, direct: undefined, expression: undefined }
      : { array: false as const,
          direct: formCsharpDirectSourceEvidence(scope, Object.freeze([initializer]), sourceFile, Object.freeze(nextState(state))),
          expression: formCsharpSelectedExpressionSource(scope, initializer, declaredQueries, Object.freeze(nextState(state))) };
    tail = Object.freeze({ kind: "initialized", initializer, ...children, mutable, declarationKind, widening,
      preservation: !mutable || !widening ? undefined : formCsharpPrimitivePreservationSource(scope, initializer, declaredQueries),
      nodeState: Object.freeze(nextState(state)), refinement: node === declaration ? undefined
        : formRefinement(queries.declarations.declaredValueType(declaration), selectedSource, queries, true, syntax.type === undefined) });
  }
  return Object.freeze({ ...input, kind: "value", declaration, sourceFile, syntax, authored, nativeParameter, selectedSourceType: selectedSource,
    body: Object.freeze({ kind: "available", queries: declaredQueries, induction, inductionState: Object.freeze(nextState(state)),
      declared, selected, nonPrimitive: selectedSource !== undefined && queries.types.isNonPrimitive(selectedSource), tail }) });
}

export function resolveFormedCsharpSourceValueResult(
  scope: CsharpTypeResolutionScope,
  source: CsharpSourceValueSource,
): CsharpSourceCallResult | undefined {
  if (source.selection === undefined || source.node !== source.selection.node ||
      (source.kind === "missing") !== (source.selection.declaration === undefined) ||
      source.kind !== "missing" && (source.declaration !== source.selection.declaration || source.nativeParameter?.parameter !== source.declaration)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Value completion requires its exact retained Source declaration.", source.node);
  }
  if (source.kind === "missing") return undefined;
  const { declaration, sourceFile, state, queries } = source;
  const authored = source.authored;
  if ((source.syntax.type === undefined) !== (authored === undefined) || source.kind === "binding" && source.body !== undefined) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Value completion requires its exact retained authored input.", declaration);
  }
  if (source.kind === "value") {
    const body = source.body;
    if (body === undefined || body.kind !== "available" && body.kind !== "unavailable" ||
        body.kind === "unavailable" && body.sourceFile !== sourceFile || body.kind === "available" &&
        (body.queries.sourceFile !== sourceFile || body.declared.sourceFile !== sourceFile ||
          body.selected.sourceFile !== queries.sourceFile || body.selected.type !== source.selectedSourceType)) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Value completion requires its exact retained declaration children.", declaration);
    }
    if (body.kind === "available") {
      const tail = body.tail;
      if (tail.kind === "uninitialized" ? source.syntax.initializer !== undefined || tail.contextual.declaration !== declaration ||
          tail.contextual.queries !== body.queries
        : tail.initializer !== source.syntax.initializer || !tail.array && (tail.expression?.node !== tail.initializer ||
          tail.expression?.queries !== body.queries || tail.direct?.subjects[0] !== tail.initializer) ||
          tail.mutable && tail.widening && tail.preservation === undefined || tail.preservation !== undefined &&
          (tail.preservation.node !== tail.initializer || tail.preservation.queries !== body.queries)) {
        return failTargetAnalysisInvariant("tsonic-csharp", "Value completion requires its exact retained initializer or contextual Source.", declaration);
      }
    }
  }
  if (authored !== undefined) {
    if (authored.authoredTypeNode !== source.syntax.type || authored.authoredSourceFile !== sourceFile || authored.inputState !== state ||
        authored.selectedSourceFile !== queries.sourceFile || authored.selectedType !== source.selectedSourceType) return failTargetAnalysisInvariant("tsonic-csharp",
      "Value completion requires its exact retained authored input.", declaration);
    const resolved = resolveFormedAuthoredAndSelectedSourceType(scope, authored);
    if (resolved !== undefined) return csharpSourceValueResult(resolveFormedCsharpNativeParameterCarrier(scope, source.nativeParameter, resolved, state));
  }
  if (source.kind === "binding") return csharpSourceValueResult(scope.host.bindingProjection(declaration, sourceFile)?.bindingCarrier);
  const body = source.body;
  if (body === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "Value completion requires its exact retained declaration children.", declaration);
  if (body.kind === "unavailable") throw body.error;
  if (body.induction !== undefined) {
    const bound = scope.resolveNodeWithState(body.induction.bound, sourceFile, body.inductionState);
    if (bound?.kind === "source-primitive" &&
      ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "int128", "uint128", "native-int", "native-uint"].includes(bound.name)) {
      return csharpSourceValueResult(bound);
    }
  }
  const declaredTarget = scope.resolveTypeWithState(body.declared.type, body.declared.sourceFile, body.declared.state);
  const tail = body.tail;
  if (tail.kind === "uninitialized") {
    const selected = scope.resolveTypeWithState(body.selected.type, body.selected.sourceFile, body.selected.state);
    const contextual = resolveFormedCsharpContextualParameterCarrier(scope, tail.contextual, state);
    if (contextual.kind === "unresolved") return undefined;
    if (contextual.kind === "resolved") {
      const native = resolveFormedCsharpNativeParameterCarrier(scope, source.nativeParameter, contextual.type, state);
      if (native === undefined) return undefined;
      const refinement = tail.refinement;
      if (refinement === undefined) return csharpSourceValueResult(native);
      const selectedUnion = completeCsharpAuthoredUnionRefinement(native, refinement.union,
        type => resolveCsharpUnionMemberCarrier(scope, native, type, queries, state),
        scope.host.structuralTypes.resolveTarget, scope.host.typeDefinitions);
      if (selectedUnion.kind !== "not-applicable") return selectedUnion.kind === "resolved" ? csharpSourceValueResult(selectedUnion.type) : undefined;
      if (native.kind === "source-primitive") return csharpSourceValueResult(native);
      return csharpSourceValueResult(reconcileCsharpSelectedTargetType(native, selected, refinement.relationship, refinement.nonPrimitive));
    }
    return csharpSourceValueResult(resolveFormedCsharpNativeParameterCarrier(scope, source.nativeParameter,
      retainCsharpBroadValueCarrier(declaredTarget, selected, body.nonPrimitive) ?? selected ?? declaredTarget, state));
  }
  const widened = tail.mutable && declaredTarget !== undefined && body.declared.type !== undefined && tail.widening && tail.preservation !== undefined &&
    completeCsharpPrimitivePreservation(scope, tail.preservation, declaredTarget);
  const declaredCallable = tail.mutable && getCsharpCallableValueSignature(getCsharpNullableElementTargetType(declaredTarget) ?? declaredTarget) !== undefined;
  const initializer = tail.array ? scope.resolveNodeValueWithState(tail.initializer, sourceFile, tail.nodeState)
    : widened ? csharpSourceValueResult(declaredTarget)
    : csharpSourceValueResult(resolveFormedCsharpDirectSourceFacts(scope, tail.direct)) ??
      resolveFormedCsharpSelectedExpressionResult(scope, tail.expression) ??
      (declaredTarget !== undefined && (declaredCallable || !tail.mutable && tail.declarationKind !== "const")
        ? csharpSourceValueResult(declaredTarget) : scope.resolveNodeValueWithState(tail.initializer, sourceFile, tail.nodeState));
  const initializerTarget = initializer?.selectedType;
  if (initializerTarget === undefined) return tail.array ? undefined : csharpSourceValueResult(declaredTarget);
  if (source.node === declaration || tail.refinement === undefined) return initializer;
  const refinement = tail.refinement;
  if (refinement.refinement === undefined || refinement.selected !== body.selected.type) return failTargetAnalysisInvariant("tsonic-csharp",
    "Value completion requires its exact retained selected refinement.", declaration);
  const selectedUnion = completeCsharpAuthoredUnionRefinement(initializerTarget, refinement.union,
    type => resolveCsharpUnionMemberCarrier(scope, initializerTarget, type, queries, state),
    scope.host.structuralTypes.resolveTarget, scope.host.typeDefinitions);
  if (selectedUnion.kind !== "not-applicable") return selectedUnion.kind === "resolved"
    ? refineCsharpSourceValueResult(initializer, selectedUnion.type) : undefined;
  if (refinement.refinement.kind === "ambiguous") return undefined;
  if (refinement.refinement.kind === "unrelated") {
    const present = getCsharpNullableElementTargetType(initializerTarget) ?? initializerTarget;
    if (source.syntax.type === undefined && present.kind === "target-named" &&
      (present as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "enum" && refinement.enumNumeric) {
      return refineCsharpSourceValueResult(initializer, refinement.enumAbsence ? initializerTarget : present);
    }
    return refineCsharpSourceValueResult(initializer, reconcileCsharpSelectedTargetType(initializerTarget,
      scope.resolveTypeWithState(body.selected.type, body.selected.sourceFile, body.selected.state), refinement.relationship, refinement.nonPrimitive));
  }
  return refinement.nonNullMembers ? refineCsharpSourceValueResult(initializer, getCsharpNullableElementTargetType(initializerTarget) ?? initializerTarget)
    : initializer;
}
