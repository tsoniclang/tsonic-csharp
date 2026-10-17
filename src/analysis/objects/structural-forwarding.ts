import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeAnalysis, CsharpObjectShapeClassifications } from "./model.js";
import type { CsharpProjectCallableAdapters } from "../../target-model/records/callable-adapters.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpFinalStructuralInterfaceImplementation, CsharpStructuralMethodForwarding } from "../../target-model/records/heritage.js";
import type { CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { admitCsharpCallableParameterAdapters, admitCsharpCallableResultAdapter } from "../callables/adapters.js";
import { instantiateCsharpInheritedCallable } from "../callables/instantiation.js";

const noImplementations: readonly CsharpFinalStructuralInterfaceImplementation[] = Object.freeze([]);

export function finalizeCsharpStructuralInterfaceForwarding(
  policy: CsharpPolicyContext,
  shapes: CsharpObjectShapeAnalysis,
  callables: CsharpProjectCallableAdapters,
  declarations: CsharpDeclarationClassifications,
): {
  readonly objectShapes: CsharpObjectShapeClassifications<CsharpFinalStructuralInterfaceImplementation>;
  readonly issues: readonly CsharpProjectTypeIssue[];
} {
  const byType = new Map<string, readonly CsharpFinalStructuralInterfaceImplementation[]>();
  const sourceIds = new Set<string>();
  const issues: CsharpProjectTypeIssue[] = [];
  for (const type of shapes.structuralImplementationTypes) {
    const implementations: CsharpFinalStructuralInterfaceImplementation[] = [];
    for (const selected of shapes.structuralImplementations(type)) {
      const methods: CsharpFinalStructuralInterfaceImplementation["methods"][number][] = [];
      for (const method of selected.methods) {
        const original = callables.callableDispatch.get(method.declaration)?.implementation;
        const owner = policy.projectTypes.catalog.definitionForDeclaration(policy.ast.parent(method.declaration));
        const implementation = original === undefined || owner === undefined || owner.typeParameterBindings.length === 0 ? original
          : instantiateCsharpInheritedCallable(policy, original, original, selected.sourceType);
        const signature = getCsharpDelegateSignature(method.member.type);
        if (implementation === undefined || signature === undefined || !csharpDelegateSignatureHasSupportedPassingModes(signature)) {
          refuse(method.declaration);
          continue;
        }
        const parameters: CsharpTargetParameter[] = signature.parameters.map((type, index) => Object.freeze({
          name: `argument${index}`, type, passingMode: signature.parameterPassingModes[index]!,
          ...(signature.restParameterIndex === index ? { paramsArray: true } : {}),
          ...(signature.optionalParameterIndexes?.includes(index) === true ? { optional: true } : {}),
        }));
        const contract: CsharpStructuralMethodForwarding["contract"] = Object.freeze({
          parameters: Object.freeze(parameters.map(targetParameter => Object.freeze({ targetParameter }))),
          returnType: signature.returnType,
        });
        const incoming = implementation.parameters.map(parameter => parameter.targetParameter);
        const adapters = admitCsharpCallableParameterAdapters(policy, parameters, incoming);
        const result = admitCsharpCallableResultAdapter(policy, implementation, signature.returnType);
        if (adapters === undefined || result === undefined) {
          refuse(method.declaration);
          continue;
        }
        const forwarding: CsharpStructuralMethodForwarding = Object.freeze({ contract, implementation,
          parameterDefaults: Object.freeze(implementation.parameters.map(parameter => declarations.runtimeDefault.get(parameter.sourceParameter))),
          parameters: adapters, result,
        });
        methods.push(Object.freeze({ ...method, forwarding }));
      }
      implementations.push(Object.freeze({ ...selected, methods: Object.freeze(methods) }));
    }
    byType.set(targetTypeRefKey(type), Object.freeze(implementations));
    if (type.kind === "target-named") sourceIds.add(type.id);
  }
  const { structuralImplementationTypes: _types, structuralImplementations: _logical, ...readers } = shapes;
  const objectShapes = Object.freeze({ ...readers, structuralImplementations(type: TargetTypeRef) {
    if (type.kind !== "target-named" || !sourceIds.has(type.id)) return noImplementations;
    const selected = byType.get(targetTypeRefKey(type));
    if (selected === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "C# structural forwarding has no sealed record for the selected native instantiation.");
    return selected;
  } });
  return Object.freeze({ objectShapes, issues: Object.freeze(issues) });

  function refuse(node: import("@tsonic/tsts").Node): void {
    issues.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST",
      message: "An analyzed interface method has no exact native forwarding signature." }));
  }
}
