import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { namedTargetTypeImplicitlyAccepts } from "../../policy/conversions/carriers.js";
import { isCsharpSourceCallableArtifactDeclaration } from "../../policy/types/callables/source-callable-contract.js";
import type { CsharpProjectCallableAdapter, CsharpProjectCallableAdapters, CsharpProjectCallableDispatch } from "../../target-model/records/callable-adapters.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpFinalStructuralInterfaceImplementation, CsharpStructuralMethodForwarding } from "../../target-model/records/heritage.js";
import type { CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";
import type { CsharpSourceCallableContract } from "../../target-model/records/source-callable-contract.js";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { scopedTargetTypeRefKey, targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import type { CsharpStructuralInterfaceImplementation, CsharpTargetNamedTypeRef, CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { admitCsharpCallableParameterAdapters, admitCsharpCallableResultAdapter, type CsharpCallableConversionPolicy } from "../callables/adapters.js";
import { csharpCallableParametersEqual, instantiateCsharpInheritedCallable } from "../callables/instantiation.js";
import type { CsharpCallableContractIndex } from "../callables/model.js";
import type { CsharpObjectShapeAnalysis, CsharpObjectShapeClassifications } from "../objects/model.js";
import { finalizeCsharpStructuralInterfaceForwarding } from "../objects/structural-forwarding.js";

type StructuralMethod = CsharpStructuralInterfaceImplementation["methods"][number];
type FinalMethod = CsharpFinalStructuralInterfaceImplementation["methods"][number];
type MethodRequest = {
  readonly selected: CsharpStructuralInterfaceImplementation;
  readonly methods: Map<string, { readonly method: StructuralMethod; readonly contract: CsharpStructuralMethodForwarding["contract"] }>;
  readonly rejected: Set<string>;
};

const noImplementations: readonly CsharpFinalStructuralInterfaceImplementation[] = Object.freeze([]);

export function analyzeCsharpProjectCallableAdapters(
  policy: Pick<CsharpPolicyContext, "ast" | "navigation"> & CsharpCallableConversionPolicy,
  callables: CsharpCallableContractIndex,
  shapes: CsharpObjectShapeAnalysis,
  declarations: Pick<CsharpDeclarationClassifications, "runtimeDefault">,
): CsharpProjectCallableAdapters & {
  readonly objectShapes: CsharpObjectShapeClassifications<CsharpFinalStructuralInterfaceImplementation>;
} {
  const byDeclaration = new Map<Node, CsharpProjectCallableDispatch>();
  const requests = new Map<string, { readonly type: TargetTypeRef; readonly interfaces: Map<string, MethodRequest> }>();
  const issues: CsharpProjectTypeIssue[] = [...shapes.issues];
  for (const type of shapes.structuralImplementationTypes) {
    for (const selected of shapes.structuralImplementations(type)) {
      const request = interfaceRequest(type, selected);
      for (const method of selected.methods) addMethod(request, method);
    }
  }
  for (const implementation of callables.declarationContracts) {
    const declaration = implementation.sourceDeclaration;
    if (!policy.ast.is.IsMethodDeclaration(declaration) || policy.ast.hasModifierKind(declaration, "static")) continue;
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
      hasProjectBaseContract = true;
      const contract = instantiateCsharpInheritedCallable(policy, original, implementation, receiver);
      if (contract === undefined) { reject(declaration, "An inherited callable has no exact instantiated native signature."); continue; }
      const key = contract.parameters.map(parameter =>
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
      const parameters = admitCsharpCallableParameterAdapters(policy, contract.parameters.map(parameter => parameter.targetParameter),
        implementation.parameters.map(parameter => parameter.targetParameter));
      if (parameters === undefined || result === undefined) {
        reject(declaration, "An inherited callable requires an exact logical-argument and native-result adaptation.");
        continue;
      }
      adapters.push(Object.freeze({ contract, parameters, result }));
    }
    const dispatch = objectMethod ? undefined : policy.navigation.memberDispatch(declaration);
    byDeclaration.set(declaration, Object.freeze({ implementation,
      overridesBase: hasProjectBaseContract ? overridesBase : dispatch?.overridesBase === true,
      hasDerivedOverride: dispatch?.hasDerivedOverride === true, adapters: Object.freeze(adapters) }));
  }
  const byType = new Map<string, readonly CsharpFinalStructuralInterfaceImplementation[]>();
  const sourceIds = new Set<string>();
  for (const [key, owner] of requests) {
    const implementations: CsharpFinalStructuralInterfaceImplementation[] = [];
    for (const request of owner.interfaces.values()) {
      const methods: FinalMethod[] = [];
      for (const { method, contract } of request.methods.values()) {
        if (nativeBaseProvides(owner.type, request.selected.interfaceType)) continue;
        const original = callables.get({ kind: "declaration", declaration: method.declaration });
        const declaringOwner = policy.projectTypes.catalog.definitionForDeclaration(policy.ast.parent(method.declaration));
        const instantiated = original === undefined || declaringOwner === undefined || declaringOwner.typeParameterBindings.length === 0
          ? original : instantiateCsharpInheritedCallable(policy, original, original, request.selected.sourceType);
        const binders = method.member.typeParameters ?? [];
        if (instantiated === undefined ||
          instantiated.methodTypeParameterIdentities.length !== 0 && instantiated.methodTypeParameterIdentities.length !== binders.length) {
          refuse(method.declaration);
          continue;
        }
        const typeArguments: readonly TargetTypeRef[] = Object.freeze(instantiated.methodTypeParameterIdentities.map((_identity, index) => {
          const binder = binders[index]!;
          return Object.freeze({ kind: "type-parameter" as const, identity: binder.identity, name: binder.name,
            csharpDeclaration: binder.declaration,
            csharpConstraints: Object.freeze({ kind: "resolved" as const, constraints: binder.constraints }) });
        }));
        const substitutions = new Map(instantiated.methodTypeParameterIdentities.map((identity, index) => [identity, typeArguments[index]!]));
        const implementation: CsharpSourceCallableContract = substitutions.size === 0 ? instantiated : Object.freeze({ ...instantiated,
          parameters: Object.freeze(instantiated.parameters.map(parameter => Object.freeze({ ...parameter,
            targetParameter: Object.freeze({ ...parameter.targetParameter,
              type: substituteTargetTypeParameters(parameter.targetParameter.type, substitutions) }) }))),
          returnType: substituteTargetTypeParameters(instantiated.returnType, substitutions),
          ...(instantiated.sourceReturnType === undefined ? {} : {
            sourceReturnType: substituteTargetTypeParameters(instantiated.sourceReturnType, substitutions) }),
        });
        const incoming = contract.parameters.map(parameter => parameter.targetParameter);
        const parameters = admitCsharpCallableParameterAdapters(policy, incoming,
          implementation.parameters.map(parameter => parameter.targetParameter));
        const result = admitCsharpCallableResultAdapter(policy, implementation, contract.returnType);
        if (parameters === undefined || result === undefined) {
          refuse(method.declaration);
          continue;
        }
        const parent = policy.ast.parent(method.declaration);
        const nativeMethod = declaringOwner?.kind === "class" || parent !== undefined && policy.ast.is.IsObjectLiteralExpression(parent);
        const sameSignature = nativeMethod && !policy.ast.hasModifierKind(method.declaration, "private") &&
          !policy.ast.hasModifierKind(method.declaration, "protected") && method.sourceName === method.member.targetName &&
          implementation.methodTypeParameterIdentities.length === binders.length &&
          implementation.parameters.length === incoming.length && implementation.parameters.every((parameter, index) =>
            parameter.targetParameter.passingMode === incoming[index]!.passingMode &&
            targetTypeRefEquals(parameter.targetParameter.type, incoming[index]!.type)) &&
          targetTypeRefEquals(implementation.returnType, contract.returnType);
        if (sameSignature && result.conversion.kind === "identity") continue;
        methods.push(Object.freeze({ ...method, forwarding: Object.freeze({ contract, implementation, typeArguments,
          parameterDefaults: Object.freeze(implementation.parameters.map(parameter => declarations.runtimeDefault.get(parameter.sourceParameter))),
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
  return Object.freeze({ issues: Object.freeze(issues), objectShapes,
    callableDispatch: Object.freeze({ get: (declaration: Node) => byDeclaration.get(declaration) }) });

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
    if (destinationOwner?.kind === "interface") {
      const destinationDeclarations = method.member.sourceDeclarations?.filter(declaration => policy.ast.parent(declaration) === destinationOwner.declaration) ?? [];
      const original = destinationDeclarations.length === 1 ? callables.get({ kind: "declaration", declaration: destinationDeclarations[0]! }) : undefined;
      const selected = original === undefined ? undefined
        : instantiateCsharpInheritedCallable(policy, original, original, request.selected.interfaceType);
      if (selected === undefined) {
        refuse(method.declaration);
        return;
      }
      contract = Object.freeze({ parameters: selected.parameters, returnType: selected.returnType });
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
      contract = Object.freeze({ parameters: Object.freeze(parameters.map(targetParameter => Object.freeze({ targetParameter }))),
        returnType: signature.returnType });
    }
    const binders = new Map((method.member.typeParameters ?? []).map((parameter, index) => [parameter.identity, index]));
    const key = JSON.stringify([method.member.targetName, binders.size,
      contract.parameters.map(({ targetParameter }) => [scopedTargetTypeRefKey(targetParameter.type, binders),
        targetParameter.passingMode, targetParameter.paramsArray === true, targetParameter.optional === true]),
      scopedTargetTypeRefKey(contract.returnType, binders)]);
    if (request.rejected.has(key)) return;
    const existing = request.methods.get(key);
    if (existing !== undefined && (existing.method.declaration !== method.declaration || existing.method.sourceName !== method.sourceName)) {
      request.methods.delete(key);
      request.rejected.add(key);
      reject(request.selected.sourceNode, "An interface callable has contradictory checked native implementation correspondence.");
    } else if (existing === undefined) request.methods.set(key, { method, contract });
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
