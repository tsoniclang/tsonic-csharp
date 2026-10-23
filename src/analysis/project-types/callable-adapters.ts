import { failTargetAnalysisInvariant, rejectedTargetStage, resolvedTargetStage, targetDiagnosticFromExtension, type TargetDiagnostic, type TargetStageResult } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import { sourceObjectMemberDeclarations, sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { namedTargetTypeImplicitlyAccepts } from "../../policy/conversions/carriers.js";
import { isCsharpSourceCallableArtifactDeclaration } from "../../policy/types/callables/source-callable-contract.js";
import type { CsharpProjectCallableAdapter, CsharpProjectCallableAdapters, CsharpProjectCallableDispatch } from "../../target-model/records/callable-adapters.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpFinalStructuralInterfaceImplementation, CsharpStructuralMethodForwarding } from "../../target-model/records/heritage.js";
import type { CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";
import type { SourceCallableSourceContract } from "../../target-model/records/source-callable-contract.js";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { scopedTargetTypeRefKey, targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import type { CsharpStructuralInterfaceImplementation, CsharpTargetNamedTypeRef, CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { admitCsharpCallableParameterAdapters, admitCsharpCallableResultAdapter, type CsharpCallableConversionPolicy } from "../callables/adapters.js";
import { csharpCallableParametersEqual, instantiateCsharpInheritedCallable } from "../callables/instantiation.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";
import type { CsharpObjectShapeAnalysis, CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import { finalizeCsharpStructuralInterfaceForwarding } from "../objects/structural-forwarding.js";
import { csharpTypeParameterConstraintsEqual, csharpTypeParameterConstraintsImply } from "../../policy/constraints/type-parameter-constraints.js";
import type { CsharpTypeParameterConstraint } from "../../target-model/types/generic-constraints.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/type-projections.js";
import { selectCsharpNativeQuantifierArguments } from "../../policy/types/callables/method-values.js";
import type { CsharpSourceNameResolver } from "../names/plan.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpNativeUseClassifications } from "../../target-model/records/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpNativeInheritedDispatchSlot, CsharpNativeInheritedMember, CsharpNativeTargetBindingFact } from "../../target-model/types/native-inheritance.js";
import { csharpNativeInheritanceLookup } from "../../target-model/types/native-inheritance.js";
import { csharpTargetStorageIdentityEquals } from "../../policy/types/storage/storage-identity.js";

type StructuralMethod = CsharpStructuralInterfaceImplementation["methods"][number];
type FinalMethod = CsharpFinalStructuralInterfaceImplementation["methods"][number];
type NativeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }> & {
  readonly csharpConstraints: { readonly kind: "resolved"; readonly constraints: readonly CsharpTypeParameterConstraint[] };
};
type MethodRequest = {
  readonly selected: CsharpStructuralInterfaceImplementation;
  readonly methods: Map<string, { readonly method: StructuralMethod; readonly contract: CsharpStructuralMethodForwarding["contract"];
    readonly typeParameters: readonly NativeParameter[]; readonly nativeContract: SourceCallableSourceContract | undefined }>;
  readonly rejected: Set<string>;
};

const noImplementations: readonly CsharpFinalStructuralInterfaceImplementation[] = Object.freeze([]);

export function analyzeCsharpProjectCallableAdapters(
  policy: Pick<CsharpPolicyContext, "ast" | "navigation"> & CsharpCallableConversionPolicy,
  callables: CsharpCallableContractIndex,
  shapes: CsharpObjectShapeAnalysis,
  declarations: Pick<CsharpDeclarationClassifications, "runtimeDefault">,
  projections: CsharpGenericProjectionIndex["genericProjection"],
  native: {
    readonly names: Pick<CsharpSourceNameResolver, "resolve">;
    readonly storage: Pick<CsharpStorageClassifications, "storageType">;
    readonly nativeUse: CsharpNativeUseClassifications["nativeUse"];
    readonly classPropertyStorage: CsharpTargetOperationClassifications["classPropertyStorage"];
  },
): TargetStageResult<CsharpProjectCallableAdapters & {
  readonly objectShapes: CsharpObjectShapeClassifications<CsharpFinalStructuralInterfaceImplementation> &
    Pick<CsharpObjectShapeAnalysis, "targetShapes">;
}> {
  if (typeof native?.names.resolve !== "function" || typeof native.storage.storageType.get !== "function" ||
    typeof native.nativeUse.order !== "function" || typeof native.classPropertyStorage.get !== "function") {
    failTargetAnalysisInvariant("tsonic-csharp", "Native callable dispatch requires the open authored-name lookup and completed storage and participation inputs.");
  }
  const byDeclaration = new Map<Node, CsharpProjectCallableDispatch>();
  const requests = new Map<string, { readonly type: TargetTypeRef; readonly interfaces: Map<string, MethodRequest> }>();
  const issues: CsharpProjectTypeIssue[] = [...shapes.issues];
  const nativeIssues: TargetDiagnostic[] = [];
  const nativeBindings = new Map<string, CsharpNativeTargetBindingFact | undefined>();
  const nativeMembers = new Map<string, readonly CsharpNativeInheritedMember[] | undefined>();
  for (const type of shapes.structuralImplementationTypes) {
    for (const selected of shapes.structuralImplementations(type)) {
      const request = interfaceRequest(type, selected);
      for (const method of selected.methods) addMethod(request, method);
    }
  }
  for (const implementation of callables.declarationContracts) {
    const declaration = implementation.sourceDeclaration;
    if (policy.ast.is.IsMethodSignatureDeclaration(declaration)) {
      byDeclaration.set(declaration, Object.freeze({ kind: "method", implementation,
        overridesBase: false, hasDerivedOverride: false, adapters: Object.freeze([]) }));
      continue;
    }
    const declarationOwner = policy.ast.parent(declaration);
    if ((policy.ast.is.IsGetAccessorDeclaration(declaration) || policy.ast.is.IsSetAccessorDeclaration(declaration)) &&
      declarationOwner !== undefined && (policy.ast.is.IsInterfaceDeclaration(declarationOwner) || policy.ast.is.IsTypeLiteralNode(declarationOwner))) {
      byDeclaration.set(declaration, Object.freeze({ kind: "property", parameters: implementation.parameters,
        overridesBase: false, hasDerivedOverride: false }));
      continue;
    }
    if (!policy.ast.is.IsMethodDeclaration(declaration)) continue;
    if (native.nativeUse.order(declaration) === undefined) continue;
    if (policy.ast.hasModifierKind(declaration, "static")) {
      byDeclaration.set(declaration, Object.freeze({ kind: "method", implementation,
        overridesBase: false, hasDerivedOverride: false, adapters: Object.freeze([]) }));
      continue;
    }
    const parent = policy.ast.parent(declaration);
    const owner = policy.projectTypes.catalog.definitionForDeclaration(parent);
    const objectMethod = parent !== undefined && policy.ast.is.IsObjectLiteralExpression(parent);
    if (owner === undefined && !objectMethod) continue;
    const inherited = objectMethod ? { kind: "resolved" as const, contracts: [] } : policy.navigation.memberContracts(declaration);
    if (inherited.kind !== "resolved") {
      reject(declaration, inherited.reason);
      continue;
    }
    const receiver = owner === undefined ? undefined
      : policy.projectTypes.catalog.targetTypeForDeclaration(owner.declaration, owner.typeParameterBindings);
    const adapters: CsharpProjectCallableAdapter[] = [];
    const seen = new Set<string>();
    let overridesBase = false;
    let hasProjectBaseContract = false;
    for (const contractDeclaration of inherited.contracts) {
      const original = callables.get({ kind: "declaration", declaration: contractDeclaration });
      if (original === undefined) {
        if (isCsharpSourceCallableArtifactDeclaration(policy.ast, contractDeclaration)) {
          reject(declaration, "An inherited callable is missing its sealed native signature.");
        }
        continue;
      }
      const contractOwner = policy.projectTypes.catalog.definitionForDeclaration(policy.ast.parent(contractDeclaration));
      if (contractOwner === undefined) continue;
      if (contractOwner.kind === "interface") {
        const interfaceType = policy.projectTypes.catalog.targetTypeForDeclaration(contractOwner.declaration, contractOwner.typeParameterBindings);
        const instantiated = interfaceType === undefined ? undefined
          : policy.projectTypes.instantiateDeclarationType(contractOwner.declaration, receiver, interfaceType);
        const selectedInterface = instantiated?.kind === "resolved" ? instantiated.type : undefined;
        if (receiver === undefined || selectedInterface === undefined) {
          reject(declaration, "An interface callable has no exact native owner.");
          continue;
        }
        if (nativeBaseProvides(receiver, selectedInterface)) continue;
        const source = shapes.resolveTarget(receiver);
        const destination = shapes.resolveTarget(selectedInterface);
        const read = source === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(source, [declaration]);
        const write = destination === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(destination, [contractDeclaration]);
        if (read?.kind !== "resolved" || write?.kind !== "resolved") {
          reject(declaration, "An inherited interface callable has no exact checked native member correspondence.");
          continue;
        }
        addMethod(interfaceRequest(receiver, Object.freeze({ sourceNode: declaration, sourceType: receiver,
          interfaceType: selectedInterface, properties: Object.freeze([]), methods: Object.freeze([]) })),
        Object.freeze({ sourceName: read.member.targetName, declaration, member: write.member }));
        continue;
      }
      // A base class overload signature (a bodiless, non-abstract method beside its implementation) emits no native method:
      // the implementation alone carries every overload, so it is no inherited native slot to adapt or override.
      if (!isCsharpSourceCallableArtifactDeclaration(policy.ast, contractDeclaration)) continue;
      hasProjectBaseContract = true;
      const contract = instantiateCsharpInheritedCallable(policy, original, implementation, receiver);
      if (contract === undefined) { reject(declaration, "An inherited callable has no exact instantiated native signature."); continue; }
      const key = contract.nativeParameters.map(parameter =>
        `${parameter.targetParameter.passingMode}:${targetTypeRefKey(parameter.targetParameter.type)}`).join(";");
      if (seen.has(key)) continue;
      seen.add(key);
      const sameParameters = csharpCallableParametersEqual(contract, implementation);
      const result = admitCsharpCallableResultAdapter(policy, implementation, contract.returnType);
      if (sameParameters) {
        const nativeReturn = result?.conversion.kind === "identity" || result?.conversion.kind === "implicit" &&
          result.conversion.proof === "reference";
        if (!nativeReturn) reject(declaration, "An inherited callable requires a native return adaptation without a distinct parameter signature.");
        else overridesBase = true;
        continue;
      }
      const parameters = admitCsharpCallableParameterAdapters(policy, contract.nativeParameters.map(parameter => parameter.targetParameter),
        implementation.nativeParameters.map(parameter => parameter.targetParameter));
      if (parameters === undefined || result === undefined) {
        reject(declaration, "An inherited callable requires an exact logical-argument and native-result adaptation.");
        continue;
      }
      adapters.push(Object.freeze({ contract, parameters, result }));
    }
    const dispatch = objectMethod ? undefined : policy.navigation.memberDispatch(declaration);
    const nativeOverride = hasProjectBaseContract ? overridesBase : overridesNativeMethod(declaration, implementation, parent);
    byDeclaration.set(declaration, Object.freeze({ kind: "method", implementation,
      overridesBase: nativeOverride,
      hasDerivedOverride: dispatch?.hasDerivedOverride === true, adapters: Object.freeze(adapters) }));
  }
  for (const definition of policy.projectTypes.catalog.definitions) {
    if (definition.kind !== "class") continue;
    for (const member of sourceObjectMemberDeclarations(policy.ast, definition.declaration)) {
      if (member === undefined || !policy.ast.is.IsPropertyDeclaration(member) && !sourceParameterIsProperty(policy.ast, member) &&
        !policy.ast.is.IsGetAccessorDeclaration(member) && !policy.ast.is.IsSetAccessorDeclaration(member)) continue;
      if (native.nativeUse.order(member) === undefined && !sourceParameterIsProperty(policy.ast, member)) continue;
      const property = native.classPropertyStorage.get(member);
      const accessor = policy.ast.is.IsGetAccessorDeclaration(member) || policy.ast.is.IsSetAccessorDeclaration(member);
      if (!accessor && property?.kind !== "property") continue;
      const dispatch = policy.navigation.memberDispatch(member);
      const contracts = policy.navigation.memberContracts(member);
      const projectBase = contracts.kind === "resolved" && contracts.contracts.some(contract =>
        policy.projectTypes.catalog.definitionForDeclaration(policy.ast.parent(contract))?.kind === "class");
      const overridesBase = policy.ast.hasModifierKind(member, "static") ? false
        : projectBase ? dispatch?.overridesBase === true : overridesNativeProperty(member, definition.declaration, property?.readonly === true);
      const contract = accessor ? callables.get({ kind: "declaration", declaration: member }) : undefined;
      if (accessor && contract === undefined)
        failTargetAnalysisInvariant("tsonic-csharp", "An admitted accessor requires its checked source value vector and native ABI.", member);
      byDeclaration.set(member, Object.freeze({ kind: "property", parameters: accessor ? contract!.parameters : Object.freeze([]),
        overridesBase, hasDerivedOverride: dispatch?.hasDerivedOverride === true }));
    }
  }
  for (const owner of requests.values()) {
    for (const request of owner.interfaces.values()) {
      for (const { method } of request.methods.values()) {
        const protocol = method.member.methodValueContract;
        if (protocol === undefined || targetTypeRefEquals(protocol, request.selected.interfaceType)) continue;
        const shape = shapes.resolveTarget(protocol);
        const subjects = [...method.member.sourceSubjects ?? [], ...method.member.sourceDeclarations ?? []];
        const selected = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(shape, subjects);
        if (selected?.kind !== "resolved" || selected.member.memberKind !== "method") {
          return failTargetAnalysisInvariant("tsonic-csharp",
            "An inherited method-value protocol lost its checked native member correspondence.", method.declaration);
        }
        addMethod(interfaceRequest(owner.type, Object.freeze({ sourceNode: request.selected.sourceNode,
          sourceType: request.selected.sourceType, interfaceType: protocol, properties: Object.freeze([]), methods: Object.freeze([]) })),
        Object.freeze({ ...method, member: selected.member }));
      }
    }
  }
  const byType = new Map<string, readonly CsharpFinalStructuralInterfaceImplementation[]>();
  const sourceIds = new Set<string>();
  for (const [key, owner] of requests) {
    const implementations: CsharpFinalStructuralInterfaceImplementation[] = [];
    for (const request of owner.interfaces.values()) {
      const methods: FinalMethod[] = [];
      for (const { method, contract, typeParameters, nativeContract } of request.methods.values()) {
        if (nativeBaseProvides(owner.type, request.selected.interfaceType)) continue;
        const original = callables.get({ kind: "declaration", declaration: method.declaration });
        const declaringOwner = policy.projectTypes.catalog.definitionForDeclaration(policy.ast.parent(method.declaration));
        const instantiated = original === undefined || declaringOwner === undefined || declaringOwner.typeParameterBindings.length === 0
          ? original : instantiateCsharpInheritedCallable(policy, original, original, request.selected.sourceType);
        if (instantiated === undefined) {
          refuse(method.declaration);
          continue;
        }
        const bodyShape = instantiated.nativeSignature.methodTypeParameterIdentities.length === 0 ? undefined : shapes.resolveTarget(request.selected.sourceType);
        const bodyMember = bodyShape === undefined ? undefined
          : resolveCsharpObjectShapeMemberBySelectedSubject(bodyShape, [method.declaration]);
        const bodyParameters = instantiated.nativeSignature.methodTypeParameterIdentities.length === 0
          ? nativeParameters(undefined, instantiated) : bodyMember?.kind === "resolved" ? nativeParameters(bodyMember.member, instantiated) : undefined;
        if (bodyParameters === undefined || bodyParameters.length > 0 && nativeContract === undefined) {
          reject(method.declaration, "An interface method has no exact native generic constraint or anti-constraint evidence.");
          continue;
        }
        const typeArguments = bodyParameters.length === 0 ? Object.freeze([])
          : selectCsharpNativeQuantifierArguments(bodyParameters, typeParameters);
        if (typeArguments === undefined) { refuse(method.declaration); continue; }
        const substitutions = new Map(instantiated.nativeSignature.methodTypeParameterIdentities.map((identity, index) => [identity, typeArguments[index]!]));
        const bounds = new Map(typeParameters.map(parameter => [parameter.identity, parameter.csharpConstraints.constraints]));
        let sameGenericSignature = bodyParameters.length === typeParameters.length;
        let nativeInvocation = true;
        for (const [index, parameter] of bodyParameters.entries()) {
          const argument = typeArguments[index]!;
          const required = parameter.csharpConstraints.constraints.map(constraint => constraint.kind === "type"
            ? { ...constraint, type: substituteTargetTypeParameters(constraint.type, substitutions) } : constraint);
          const destinationIndex = typeParameters.findIndex(candidate => candidate.identity === argument.identity);
          const acceptsRefLike = nativeContract!.nativeSignature.methodAllowsRefLikeTypeArguments[destinationIndex]!;
          const bodyAcceptsRefLike = instantiated.nativeSignature.methodAllowsRefLikeTypeArguments[index]!;
          nativeInvocation &&= (!acceptsRefLike || bodyAcceptsRefLike) &&
            csharpTypeParameterConstraintsImply(policy, argument.csharpConstraints.constraints, required, bounds);
          sameGenericSignature &&= destinationIndex === index && acceptsRefLike === bodyAcceptsRefLike &&
            csharpTypeParameterConstraintsEqual(argument.csharpConstraints.constraints, required);
        }
        if (!nativeInvocation) {
          reject(method.declaration, "An interface method's native type arguments do not satisfy its implementation's generic constraints.");
          continue;
        }
        const implementation: SourceCallableSourceContract = substitutions.size === 0 ? instantiated : Object.freeze({ ...instantiated,
          nativeParameters: Object.freeze(instantiated.nativeParameters.map(parameter => Object.freeze({ ...parameter,
            targetParameter: Object.freeze({ ...parameter.targetParameter,
              type: substituteTargetTypeParameters(parameter.targetParameter.type, substitutions) }) }))),
          returnType: substituteTargetTypeParameters(instantiated.returnType, substitutions),
          nativeSignature: Object.freeze({ ...instantiated.nativeSignature,
            ...(instantiated.nativeSignature.sourceReturnType === undefined ? {} : {
              sourceReturnType: substituteTargetTypeParameters(instantiated.nativeSignature.sourceReturnType, substitutions) }) }),
        });
        const incoming = contract.nativeParameters.map(parameter => parameter.targetParameter);
        const parameters = admitCsharpCallableParameterAdapters(policy, incoming,
          implementation.nativeParameters.map(parameter => parameter.targetParameter));
        const result = admitCsharpCallableResultAdapter(policy, implementation, contract.returnType);
        if (parameters === undefined || result === undefined) {
          refuse(method.declaration);
          continue;
        }
        const parent = policy.ast.parent(method.declaration);
        const nativeMethod = declaringOwner?.kind === "class" || parent !== undefined && policy.ast.is.IsObjectLiteralExpression(parent);
        const sameSignature = nativeMethod && !policy.ast.hasModifierKind(method.declaration, "private") &&
          !policy.ast.hasModifierKind(method.declaration, "protected") && method.sourceName === method.member.targetName &&
          sameGenericSignature &&
          implementation.nativeParameters.length === incoming.length && implementation.nativeParameters.every((parameter, index) =>
            parameter.targetParameter.passingMode === incoming[index]!.passingMode &&
            targetTypeRefEquals(parameter.targetParameter.type, incoming[index]!.type)) &&
          targetTypeRefEquals(implementation.returnType, contract.returnType);
        if (sameSignature && result.conversion.kind === "identity") continue;
        methods.push(Object.freeze({ ...method, forwarding: Object.freeze({ contract, implementation, typeArguments, typeParameters,
          parameterDefaults: Object.freeze(implementation.nativeParameters.map(parameter => declarations.runtimeDefault.get(parameter.sourceParameter))),
          parameters, result }) }));
      }
      const finalized = finalizeCsharpStructuralInterfaceForwarding(policy, request.selected, Object.freeze(methods));
      implementations.push(finalized.implementation);
      issues.push(...finalized.issues);
    }
    byType.set(key, Object.freeze(implementations));
    if (owner.type.kind === "target-named") sourceIds.add(owner.type.id);
  }
  const { structuralImplementationTypes: _types, structuralImplementations: _logical, issues: _issues, ...readers } = shapes;
  const objectShapes = Object.freeze({ ...readers, structuralImplementations(type: TargetTypeRef) {
    if (type.kind !== "target-named" || !sourceIds.has(type.id)) return noImplementations;
    const selected = byType.get(targetTypeRefKey(type));
    if (selected === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "C# structural forwarding has no sealed record for the selected native instantiation.");
    return selected;
  } });
  if (nativeIssues.length > 0) return rejectedTargetStage(nativeIssues);
  return resolvedTargetStage(Object.freeze({ issues: Object.freeze(issues), objectShapes,
    callableDispatch: Object.freeze({ get: (declaration: Node) => byDeclaration.get(declaration) }) }));

  function inheritanceBinding(key: string, metadataName: boolean, subject: Node): CsharpNativeTargetBindingFact | undefined {
    const cacheKey = `${metadataName ? "metadata" : "target"}:${key}`;
    if (nativeBindings.has(cacheKey)) return nativeBindings.get(cacheKey);
    const selected = metadataName ? policy.providers.findTargetBindingByMetadataName(key, "inheritance")
      : policy.providers.findTargetBindingByTargetId(key, "inheritance");
    if (selected.kind === "rejected") {
      nativeIssues.push(targetDiagnosticFromExtension(subject, selected.diagnostic));
      nativeBindings.set(cacheKey, undefined);
      return undefined;
    }
    nativeBindings.set(cacheKey, selected.binding);
    nativeBindings.set(`target:${selected.binding.id}`, selected.binding);
    return selected.binding;
  }

  function inheritedNativeMembers(owner: Node | undefined, subject: Node): readonly CsharpNativeInheritedMember[] | undefined {
    const definition = policy.projectTypes.catalog.definitionForDeclaration(owner);
    let base: TargetTypeRef | undefined = definition === undefined ? undefined : policy.projectTypes.catalog.targetTypeForDeclaration(
      definition.declaration, definition.typeParameterBindings);
    const visited = new Set<Node>();
    while (base !== undefined) {
      const project = policy.projectTypes.catalog.definitionForTarget(base);
      if (project === undefined) break;
      if (visited.has(project.declaration)) return failTargetAnalysisInvariant("tsonic-csharp",
        "An admitted native dispatch owner requires an acyclic completed class hierarchy.", subject);
      visited.add(project.declaration);
      const declaredBase = policy.projectTypes.heritageForDeclaration(project.declaration)?.baseType;
      if (declaredBase === undefined) { base = undefined; break; }
      const selected = policy.projectTypes.instantiateDeclarationType(project.declaration, base, declaredBase);
      if (selected.kind !== "resolved") {
        reject(subject, "An inherited callable has no exact instantiated native owner.");
        return undefined;
      }
      base = selected.type;
    }
    const shape = definition === undefined && owner !== undefined ? policy.objectShapes.resolveNode(owner, policy.ast.getSourceFile(owner)) : undefined;
    const valueType = definition?.kind === "struct" || shape?.targetType.kind === "target-named" &&
      "csharpValueType" in shape.targetType && shape.targetType.csharpValueType === true;
    const key = base === undefined ? `root:${valueType ? "struct" : "class"}` : targetTypeRefKey(base);
    if (nativeMembers.has(key)) return nativeMembers.get(key);
    if (base !== undefined && base.kind !== "target-named") {
      reject(subject, "An inherited callable has no exact named native owner.");
      return undefined;
    }
    const lookup = base === undefined ? undefined : csharpNativeInheritanceLookup(base);
    const binding = lookup === undefined ? inheritanceBinding(valueType ? "System.ValueType" : "System.Object", true, subject)
      : lookup.kind === "metadata-name" ? inheritanceBinding(lookup.metadataName, true, subject)
      : inheritanceBinding(lookup.targetId, false, subject);
    if (binding === undefined) { nativeMembers.set(key, undefined); return undefined; }
    const substitutions = base?.kind === "target-named"
      ? new Map((binding.typeParameters ?? []).map((parameter, index) => [parameter.identity, base.typeArguments![index]!]))
      : new Map<string, TargetTypeRef>();
    const members: CsharpNativeInheritedMember[] = [];
    for (const entry of binding.csharpInheritance) {
      const declaration = entry.targetId === binding.id ? binding : inheritanceBinding(entry.targetId, false, subject);
      if (declaration === undefined) { nativeMembers.set(key, undefined); return undefined; }
      const type = substituteTargetTypeParameters(entry.type, substitutions);
      if (type.kind !== "target-named") return failTargetAnalysisInvariant("tsonic-csharp",
        "Acquired native inheritance requires exact constructed named class identities.", subject);
      const parameters = new Map((declaration.typeParameters ?? []).map((parameter, index) =>
        [parameter.identity, type.typeArguments![index]!]));
      const instantiate = (type: TargetTypeRef): TargetTypeRef => substituteTargetTypeParameters(type, parameters);
      members.push(...declaration.csharpInheritableMembers.map(member => Object.freeze({ ...member,
        parameters: Object.freeze(member.parameters.map(parameter => Object.freeze({ ...parameter, type: instantiate(parameter.type) }))),
        dispatchSlots: Object.freeze(member.dispatchSlots.map(slot => Object.freeze({ ...slot,
          parameters: Object.freeze(slot.parameters.map(parameter => Object.freeze({ ...parameter, type: instantiate(parameter.type) }))),
          returnType: instantiate(slot.returnType) }))) })));
    }
    const completed = Object.freeze(members);
    nativeMembers.set(key, completed);
    return completed;
  }

  function overridesNativeMethod(declaration: Node, implementation: SourceCallableSourceContract, owner: Node | undefined): boolean {
    const selectedName = native.names.resolve(policy.ast.name(declaration));
    if (selectedName.kind !== "resolved") return false;
    const name = selectedName.name.startsWith("@") ? selectedName.name.slice(1) : selectedName.name;
    const inherited = inheritedNativeMembers(owner, declaration);
    if (inherited === undefined) return false;
    for (const member of inherited) {
      if (member.targetName !== name) continue;
      if (member.kind !== "method") return false;
      if (member.static) continue;
      for (const slot of member.dispatchSlots) {
        if (slot.kind !== "method" || slot.genericParameterIds.length !== implementation.nativeSignature.methodTypeParameterIdentities.length ||
          slot.parameters.length !== implementation.nativeParameters.length) continue;
        const substitutions = new Map<string, TargetTypeRef>(slot.genericParameterIds.map((identity, index) => [identity,
          { kind: "type-parameter", identity: implementation.nativeSignature.methodTypeParameterIdentities[index]!, name: "T" }]));
        if (!slot.parameters.every((parameter, index) => parameter.passingMode === implementation.nativeParameters[index]!.targetParameter.passingMode &&
          csharpTargetStorageIdentityEquals(substituteTargetTypeParameters(parameter.type, substitutions),
            implementation.nativeParameters[index]!.targetParameter.type))) continue;
        if (!slot.virtual || slot.final || slot.returnPassing !== "by-value") return false;
        return nativeReturnAccepted(implementation.returnType, slot, substitutions);
      }
    }
    return false;
  }

  function overridesNativeProperty(declaration: Node, owner: Node, readonly: boolean): boolean {
    const selectedName = native.names.resolve(policy.ast.name(declaration));
    if (selectedName.kind !== "resolved") return false;
    const name = selectedName.name.startsWith("@") ? selectedName.name.slice(1) : selectedName.name;
    const inherited = inheritedNativeMembers(owner, declaration);
    if (inherited === undefined) return false;
    const sourceProperty = policy.ast.is.IsPropertyDeclaration(declaration) || sourceParameterIsProperty(policy.ast, declaration);
    const getter = sourceProperty || policy.ast.is.IsGetAccessorDeclaration(declaration);
    const setter = sourceProperty && !readonly || policy.ast.is.IsSetAccessorDeclaration(declaration);
    for (const member of inherited) {
      if (member.targetName !== name) continue;
      if (member.kind !== "property" || member.static || member.parameters.length !== 0) return false;
      const type = native.storage.storageType.get(declaration);
      if (type === undefined) {
        reject(declaration, "An inherited property has no exact completed native storage carrier.");
        return false;
      }
      const accepts = (kind: "get" | "set"): boolean => member.dispatchSlots.some(slot => {
        if (slot.kind !== kind || !slot.virtual || slot.final || slot.returnPassing !== "by-value") return false;
        return kind === "get" ? nativeReturnAccepted(type, slot, new Map()) : slot.parameters.length === 1 &&
          slot.parameters[0]!.passingMode === "by-value" && csharpTargetStorageIdentityEquals(type, slot.parameters[0]!.type);
      });
      return (!getter || accepts("get")) && (!setter || accepts("set"));
    }
    return false;
  }

  function nativeReturnAccepted(type: TargetTypeRef, slot: CsharpNativeInheritedDispatchSlot,
    substitutions: ReadonlyMap<string, TargetTypeRef>): boolean {
    const target = substituteTargetTypeParameters(slot.returnType, substitutions);
    return csharpTargetStorageIdentityEquals(type, target) || namedTargetTypeImplicitlyAccepts(policy, type, target, new Set());
  }

  function interfaceRequest(type: TargetTypeRef, selected: CsharpStructuralInterfaceImplementation): MethodRequest {
    const key = targetTypeRefKey(type);
    let owner = requests.get(key);
    if (owner === undefined) {
      owner = { type, interfaces: new Map() };
      requests.set(key, owner);
    }
    const interfaceKey = targetTypeRefKey(selected.interfaceType);
    let request = owner.interfaces.get(interfaceKey);
    if (request === undefined) {
      request = { selected, methods: new Map(), rejected: new Set() };
      owner.interfaces.set(interfaceKey, request);
    }
    return request;
  }

  function addMethod(request: MethodRequest, method: StructuralMethod): void {
    const destinationOwner = policy.projectTypes.catalog.definitionForTarget(request.selected.interfaceType);
    let contract: CsharpStructuralMethodForwarding["contract"];
    let nativeContract: SourceCallableSourceContract | undefined;
    if (destinationOwner?.kind === "interface") {
      const destinationDeclarations = method.member.sourceDeclarations?.filter(declaration => policy.ast.parent(declaration) === destinationOwner.declaration) ?? [];
      const original = destinationDeclarations.length === 1 ? callables.get({ kind: "declaration", declaration: destinationDeclarations[0]! }) : undefined;
      const selected = original === undefined ? undefined
        : instantiateCsharpInheritedCallable(policy, original, original, request.selected.interfaceType);
      if (selected === undefined) {
        refuse(method.declaration);
        return;
      }
      contract = Object.freeze({ nativeParameters: selected.nativeParameters, returnType: selected.returnType });
      nativeContract = selected;
    } else {
      const signature = getCsharpDelegateSignature(method.member.type);
      if (signature === undefined || !csharpDelegateSignatureHasSupportedPassingModes(signature)) {
        refuse(method.declaration);
        return;
      }
      const parameters: readonly CsharpTargetParameter[] = Object.freeze(signature.parameters.map((type, index) => Object.freeze({
        name: `argument${index}`, type, passingMode: signature.parameterPassingModes[index]!,
        ...(signature.restParameterIndex === index ? { paramsArray: true } : {}),
        ...(signature.optionalParameterIndexes?.includes(index) === true ? { optional: true } : {}),
      })));
      contract = Object.freeze({ nativeParameters: Object.freeze(parameters.map(targetParameter => Object.freeze({ targetParameter }))),
        returnType: signature.returnType });
      const identities = method.member.typeParameters?.map(parameter => parameter.identity) ?? [];
      const contracts = new Map<Node, SourceCallableSourceContract>();
      for (const declaration of new Set(method.member.sourceDeclarations ?? [])) {
        const selected = callables.get({ kind: "declaration", declaration });
        if (selected !== undefined && selected.nativeSignature.methodTypeParameterIdentities.length === identities.length &&
          selected.nativeSignature.methodTypeParameterIdentities.every((identity, index) => identity === identities[index])) {
          contracts.set(selected.sourceDeclaration, selected);
        }
      }
      if (contracts.size === 1) nativeContract = contracts.values().next().value;
    }
    const typeParameters = nativeContract === undefined ? (method.member.typeParameters?.length ?? 0) === 0 ? Object.freeze([]) : undefined
      : nativeParameters(method.member, nativeContract);
    if (typeParameters === undefined) {
      reject(method.declaration, "An interface method has no exact native generic constraint or anti-constraint evidence.");
      return;
    }
    const binders = new Map(typeParameters.map((parameter, index) => [parameter.identity, index]));
    const key = JSON.stringify([method.member.targetName, binders.size,
      contract.nativeParameters.map(({ targetParameter }) => [scopedTargetTypeRefKey(targetParameter.type, binders),
        targetParameter.passingMode, targetParameter.paramsArray === true, targetParameter.optional === true]),
      scopedTargetTypeRefKey(contract.returnType, binders)]);
    if (request.rejected.has(key)) return;
    const existing = request.methods.get(key);
    if (existing !== undefined && (existing.method.declaration !== method.declaration || existing.method.sourceName !== method.sourceName)) {
      request.methods.delete(key);
      request.rejected.add(key);
      reject(request.selected.sourceNode, "An interface callable has contradictory checked native implementation correspondence.");
    } else if (existing === undefined) request.methods.set(key, { method, contract, typeParameters, nativeContract });
  }

  function nativeParameters(
    member: StructuralMethod["member"] | undefined, contract: SourceCallableSourceContract,
  ): readonly NativeParameter[] | undefined {
    const permissions = contract.nativeSignature.methodAllowsRefLikeTypeArguments;
    if (!Array.isArray(permissions) || permissions.length !== contract.nativeSignature.methodTypeParameterIdentities.length ||
      Object.keys(permissions).length !== permissions.length || permissions.some(allowed => typeof allowed !== "boolean")) return undefined;
    const projected = new Map(projections.get(contract.sourceDeclaration).map(parameter => [parameter.identity, parameter]));
    const selected: readonly NativeParameter[] = Object.freeze((member?.typeParameters ?? []).map(parameter => {
      const projection = projected.get(parameter.identity);
      const constraints = Object.freeze({ kind: "resolved" as const, constraints: parameter.constraints });
      return projection === undefined ? Object.freeze({
        kind: "type-parameter" as const, identity: parameter.identity, name: parameter.name,
        csharpDeclaration: parameter.declaration, csharpConstraints: constraints,
      }) : Object.freeze({ ...projection, csharpProjectionConstraints: parameter.constraints, csharpConstraints: constraints });
    }));
    return selected.length === contract.nativeSignature.methodTypeParameterIdentities.length &&
      selected.every((parameter, index) => parameter.identity === contract.nativeSignature.methodTypeParameterIdentities[index]) ? selected : undefined;
  }

  function nativeBaseProvides(type: TargetTypeRef, destination: TargetTypeRef): boolean {
    if (type.kind !== "target-named" || (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "class") return false;
    const owner = policy.projectTypes.catalog.definitionForTarget(type);
    if (owner === undefined) return false;
    const heritage = policy.projectTypes.heritageForDeclaration(owner.declaration);
    if (heritage?.baseType === undefined) return false;
    const instantiate = (inherited: TargetTypeRef): TargetTypeRef | undefined => {
      const selected = policy.projectTypes.instantiateDeclarationType(owner.declaration, type, inherited);
      return selected.kind === "resolved" ? selected.type : undefined;
    };
    if (heritage.interfaces.some(inherited => {
      const selected = instantiate(inherited);
      return selected !== undefined && namedTargetTypeImplicitlyAccepts(policy, selected, destination, new Set());
    })) return false;
    const base = instantiate(heritage.baseType);
    return base !== undefined && namedTargetTypeImplicitlyAccepts(policy, base, destination, new Set());
  }

  function refuse(node: Node): void {
    issues.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST",
      message: "An analyzed interface method has no exact native forwarding signature." }));
  }

  function reject(node: Node, message: string): void {
    issues.push(Object.freeze({ node, code: "CSHARP_PROJECT_CALLABLE_ADAPTER_NOT_PROVEN", message }));
  }
}
