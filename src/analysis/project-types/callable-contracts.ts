import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceCallableContract } from "../../policy/types/callables/source-callable-contract.js";
import { selectCsharpCallableValueAdapter } from "../callables/adapters.js";
import { csharpCallableParametersEqual, instantiateCsharpInheritedCallable } from "../callables/instantiation.js";

export function closeCsharpProjectCallableContracts(
  policy: CsharpPolicyContext, contracts: readonly CsharpSourceCallableContract[],
): readonly CsharpSourceCallableContract[] {
  const original = new Map(contracts.map(contract => [contract.sourceDeclaration, contract]));
  const resolved = new Map<Node, CsharpSourceCallableContract>();
  const active = new Set<Node>();
  return Object.freeze(contracts.map(resolve));

  function resolve(implementation: CsharpSourceCallableContract): CsharpSourceCallableContract {
    const declaration = implementation.sourceDeclaration;
    const cached = resolved.get(declaration);
    if (cached !== undefined) return cached;
    if (active.has(declaration)) throw new Error("Checked project callable inheritance contains a cycle.");
    if (!policy.ast.is.IsMethodDeclaration(declaration) || policy.ast.hasModifierKind(declaration, "static")) return implementation;
    const owner = policy.projectTypes.catalog.definitionForDeclaration(policy.ast.parent(declaration));
    if (owner?.kind !== "class") return implementation;
    active.add(declaration);
    let selected = implementation;
    const inherited = policy.navigation.memberContracts(declaration);
    const receiver = policy.projectTypes.catalog.targetTypeForDeclaration(owner.declaration, owner.typeParameterBindings);
    for (const baseDeclaration of inherited.kind === "resolved" ? inherited.contracts : []) {
      const baseOwner = policy.projectTypes.catalog.definitionForDeclaration(policy.ast.parent(baseDeclaration));
      const base = original.get(baseDeclaration);
      if (baseOwner?.kind !== "class" || base === undefined) continue;
      const contract = instantiateCsharpInheritedCallable(policy, resolve(base), implementation, receiver);
      if (contract === undefined || !csharpCallableParametersEqual(contract, implementation)) continue;
      const result = selectCsharpCallableValueAdapter(policy, selected.returnType, contract.returnType);
      if (result !== undefined && result.conversion.kind !== "identity" &&
        !(result.conversion.kind === "implicit" && result.conversion.proof === "reference")) {
        selected = Object.freeze({ ...selected, sourceReturnType: implementation.returnType, returnType: contract.returnType });
      }
    }
    active.delete(declaration);
    resolved.set(declaration, selected);
    return selected;
  }
}
