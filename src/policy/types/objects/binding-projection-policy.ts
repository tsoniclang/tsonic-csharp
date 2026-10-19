import type { CsharpBindingProjection } from "../../../target-model/records/binding-projection-policy.js";
import type { CsharpBindingElementProjection, CsharpBindingPatternSource, CsharpTupleDefaultUse, CsharpDefaultValueContract } from "../../../target-model/records/value-projections.js";
import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpBindingDefaultCarrier } from "../../../target-model/types/binding-normalization.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/carriers/collections.js";
import {
  resolveCsharpObjectShapeMemberBySourceContract,
  resolveCsharpObjectShapeMemberBySourceKey,
  csharpObjectShapeMemberLookupFailureMessage,
} from "../../../target-model/types/object-shape-members.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpGenericOptionalParts, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { tryCsharpIdentifier } from "../../../target-model/names/identifiers.js";
import type { CsharpRecursiveObjectShapePolicy } from "./object-shape-policy/model.js";
import type {
  CsharpRecursiveTypeResolver,
  CsharpTypeResolutionState,
} from "../resolution/model.js";
import type {
  TargetTypeRef,
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../../../target-model/types/model.js";
import {
  csharpArrayBindingProjectionTarget,
  resolveCsharpArrayBindingCarrier,
  type CsharpArrayBindingCarrier,
} from "../../../target-model/types/carriers/binding-array-carrier.js";
import { nextState } from "../resolution/state.js";

type BindingPatternProjectionRequest =
  | { readonly kind: "array-source"; readonly carrier: TargetTypeRef | undefined }
  | { readonly kind: "array-element"; readonly carrier: CsharpArrayBindingCarrier; readonly index: number;
      readonly rest: boolean; readonly hasDefault: boolean }
  | { readonly kind: "object-source"; readonly shape: CsharpObjectShapeFact | undefined; readonly sourceOwned: boolean }
  | { readonly kind: "object-member"; readonly shape: CsharpObjectShapeFact; readonly sourceName: string; readonly description: string }
  | { readonly kind: "object-rest"; readonly source: CsharpObjectShapeFact; readonly rest: CsharpObjectShapeFact;
      readonly extractedNames: ReadonlySet<string>; readonly description: string }
  | { readonly kind: "source-owned-member"; readonly sourceName: string | undefined; readonly stringLiteral: boolean;
      readonly rest?: boolean; readonly hasDefault?: boolean };

type BindingPatternProjectionSelection =
  | { readonly kind: "source"; readonly source: CsharpBindingPatternSource }
  | { readonly kind: "element"; readonly element: CsharpBindingElementProjection }
  | { readonly kind: "unresolved"; readonly reasons: readonly string[] };

export function selectCsharpBindingPatternDefault(carrier: TargetTypeRef): CsharpTupleDefaultUse {
  const element = getCsharpNullableElementTargetType(carrier);
  return Object.freeze(element === undefined ? { kind: "unused" } : { kind: "planned", carrier: element });
}

export function selectCsharpDefaultValueContract(source: TargetTypeRef, target: TargetTypeRef, presence: boolean): CsharpDefaultValueContract {
  const normalize = source.kind === "type-parameter" && getCsharpGenericOptionalParts(source) === undefined;
  const storage = normalize ? csharpNullableTargetType(source) : source;
  const generic = getCsharpGenericOptionalParts(storage);
  const element = generic?.element ?? getCsharpNullableElementTargetType(storage);
  const optional = element !== undefined || isCsharpJsValueTargetType(storage);
  const retainStorage = generic !== undefined && targetTypeRefEquals(storage, target);
  const guardType = element ?? storage;
  const present = retainStorage ? storage : guardType;
  const kind = isCsharpAbsenceTargetType(storage) ? "absence"
    : !presence && generic === undefined && element !== undefined &&
      (targetTypeRefEquals(element, target) || targetTypeRefEquals(storage, target)) ? "coalesce"
    : !optional && !presence ? "value" : "guarded";
  return Object.freeze({ kind, source, storage, present, guardType, target, normalize, optional, retainStorage, presence });
}

export function selectCsharpBindingPatternProjection(input: BindingPatternProjectionRequest): BindingPatternProjectionSelection {
  const element = (value: CsharpBindingElementProjection): BindingPatternProjectionSelection =>
    Object.freeze({ kind: "element", element: Object.freeze(value) });
  const source = (value: CsharpBindingPatternSource): BindingPatternProjectionSelection =>
    Object.freeze({ kind: "source", source: Object.freeze(value) });
  const unresolved = (reason?: string): BindingPatternProjectionSelection =>
    Object.freeze({ kind: "unresolved", reasons: Object.freeze(reason === undefined ? [] : [reason]) });
  switch (input.kind) {
    case "array-source": {
      const bindingCarrier = resolveCsharpArrayBindingCarrier(input.carrier);
      return input.carrier === undefined || bindingCarrier === undefined ? unresolved()
        : source({ kind: "array-source", sourceCarrier: input.carrier, bindingCarrier });
    }
    case "array-element": {
      const projected = csharpArrayBindingProjectionTarget(input.carrier, input.index, input.rest);
      if (input.rest) {
        if (input.carrier.kind === "array" && projected !== undefined) return element({ kind: "array-rest", start: input.index, restCarrier: input.carrier.restCarrier });
        return projected?.kind === "tuple" ? element({ kind: "tuple-rest", start: input.index, restCarrier: projected })
          : unresolved("Tuple rest destructuring requires an exact tuple-slice carrier.");
      }
      return element({ kind: "array-element", index: input.index,
        ...(projected === undefined ? {} : { elementCarrier: projected }),
        ...(input.hasDefault && input.carrier.kind === "tuple" && projected !== undefined
          ? { tupleDefault: selectCsharpBindingPatternDefault(projected) } : {}) });
    }
    case "object-source":
      return input.shape !== undefined ? source({ kind: "object-shape-source", shape: input.shape })
        : input.sourceOwned ? source({ kind: "source-owned-source" }) : unresolved();
    case "object-member": {
      const selected = resolveCsharpObjectShapeMemberBySourceContract(input.shape, input.sourceName, "checked-object-binding-property");
      return selected.kind === "resolved" ? element({ kind: "object-shape-member", member: selected.member })
        : unresolved(csharpObjectShapeMemberLookupFailureMessage(selected, input.description));
    }
    case "object-rest": {
      for (const name of input.extractedNames) {
        const stale = resolveCsharpObjectShapeMemberBySourceContract(input.rest, name, "finalized-object-rest-member");
        if (stale.kind === "resolved") return unresolved(`${input.description} rest shape must exclude explicitly extracted member '${stale.member.sourceName}'.`);
      }
      const members: { readonly rest: CsharpObjectShapeMemberFact; readonly source: CsharpObjectShapeMemberFact }[] = [];
      const reasons: string[] = [];
      for (const restMember of input.rest.members) {
        const selected = resolveCsharpObjectShapeMemberBySourceKey(input.source, restMember.sourceKey, "finalized-object-rest-member");
        if (selected.kind !== "resolved") {
          reasons.push(csharpObjectShapeMemberLookupFailureMessage(selected, `${input.description} source shape`));
          continue;
        }
        if (!targetTypeRefEquals(selected.member.type, restMember.type)) {
          reasons.push(`${input.description} member '${restMember.sourceName}' requires matching finalized source and rest member carriers.`);
          continue;
        }
        members.push(Object.freeze({ rest: restMember, source: selected.member }));
      }
      if (reasons.length > 0) return Object.freeze({ kind: "unresolved", reasons: Object.freeze(reasons) });
      return element({ kind: "object-shape-rest", restShape: input.rest, members: Object.freeze(members) });
    }
    case "source-owned-member":
      if (input.rest) return unresolved("Object rest destructuring requires finalized provider object-spread semantics before C# emission.");
      if (input.hasDefault) return unresolved("Destructuring defaults require finalized undefined/default-value semantics before C# emission.");
      return input.sourceName === undefined || input.stringLiteral && tryCsharpIdentifier(input.sourceName) !== input.sourceName
        ? unresolved() : element({ kind: "source-owned-member", propertyName: input.sourceName,
          propertyNameKind: input.stringLiteral ? "string-literal" : "identifier" });
  }
}

export interface CsharpBindingProjectionPolicyHost {
  readonly ast: AstReader;
  readonly navigation: SourceProgramNavigation;
  readonly typeResolver: CsharpRecursiveTypeResolver;
  readonly objectShapes: CsharpRecursiveObjectShapePolicy;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
}

export interface CsharpBindingProjectionPolicy {
  resolveProjection(node: Node | undefined, sourceFile: SourceFile | undefined, state: CsharpTypeResolutionState): CsharpBindingProjection | undefined;
  resolveNode(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined;
}

export function createCsharpBindingProjectionPolicy(
  host: CsharpBindingProjectionPolicyHost,
): CsharpBindingProjectionPolicy {
  const activeBindings = new WeakSet<Node>();

  function resolveProjection(
    node: Node | undefined,
    _sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): CsharpBindingProjection | undefined {
    const binding = selectedBindingElement(node, host);
    if (binding === undefined || activeBindings.has(binding)) {
      return undefined;
    }
    const pattern = host.ast.parent(binding);
    if (pattern === undefined) {
      return undefined;
    }
    const declarationFile = host.ast.getSourceFile(binding);
    if (declarationFile === undefined) return undefined;
    activeBindings.add(binding);
    try {
      const ownerType = resolveBindingOwnerType(
        host.ast.parent(pattern),
        pattern,
        declarationFile,
        state,
        host,
        (node, file, state) => resolveProjection(node, file, state)?.bindingCarrier,
      );
      const projected = host.ast.is.IsObjectBindingPattern(pattern)
        ? resolveObjectBindingProjection(binding, ownerType, state, host)
        : host.ast.is.IsArrayBindingPattern(pattern)
        ? resolveArrayBindingProjection(binding, pattern, ownerType, host)
        : undefined;
      if (projected === undefined) {
        return undefined;
      }
      const declaration = host.ast.as.AsBindingElement(binding);
      if (declaration?.Initializer === undefined) return Object.freeze({ storageCarrier: projected, bindingCarrier: projected });
      const storageCarrier = csharpNullableTargetType(projected);
      const defaultValue = host.typeResolver.resolveNode(declaration.Initializer, declarationFile, nextState(state));
      if (defaultValue === undefined) return undefined;
      const bindingCarrier = csharpBindingDefaultCarrier(projected, defaultValue);
      return Object.freeze({ storageCarrier, bindingCarrier });
    } finally {
      activeBindings.delete(binding);
    }
  }

  return Object.freeze({ resolveProjection,
    resolveNode: (node: Node | undefined, sourceFile: SourceFile | undefined, state: CsharpTypeResolutionState) =>
      resolveProjection(node, sourceFile, state)?.bindingCarrier });
}

function selectedBindingElement(
  node: Node | undefined,
  host: Pick<CsharpBindingProjectionPolicyHost, "ast" | "navigation">,
): Node | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (host.ast.is.IsBindingElement(node)) {
    return node;
  }
  const parent = host.ast.parent(node);
  if (parent !== undefined && host.ast.is.IsBindingElement(parent)) {
    return parent;
  }
  const declaration = host.navigation.referenceFor(node)?.declaration;
  return declaration !== undefined && host.ast.is.IsBindingElement(declaration)
    ? declaration
    : undefined;
}

function resolveBindingOwnerType(
  owner: Node | undefined,
  pattern: Node,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
  host: CsharpBindingProjectionPolicyHost,
  resolveProjection: CsharpBindingProjectionPolicy["resolveNode"],
): TargetTypeRef | undefined {
  if (owner === undefined) {
    return undefined;
  }
  if (host.ast.is.IsVariableDeclaration(owner)) {
    const declaration = host.ast.as.AsVariableDeclaration(owner);
    const declarations = host.ast.parent(owner);
    const statement = declarations === undefined ? undefined : host.ast.parent(declarations);
    if (declaration?.Type === undefined && declaration?.Initializer === undefined &&
      declarations !== undefined && host.ast.is.IsVariableDeclarationList(declarations) &&
      statement !== undefined && host.ast.is.IsForOfStatement(statement)) {
      const iteration = host.ast.as.AsForInOrOfStatement(statement);
      const selected = sourceFile === undefined ? undefined : host.semantics(sourceFile).operations.iteration(statement);
      if (iteration?.Initializer !== declarations || iteration.Expression === undefined || selected === undefined ||
        selected.iterationKind !== "for-of" && selected.iterationKind !== "for-await-of") return undefined;
      return getCsharpCollectionElementTargetType(host.typeResolver.resolveNode(
        iteration.Expression, sourceFile, nextState(state)));
    }
    return host.typeResolver.resolveNode(
      declaration?.Type ?? declaration?.Initializer,
      sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsParameterDeclaration(owner)) {
    return host.typeResolver.resolveNode(
      host.ast.as.AsParameterDeclaration(owner)?.Type,
      sourceFile,
      nextState(state),
    );
  }
  if (
    host.ast.is.IsBindingElement(owner) &&
    host.ast.as.AsBindingElement(owner)?.name === pattern
  ) {
    return resolveProjection(owner, sourceFile, nextState(state));
  }
  return undefined;
}

function resolveObjectBindingProjection(
  binding: Node,
  ownerType: TargetTypeRef | undefined,
  state: CsharpTypeResolutionState,
  host: CsharpBindingProjectionPolicyHost,
): TargetTypeRef | undefined {
  const declaration = host.ast.as.AsBindingElement(binding);
  if (declaration?.DotDotDotToken !== undefined) {
    const selected = host.scopedTargetType(binding);
    const sourceFile = host.ast.getSourceFile(binding);
    const shape = selected !== undefined ? host.objectShapes.resolveTarget(selected)
      : sourceFile === undefined ? undefined : host.objectShapes.resolveTypeWithState(
      host.semantics(sourceFile).declarations.declaredValueType(binding), sourceFile, undefined, nextState(state),
    );
    return shape === undefined ? undefined : host.objectShapes.resolveCopyShape(shape)?.targetType;
  }
  const property = declaration?.PropertyName ?? declaration?.name;
  if (property === undefined) return undefined;
  let sourceName: string;
  if (host.ast.is.IsComputedPropertyName(property) || host.ast.is.IsNumericLiteral(property)) {
    const sourceFile = host.ast.getSourceFile(property);
    const selectedName = sourceFile === undefined ? undefined : host.semantics(sourceFile).propertyNames.get(property);
    if (selectedName?.kind !== "resolved") return undefined;
    sourceName = selectedName.name;
  } else if (host.ast.is.IsIdentifier(property) || host.ast.is.IsStringLiteral(property)) {
    sourceName = host.ast.text(property);
  } else return undefined;
  const shape = host.objectShapes.resolveTarget(ownerType);
  if (shape === undefined) {
    return undefined;
  }
  const selected = resolveCsharpObjectShapeMemberBySourceContract(
    shape,
    sourceName,
    "checked-object-binding-property",
  );
  return selected.kind === "resolved" ? selected.member.type : undefined;
}

function resolveArrayBindingProjection(
  binding: Node,
  pattern: Node,
  ownerType: TargetTypeRef | undefined,
  host: CsharpBindingProjectionPolicyHost,
): TargetTypeRef | undefined {
  const elementIndex = host.ast.elements(pattern).findIndex(
    (element) => element === binding,
  );
  if (elementIndex < 0) {
    return undefined;
  }
  const declaration = host.ast.as.AsBindingElement(binding);
  return csharpArrayBindingProjectionTarget(
    resolveCsharpArrayBindingCarrier(ownerType),
    elementIndex,
    declaration?.DotDotDotToken !== undefined,
  );
}
