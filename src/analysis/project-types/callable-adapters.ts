import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceCallableContract } from "../../policy/types/callables/source-callable-contract.js";
import { isCsharpSourceCallableArtifactDeclaration } from "../../policy/types/callables/source-callable-contract.js";
import { substituteTargetTypeParameters } from "../../policy/types/callables/substitution.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpCallableContractIndex } from "../callables/model.js";
import { selectCsharpCallableParameterAdapters, selectCsharpCallableValueAdapter,
  type CsharpCallableParameterAdapter, type CsharpCallableValueAdapter } from "../callables/adapters.js";
import type { CsharpProjectTypeIssue } from "../../policy/types/project/project-types.js";

export interface CsharpProjectCallableAdapter {
  readonly contract: CsharpSourceCallableContract;
  readonly parameters: readonly CsharpCallableParameterAdapter[];
  readonly result: CsharpCallableValueAdapter;
  readonly interfaceType?: TargetTypeRef;
}

export interface CsharpProjectCallableDispatch {
  readonly overridesBase: boolean;
  readonly hasDerivedOverride: boolean;
  readonly implementation: CsharpSourceCallableContract;
  readonly adapters: readonly CsharpProjectCallableAdapter[];
}

export interface CsharpProjectCallableAdapters {
  readonly issues: readonly CsharpProjectTypeIssue[];
  get(declaration: Node): CsharpProjectCallableDispatch | undefined;
}

export function analyzeCsharpProjectCallableAdapters(
  policy: CsharpPolicyContext, callables: CsharpCallableContractIndex,
): CsharpProjectCallableAdapters {
  const byDeclaration = new Map<Node, CsharpProjectCallableDispatch>();
  const issues: CsharpProjectTypeIssue[] = [];
  for (const implementation of callables.declarationContracts) {
    const declaration = implementation.sourceDeclaration;
    if (!policy.ast.is.IsMethodDeclaration(declaration) || policy.ast.hasModifierKind(declaration, "static")) continue;
    const owner = policy.projectTypes.catalog.definitionContainingDeclaration(declaration);
    if (owner === undefined) continue;
    const inherited = policy.navigation.memberContracts(declaration);
    if (inherited.kind !== "resolved") {
      reject(declaration, inherited.reason);
      continue;
    }
    const receiver = policy.projectTypes.catalog.targetTypeForDeclaration(owner.declaration, owner.typeParameterBindings);
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
      const contractOwner = policy.projectTypes.catalog.definitionContainingDeclaration(contractDeclaration);
      if (contractOwner === undefined) continue;
      if (contractOwner.kind === "class") hasProjectBaseContract = true;
      const contract = instantiateContract(policy, original, implementation, receiver);
      if (contract === undefined) { reject(declaration, "An inherited callable has no exact instantiated native signature."); continue; }
      const interfaceType = contractOwner.kind !== "interface" ? undefined : policy.projectTypes.catalog.targetTypeForDeclaration(
        contractOwner.declaration, contractOwner.typeParameterBindings);
      const instantiatedInterface = interfaceType === undefined ? undefined : policy.projectTypes.instantiateDeclarationType(
        contractOwner.declaration, receiver, interfaceType);
      const selectedInterface = instantiatedInterface?.kind === "resolved" ? instantiatedInterface.type : undefined;
      if (interfaceType !== undefined && selectedInterface === undefined) { reject(declaration, "An interface callable has no exact native owner."); continue; }
      const key = `${selectedInterface === undefined ? "class" : targetTypeRefKey(selectedInterface)}:${contract.parameters.map(parameter =>
        `${parameter.targetParameter.passingMode}:${targetTypeRefKey(parameter.targetParameter.type)}`).join(";")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sameParameters = contract.parameters.length === implementation.parameters.length && contract.parameters.every((parameter, index) =>
        parameter.targetParameter.passingMode === implementation.parameters[index]!.targetParameter.passingMode &&
        targetTypeRefEquals(parameter.targetParameter.type, implementation.parameters[index]!.targetParameter.type));
      const result = selectCsharpCallableValueAdapter(policy, implementation.returnType, contract.returnType);
      if (sameParameters) {
        const nativeReturn = result?.conversion.kind === "identity" || result?.conversion.kind === "implicit" &&
          result.conversion.proof === "reference";
        if (!nativeReturn) reject(declaration, "An inherited callable requires a native return adaptation without a distinct parameter signature.");
        else if (selectedInterface === undefined) overridesBase = true;
        continue;
      }
      const parameters = selectCsharpCallableParameterAdapters(policy, contract.parameters.map(parameter => parameter.targetParameter),
        implementation.parameters.map(parameter => parameter.targetParameter));
      if (parameters === undefined || result === undefined) {
        reject(declaration, "An inherited callable requires an exact logical-argument and native-result adaptation.");
        continue;
      }
      adapters.push(Object.freeze({ contract, parameters, result,
        ...(selectedInterface === undefined ? {} : { interfaceType: selectedInterface }) }));
    }
    const dispatch = policy.navigation.memberDispatch(declaration);
    byDeclaration.set(declaration, Object.freeze({ implementation,
      overridesBase: hasProjectBaseContract ? overridesBase : dispatch?.overridesBase === true,
      hasDerivedOverride: dispatch?.hasDerivedOverride === true,
      adapters: Object.freeze(adapters) }));
  }
  return Object.freeze({ issues: Object.freeze(issues), get: (declaration: Node) => byDeclaration.get(declaration) });

  function reject(node: Node, message: string): void {
    issues.push(Object.freeze({ node, code: "CSHARP_PROJECT_CALLABLE_ADAPTER_NOT_PROVEN", message }));
  }
}

function instantiateContract(
  policy: CsharpPolicyContext, source: CsharpSourceCallableContract, implementation: CsharpSourceCallableContract,
  receiver: TargetTypeRef | undefined,
): CsharpSourceCallableContract | undefined {
  if (source.methodTypeParameterIdentities.length !== implementation.methodTypeParameterIdentities.length) return undefined;
  const typeParameters = policy.ast.typeParameters(implementation.sourceDeclaration).map(parameter => parameter === undefined ? undefined
    : csharpSourceTypeParameter(parameter, policy.ast));
  if (typeParameters.length !== source.methodTypeParameterIdentities.length || typeParameters.some(parameter => parameter === undefined)) return undefined;
  const substitutions = new Map(source.methodTypeParameterIdentities.map((identity, index) => [identity, typeParameters[index]!]));
  const instantiate = (type: TargetTypeRef): TargetTypeRef | undefined => {
    const selected = policy.projectTypes.instantiateMemberType(source.sourceDeclaration, receiver, type);
    return selected.kind === "resolved" ? substituteTargetTypeParameters(selected.type, substitutions) : undefined;
  };
  const result = instantiate(source.returnType);
  const parameters = source.parameters.map(parameter => {
    const type = instantiate(parameter.targetParameter.type);
    return type === undefined ? undefined : Object.freeze({ ...parameter, targetParameter: Object.freeze({ ...parameter.targetParameter, type }) });
  });
  return result === undefined || parameters.some(parameter => parameter === undefined) ? undefined : Object.freeze({
    ...source, methodTypeParameterIdentities: implementation.methodTypeParameterIdentities, returnType: result,
    parameters: Object.freeze(parameters as CsharpSourceCallableContract["parameters"][number][]),
  });
}
