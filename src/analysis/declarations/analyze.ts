import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeParticipationInput, CsharpNativeUseClassifications } from "../../target-model/records/native-demand.js";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { selectCsharpContextualAsyncReturn } from "../../policy/conversions/contextual-async-return.js";
import { getCsharpAwaitResultTargetType } from "../../policy/operations/control-flow/await-completions.js";
import { csharpTaskTargetType } from "../../target-model/types/carriers/delegates.js";
import { csharpMethodValueCoversContract } from "../../target-model/types/method-values.js";
import {
  HasSyntacticModifier,
  isSourceCallableBodyBoundary,
  sourceClassFieldIsTypeOnly,
  sourceParameterIsProperty,
  ModifierFlagsAbstract,
  ModifierFlagsAccessor,
  ModifierFlagsAmbient,
  ModifierFlagsAsync,
  ModifierFlagsConst,
  ModifierFlagsOverride,
  ModifierFlagsPrivate,
  ModifierFlagsProtected,
  ModifierFlagsPublic,
  ModifierFlagsReadonly,
  Node_Type,
} from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import {
  csharpConversionIsApplicable,
  selectCsharpCommonImplicitTarget,
  selectCsharpConversion,
} from "../../policy/conversions/index.js";
import {
  csharpAbsenceTargetType,
  combineCsharpTargetUnionMembers,
  isCsharpAbsenceTargetType,
  csharpCarrierAdmitsSourceAbsence,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpDelegateSignature,
  isCsharpJsValueTargetType,
  targetTypeRefKey,
  targetTypeRefEquals,
  csharpBigIntegerTargetType,
  isCsharpVoidTargetType,
  getCsharpTaskResultTargetType,
  getCsharpGenericOptionalParts,
} from "../../policy/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpRuntimeParameterDefault } from "../../target-model/types/parameter-defaults.js";
import { selectCsharpDefaultValueContract } from "../../policy/types/objects/binding-projection-policy.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadStageIndex } from "../../target-model/records/conversions.js";
import type { CsharpDeclarationClassifications, CsharpDefaultParameterContract, CsharpReturnTargetContract } from "../../target-model/records/declarations.js";
import { csharpSourceTypeParameters } from "../../target-model/names/type-parameters.js";
import type { CsharpProjectCallableAdapters } from "../../target-model/records/callable-adapters.js";

export function admitCsharpNativeDeclarations(
  ast: AstReader,
  nodes: readonly Node[],
  nativeUse: CsharpNativeUseClassifications["nativeUse"],
  projectTypes: Pick<CsharpProjectTypeClassifications, "heritageForDeclaration">,
  metadata: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata">,
  storage: Pick<CsharpStorageClassifications, "storageType" | "nativeBacking" | "typedLocationIdentity">,
  participation: CsharpNativeParticipationInput["participation"],
  nativeUnreachable: CsharpTargetOperationClassifications["nativeUnreachable"],
  declarations: Pick<CsharpDeclarationClassifications, "methodWrite">,
  methodDispatch: CsharpProjectCallableAdapters["callableDispatch"],
): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
      sourceNode: node, message }));
  };
  for (const node of nodes) {
    if (nativeUse.order(node) === undefined || metadata.compileTimeMetadata.get(node) ||
      nativeUnreachable.get(node) || participation.get(node) === "erased" || sourceClassFieldIsTypeOnly(ast, node)) continue;
    admitCsharpDeclarationModifiers(ast, node, refuse);
    if (ast.is.IsMethodDeclaration(node)) {
      const write = declarations.methodWrite.get(node);
      if (write !== undefined) {
        const owner = ast.parent(node);
        const heritage = owner === undefined ? undefined : projectTypes.heritageForDeclaration(owner);
        const dispatch = methodDispatch.get(node);
        if (csharpTargetTypeRenderingRejection(write.type) !== undefined ||
          csharpSourceTypeParameters(node, ast).some(parameter => parameter !== undefined) ||
          ast.hasModifierKind(node, "static") || ast.hasModifierKind(node, "abstract") ||
          dispatch?.overridesBase === true || dispatch?.hasDerivedOverride === true ||
          heritage !== undefined && (heritage.baseType !== undefined || heritage.interfaces.length > 0)) {
          refuse(node, "A writable source method requires a closed non-generic instance delegate without native inheritance or interface dispatch obligations.");
        }
      }
    }
    const classDeclaration = ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node);
    if (classDeclaration || ast.is.IsInterfaceDeclaration(node)) {
      const heritage = projectTypes.heritageForDeclaration(node);
      if (heritage !== undefined) {
        const types = heritage.baseType === undefined ? heritage.interfaces : [heritage.baseType, ...heritage.interfaces];
        for (const type of types) {
          if (csharpTargetTypeRenderingRejection(type) !== undefined) {
            refuse(node, "Canonical project heritage contains a target type that cannot be rendered in C#.");
          }
        }
      }
    }
    if (classDeclaration) {
      for (const member of ast.members(node)) {
        if (member === undefined || metadata.compileTimeMetadata.get(member) || nativeUnreachable.get(member) ||
          participation.get(member) === "erased" || sourceClassFieldIsTypeOnly(ast, member)) continue;
        const kind = ast.kindName(member);
        if (kind === "KindPropertyDeclaration" && ast.hasModifierKind(member, "static") &&
          ast.as.AsPropertyDeclaration(member)?.Initializer === undefined) {
          const type = storage.storageType.get(member);
          const absentDefault = csharpCarrierAdmitsSourceAbsence(type) &&
            type !== undefined && getCsharpGenericOptionalParts(type) === undefined;
          const numericDefault = type !== undefined && (type.kind === "source-primitive" && type.name !== "char" ||
            targetTypeRefEquals(type, csharpBigIntegerTargetType()));
          if (!absentDefault && !numericDefault) {
            issues.push(Object.freeze({ code: "CSHARP_STATIC_FIELD_INITIALIZER_REQUIRED", category: "error",
              source: "tsonic-csharp", sourceNode: member,
              message: "A static class field requires an explicit initializer when its native default is not a value of the declared storage type." }));
          }
        }
        if (kind !== "KindConstructor" && kind !== "KindClassStaticBlockDeclaration" && kind !== "KindMethodDeclaration" &&
          kind !== "KindPropertyDeclaration" && kind !== "KindParameter" && kind !== "KindGetAccessor" && kind !== "KindSetAccessor") {
          refuse(member, "Class member is outside the current C# planning surface.");
        }
      }
    } else if (ast.is.IsInterfaceDeclaration(node)) {
      for (const member of ast.members(node)) {
        if (member === undefined || metadata.compileTimeMetadata.get(member)) continue;
        const kind = ast.kindName(member);
        if (kind !== "KindMethodSignature" && kind !== "KindPropertySignature" && kind !== "KindIndexSignature") {
          refuse(member, "Interface member is outside the current C# planning surface.");
        }
        if (kind === "KindMethodSignature" && participation.get(member) === "signature" &&
          ast.parameters(member).some(parameter => {
            if (parameter === undefined) return false;
            const name = ast.name(parameter);
            return name !== undefined && (ast.is.IsObjectBindingPattern(name) || ast.is.IsArrayBindingPattern(name)) ||
              storage.nativeBacking.get(parameter) !== undefined || storage.typedLocationIdentity.get(parameter);
          })) refuse(member, "Interface methods cannot publish destructuring parameter preludes.");
      }
    }
  }
  return Object.freeze(issues);
}

function admitCsharpDeclarationModifiers(ast: AstReader, node: Node,
  refuse: (node: Node, message: string) => void): void {
  const modifiers = [
    { flag: ModifierFlagsPublic, name: "public" },
    { flag: ModifierFlagsPrivate, name: "private" },
    { flag: ModifierFlagsProtected, name: "protected" },
    { flag: ModifierFlagsReadonly, name: "readonly" },
    { flag: ModifierFlagsAbstract, name: "abstract" },
    { flag: ModifierFlagsOverride, name: "override" },
    { flag: ModifierFlagsAmbient, name: "declare" },
    { flag: ModifierFlagsAccessor, name: "accessor" },
    { flag: ModifierFlagsConst, name: "const" },
  ];
  const visibility = ["public", "private", "protected"];
  const check = (context: string, allowed: readonly string[] = []): void => {
    for (const modifier of modifiers) {
      if (!allowed.includes(modifier.name) && HasSyntacticModifier(ast, node, modifier.flag)) refuse(node,
        `TypeScript-only modifier '${modifier.name}' on ${context} is outside the native runtime-shape source subset. Use standard ECMAScript runtime shape or target/provider facts instead.`);
    }
  };
  if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) check("class declaration", ["abstract"]);
  else if (ast.is.IsInterfaceDeclaration(node)) check("interface declaration");
  else if (ast.is.IsConstructorDeclaration(node)) check("constructor declaration", visibility);
  else if (ast.is.IsMethodDeclaration(node)) check("method declaration", [...visibility, "abstract", "override"]);
  else if (ast.is.IsPropertyDeclaration(node)) check("property declaration", [...visibility, "readonly", "abstract", "override"]);
  else if (ast.is.IsGetAccessorDeclaration(node) || ast.is.IsSetAccessorDeclaration(node)) {
    check("accessor declaration", [...visibility, "abstract", "override"]);
  } else if (ast.is.IsMethodSignatureDeclaration(node)) check("interface method declaration");
  else if (ast.is.IsPropertySignatureDeclaration(node)) check("interface property declaration", ["readonly"]);
  else if (ast.is.IsIndexSignatureDeclaration(node)) check("interface index signature", ["readonly"]);
  else if (ast.is.IsEnumDeclaration(node)) check("enum declaration");
  else if (ast.is.IsFunctionDeclaration(node)) check("function declaration");
  else if (ast.is.IsParameterDeclaration(node)) {
    const owner = ast.parent(node);
    if (sourceParameterIsProperty(ast, node)) check("property declaration", [...visibility, "readonly", "abstract", "override"]);
    if (owner !== undefined && (ast.is.IsArrowFunction(owner) || ast.is.IsFunctionExpression(owner))) {
      check("lambda parameter declaration");
    } else check("parameter declaration", sourceParameterIsProperty(ast, node) ? [...visibility, "readonly"] : []);
  }
}

export function analyzeCsharpDeclarations(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  valueReadStages: CsharpValueReadStageIndex,
): CsharpDeclarationClassifications {
  const returnContracts = new WeakMap<Node, CsharpReturnTargetContract>();
  const runtimeDefaults = new WeakMap<Node, CsharpDefaultParameterContract>();
  const methodWrites = new WeakMap<Node, { readonly type: TargetTypeRef; readonly storageName: string; readonly implementationName: string }>();
  for (const sourceFile of policy.sourceFiles) {
    visit(sourceFile);
  }
  return Object.freeze({
    runtimeDefault: Object.freeze({ get(node: Node) { return runtimeDefaults.get(node); } }),
    methodWrite: Object.freeze({ get(node: Node) { return methodWrites.get(node); } }),
    returnContract: Object.freeze({ get(node: Node) {
      return returnContracts.get(node);
    } }),
  });

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    const property = operations.selectedProperty.get(node);
    if (property?.selection.kind === "source-owned" && property.selection.source.accessMode !== "read") {
      const declaration = property.selection.source.selectedDeclaration;
      const selectedType = property.sourceOwned?.rawReadType;
      if (declaration !== undefined && policy.ast.is.IsMethodDeclaration(declaration) &&
        selectedType !== undefined && getCsharpDelegateSignature(selectedType) !== undefined && !methodWrites.has(declaration)) {
        const owner = policy.ast.parent(declaration);
        if (owner !== undefined && (policy.ast.is.IsClassDeclaration(owner) || policy.ast.is.IsClassExpression(owner))) {
          const reserved = new Set(policy.ast.members(owner).map(member => {
            const name = policy.ast.name(member);
            const selected = name === undefined ? undefined : policy.semanticsFor(name).propertyNames.get(name);
            return selected?.kind === "resolved" ? selected.name : undefined;
          }));
          const declarationName = policy.ast.name(declaration);
          const selectedName = declarationName === undefined ? undefined : policy.semanticsFor(declarationName).propertyNames.get(declarationName);
          const allocate = (prefix: string): string => {
            let name = `${prefix}${selectedName?.kind === "resolved" ? selectedName.name : policy.ast.pos(declaration)}`;
            while (reserved.has(name)) name = `_${name}`;
            reserved.add(name);
            return name;
          };
          methodWrites.set(declaration, { type: selectedType,
            storageName: allocate("__tsonic_method_slot_"), implementationName: allocate("__tsonic_method_body_") });
        }
      }
    }
    if (policy.ast.is.IsParameterDeclaration(node)) {
      const parameter = policy.ast.as.AsParameterDeclaration(node);
      const selected = parameter === undefined ? undefined
        : evidence.nodeTargetType.get(parameter.Type ?? parameter.name!);
      if (parameter?.Initializer !== undefined && selected !== undefined) {
        const owner = policy.ast.parent(node);
        const contextual = owner === undefined ? undefined : evidence.contextualTargetType.get(owner);
        const signature = contextual === undefined ? undefined : getCsharpDelegateSignature(contextual);
        const index = owner === undefined ? -1 : policy.ast.parameters(owner).indexOf(node);
        const incoming = index < 0 ? undefined : signature?.parameters[index];
        const value = incoming === undefined ? undefined : getCsharpNullableElementTargetType(incoming);
        const source = evidence.expressionType.get(parameter.Initializer);
        const queries = policy.semanticsFor(node);
        const members = source === undefined ? [] : queries.types.isUnion(source)
          ? queries.types.unionOrIntersectionTypes(source) : [source];
        const presentInitializer = members.length > 0 && members.every(member =>
          member !== undefined && !queries.types.isNullish(member) && !queries.types.isAny(member) && !queries.types.isUnknown(member));
        const runtimeDefault = incoming !== undefined && value !== undefined && presentInitializer
          ? csharpRuntimeParameterDefault(parameter.Type === undefined ? value : selected, incoming)
          : csharpRuntimeParameterDefault(selected);
        if (runtimeDefault !== undefined) {
          const slot = owner === undefined ? undefined : queries.types.declarationSignatureInfo(owner)
            ?.parameters.find(parameter => parameter.declaration === node);
          if (slot === undefined) throw new Error("A native parameter default requires its exact checked declaration slot.");
          runtimeDefaults.set(node, Object.freeze({ ...runtimeDefault, acceptsOmission: slot.acceptsOmission,
            native: selectCsharpDefaultValueContract(runtimeDefault.parameterType, runtimeDefault.valueType, false) }));
        }
      }
    }
    if (isCallableDeclaration(policy, node)) {
      returnContracts.set(
        node,
        withAbsenceCompletion(policy, evidence, node, classifyReturnContract(policy, evidence, valueReadStages, node)),
      );
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  }
}

function withAbsenceCompletion(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declaration: Node,
  contract: CsharpReturnTargetContract,
): CsharpReturnTargetContract {
  if (contract.kind !== "resolved") return contract;
  const asynchronous = HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync);
  const contextual = getCsharpDelegateSignature(evidence.contextualTargetType.get(declaration))?.returnType;
  const inferred = Node_Type(policy.ast, declaration) === undefined;
  const type = asynchronous && inferred
    ? selectCsharpContextualAsyncReturn(policy, contract.type, contextual) ?? contract.type
    : !asynchronous && inferred && isCsharpVoidTargetType(contract.type) && csharpCarrierAdmitsSourceAbsence(contextual)
      ? contextual! : contract.type;
  const value = asynchronous ? getCsharpTaskResultTargetType(type) : type;
  if (!isCsharpVoidTargetType(value) && !csharpCarrierAdmitsSourceAbsence(value)) return type === contract.type ? contract : { ...contract, type };
  const completion = policy.semanticsFor(declaration).operations.callableCompletion(declaration);
  if (policy.ast.body(declaration) !== undefined && completion === undefined) {
    return { kind: "rejected", reason: "An absence-bearing callable requires exact source completion evidence." };
  }
  return Object.freeze({ kind: "resolved", type, undefinedReturn: true,
    fallthroughUndefined: !isCsharpVoidTargetType(value) && completion?.canFallThrough === true });
}

function classifyReturnContract(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  valueReadStages: CsharpValueReadStageIndex,
  declaration: Node,
): CsharpReturnTargetContract {
  const baseline = evidence.inferredCallableReturnType.get(declaration);
  const authoredReturnNode = Node_Type(policy.ast, declaration);
  const authoredReturnType = authoredReturnNode === undefined
    ? undefined
    : evidence.nodeTargetType.get(authoredReturnNode);
  const pointer = evidence.pointerReturn.get(declaration);
  if (authoredReturnNode !== undefined) {
    return authoredReturnType === undefined
      ? {
          kind: "rejected",
          reason:
            "The authored source callable return type has no closed C# representation.",
        }
      : { kind: "resolved", type: authoredReturnType,
          ...(pointer === undefined ? {} : { undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined }) };
  }
  if (baseline === undefined) {
    return {
      kind: "rejected",
      reason:
        "The checked source callable has no single closed C# return representation.",
    };
  }
  const asynchronous = HasSyntacticModifier(policy.ast, declaration, ModifierFlagsAsync);
  const observedBaseline = asynchronous ? getCsharpTaskResultTargetType(baseline) : baseline;
  if (observedBaseline === undefined) return {
    kind: "rejected", reason: "The checked source callable has no single closed C# return representation.",
  };
  const observed: TargetTypeRef[] = [];
  let incomplete = false;
  collectDirectReturnExpressions(policy, declaration, (expression) => {
    const type = valueReadStages.get(expression)?.returnedValue;
    if (type === undefined) {
      incomplete = true;
    } else {
      if (asynchronous) {
        const awaited = getCsharpAwaitResultTargetType(type, policy.typeDefinitions);
        if (awaited !== undefined) observed.push(awaited);
        else if (targetTypeRefEquals(type, observedBaseline)) observed.push(type);
        else incomplete = true;
      } else observed.push(type);
    }
  });
  const observedContract = reconcileInferredReturnTargetContract(
    policy,
    observedBaseline,
    observed,
    incomplete,
  );
  const contract = asynchronous && observedContract.kind === "resolved"
    ? { ...observedContract, type: csharpTaskTargetType(observedContract.type) } : observedContract;
  const contextualReturn = getCsharpDelegateSignature(evidence.contextualTargetType.get(declaration))?.returnType;
  if (contract.kind === "resolved" && isCsharpJsValueTargetType(contract.type) && contextualReturn !== undefined &&
    csharpConversionIsApplicable(selectCsharpConversion(policy, contract.type, contextualReturn, "implicit"), "implicit")) {
    return { kind: "resolved", type: contextualReturn };
  }
  return contract.kind !== "resolved" || pointer === undefined ? contract
    : Object.freeze({ ...contract, undefinedReturn: pointer.undefinedReturn, fallthroughUndefined: pointer.fallthroughUndefined });
}

export function reconcileInferredReturnTargetContract(
  policy: CsharpPolicyContext,
  baseline: TargetTypeRef,
  observed: readonly TargetTypeRef[],
  incomplete: boolean,
): CsharpReturnTargetContract {
  if (incomplete) {
    return {
      kind: "rejected",
      reason:
        "An inferred C# public return contract contains a return expression without one closed target representation.",
    };
  }
  if (observed.length === 0) {
    return { kind: "resolved", type: baseline };
  }
  const requiredSources = [
    ...observed,
    ...uncoveredBaselineReturnAlternatives(policy, baseline, observed),
  ];
  const selected = selectCsharpCommonImplicitTarget(
    policy,
    requiredSources,
    [...observed, baseline, ...(requiredSources.some(isCsharpAbsenceTargetType)
      ? observed.flatMap(source => {
          const optional = combineCsharpTargetUnionMembers([source, csharpAbsenceTargetType()]);
          return optional === undefined ? [] : [optional];
        }) : [])],
  );
  return selected.kind === "resolved"
    ? { kind: "resolved", type: selected.target }
    : {
        kind: "rejected",
        reason:
          `An inferred C# public return contract contains incompatible exact target representations. ${selected.reason}`,
      };
}

function uncoveredBaselineReturnAlternatives(
  policy: CsharpPolicyContext,
  baseline: TargetTypeRef,
  observed: readonly TargetTypeRef[],
): readonly TargetTypeRef[] {
  const alternatives = new Map<string, TargetTypeRef>();
  collectTargetContractAlternatives(baseline, alternatives, policy);
  const observedAlternatives = new Map<string, TargetTypeRef>();
  observed.forEach(source => collectTargetContractAlternatives(source, observedAlternatives, policy));
  const observedSources = [...observedAlternatives.values()];
  return [...alternatives.values()].filter((alternative) =>
    !observedSources.some((source) =>
      observedNumericCarrierCoversBaseline(policy, source, alternative) ||
      csharpMethodValueCoversContract(source, alternative) || csharpConversionIsApplicable(
        selectCsharpConversion(policy, source, alternative, "implicit"),
        "implicit",
      )
    )
  );
}

const nativeIntegralKinds = new Set([
  "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
  "int128", "uint128", "native-int", "native-uint",
]);

function observedNumericCarrierCoversBaseline(
  policy: CsharpPolicyContext,
  source: TargetTypeRef,
  baseline: TargetTypeRef,
): boolean {
  if (targetTypeRefEquals(source, baseline)) return true;
  if (source.kind === "source-primitive") {
    if (nativeIntegralKinds.has(source.name) && targetTypeRefEquals(baseline, csharpBigIntegerTargetType())) return true;
    return baseline.kind === "source-primitive" && baseline.name === "float64" &&
      (nativeIntegralKinds.has(source.name) || source.name === "float32") &&
      csharpConversionIsApplicable(selectCsharpConversion(policy, source, baseline, "implicit"), "implicit");
  }
  if (source.kind === "array" && baseline.kind === "array") {
    return (source.rank ?? 1) === (baseline.rank ?? 1) &&
      observedNumericCarrierCoversBaseline(policy, source.element, baseline.element);
  }
  if (source.kind === "tuple" && baseline.kind === "tuple") {
    return source.elements.length === baseline.elements.length && source.elements.every((element, index) =>
      observedNumericCarrierCoversBaseline(policy, element, baseline.elements[index]!));
  }
  if (source.kind === "target-named" && baseline.kind === "target-named" && source.id === baseline.id) {
    const actual = source.typeArguments ?? [];
    const erased = baseline.typeArguments ?? [];
    return actual.length > 0 && actual.length === erased.length &&
      targetTypeRefEquals({ ...source, typeArguments: baseline.typeArguments }, baseline) && actual.every((argument, index) =>
      observedNumericCarrierCoversBaseline(policy, argument, erased[index]!));
  }
  return false;
}

function collectTargetContractAlternatives(
  type: TargetTypeRef,
  alternatives: Map<string, TargetTypeRef>,
  policy: CsharpPolicyContext,
): void {
  const union = getCsharpRuntimeUnionArms(type, policy.typeDefinitions);
  if (union !== undefined) {
    union.forEach((member) =>
      collectTargetContractAlternatives(member, alternatives, policy)
    );
    return;
  }
  const nullableElement = getCsharpNullableElementTargetType(type);
  if (nullableElement !== undefined) {
    collectTargetContractAlternatives(nullableElement, alternatives, policy);
    const undefinedType = csharpAbsenceTargetType();
    alternatives.set(targetTypeRefKey(undefinedType), undefinedType);
    return;
  }
  alternatives.set(targetTypeRefKey(type), type);
}

function collectDirectReturnExpressions(
  policy: CsharpPolicyContext,
  declaration: Node,
  consume: (expression: Node) => void,
): void {
  const body = policy.ast.body(declaration);
  if (body === undefined) {
    return;
  }
  if (policy.ast.is.IsArrowFunction(declaration) && !policy.ast.is.IsBlock(body)) {
    consume(body);
    return;
  }
  visit(body);

  function visit(node: Node): void {
    if (node !== body && isSourceCallableBodyBoundary(policy.ast, node)) {
      return;
    }
    if (policy.ast.is.IsReturnStatement(node)) {
      const expression = policy.ast.as.AsReturnStatement(node)?.Expression;
      if (expression !== undefined) {
        consume(expression);
      }
      return;
    }
    policy.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  }
}

function isCallableDeclaration(
  policy: CsharpPolicyContext,
  node: Node,
): boolean {
  return policy.ast.is.IsFunctionDeclaration(node) ||
    policy.ast.is.IsFunctionExpression(node) ||
    policy.ast.is.IsArrowFunction(node) ||
    policy.ast.is.IsMethodDeclaration(node) ||
    policy.ast.is.IsMethodSignatureDeclaration(node) ||
    policy.ast.is.IsGetAccessorDeclaration(node) ||
    policy.ast.is.IsSetAccessorDeclaration(node);
}
