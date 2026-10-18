import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { TryStatement_FinallyBlock, sourceControlTransferTarget, sourceEnclosingCallable,
  type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpNativeParticipationInput, CsharpNativeUseClassifications } from "../../target-model/records/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { selectCsharpForInKeyBinding, selectCsharpForOfBinding } from "../../policy/operations/iteration/selection.js";
import type { CsharpAdmittedIteration, CsharpForInKeyBinding, CsharpForOfBinding,
  CsharpResolvedIteration } from "../../target-model/records/selection.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";

export function admitCsharpIterationBindings(
  policy: CsharpPolicyContext,
  nodes: readonly Node[],
  nativeUse: CsharpNativeUseClassifications["nativeUse"],
  operations: CsharpTargetOperationClassifications,
  storage: Pick<CsharpStorageClassifications, "storageType">,
  participation: CsharpNativeParticipationInput["participation"],
  metadata: CsharpSourceEvidenceIndex["compileTimeMetadata"],
): { readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration>;
  readonly issues: readonly TargetDiagnostic[] } {
  const iterations = new Map<Node, CsharpAdmittedIteration>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
      sourceNode: node, message }));
  };
  const admitConversion = (
    selected: CsharpResolvedIteration, binding: CsharpForInKeyBinding | CsharpForOfBinding,
  ): CsharpConversionSelection | undefined => {
    const conversion = admitCsharpConversionSelection(policy, selected.elementType, binding.storageType, binding.conversion);
    if (conversion.kind === "rejected") {
      refuse(binding.node, conversion.reason);
      return undefined;
    }
    return Object.freeze(conversion);
  };
  for (const node of nodes) {
    if (nativeUse.order(node) === undefined || metadata.get(node) ||
      operations.nativeUnreachable.get(node) || participation.get(node) === "erased" ||
      !policy.ast.is.IsForInStatement(node) && !policy.ast.is.IsForOfStatement(node)) continue;
    const selected = operations.iteration.get(node);
    if (selected === undefined || selected.kind === "rejected") {
      const statement = policy.ast.as.AsForInOrOfStatement(node);
      refuse(statement?.Expression ?? statement?.Initializer ?? node, selected?.reason ??
        `C# planning received a ${policy.ast.is.IsForInStatement(node) ? "for-in" : "for-of"} statement without a sealed target classification.`);
      continue;
    }
    if (selected.iterationKind === "for-in") {
      const admitted = selectCsharpForInKeyBinding({ ...policy, storage }, node, selected);
      if (admitted.kind === "rejected") refuse(admitted.node, admitted.reason);
      else {
        const conversion = admitConversion(selected, admitted.binding);
        if (conversion !== undefined) iterations.set(node, Object.freeze({ ...selected,
          binding: Object.freeze({ ...admitted.binding, conversion }) }));
      }
    } else {
      const admitted = selectCsharpForOfBinding({ ...policy, storage }, node, selected);
      if (admitted.kind === "rejected") refuse(admitted.node, admitted.reason);
      else {
        const conversion = admitConversion(selected, admitted.binding);
        if (conversion !== undefined) iterations.set(node, Object.freeze({ ...selected,
          binding: Object.freeze({ ...admitted.binding, conversion }) }));
      }
    }
  }
  return Object.freeze({ operations: Object.freeze({ ...operations,
    iteration: Object.freeze({ get: (node: Node) => iterations.get(node) }) }), issues: Object.freeze(issues) });
}

export function analyzeCsharpNativeControlFlow(source: TargetSourceProgram): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const ast = source.ast;
  const within = (node: Node, root: Node): boolean => {
    let current: Node | undefined = node;
    for (let remaining = 2_048; current !== undefined && remaining > 0; remaining -= 1) {
      if (current === root) return true;
      current = ast.parent(current);
    }
    return false;
  };
  const visit = (node: Node, cleanup: Node | undefined): void => {
    if (cleanup !== undefined && sourceEnclosingCallable(node, ast) !== sourceEnclosingCallable(cleanup, ast))
      cleanup = undefined;
    const kind = ast.kindName(node);
    if (cleanup !== undefined && (kind === "KindReturnStatement" || kind === "KindBreakStatement" ||
      kind === "KindContinueStatement")) {
      const target = kind === "KindReturnStatement" ? undefined : sourceControlTransferTarget(ast, node);
      if (target === undefined || !within(target, cleanup)) issues.push(Object.freeze({
        code: "CSHARP_NATIVE_FINALLY_CONTROL_TRANSFER", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "Native C# forbids return, break or continue leaving a finally body. Keep the control transfer outside cleanup.",
      }));
    }
    const finalBlock = ast.is.IsTryStatement(node) ? TryStatement_FinallyBlock(ast, node) : undefined;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child, child === finalBlock ? child : cleanup); });
  };
  source.navigation.sourceFiles.forEach(file => visit(file, undefined));
  return Object.freeze(issues);
}

export function admitCsharpStatementBindings(
  ast: AstReader,
  nodes: readonly Node[],
  nativeUse: CsharpNativeUseClassifications["nativeUse"],
  operations: Pick<CsharpTargetOperationClassifications, "resource" | "throwable" | "switchStatement" | "nativeUnreachable">,
  storage: Pick<CsharpStorageClassifications, "storageType">,
  generator: CsharpSourceEvidenceIndex["generator"],
  participation: CsharpNativeParticipationInput["participation"],
  metadata: CsharpSourceEvidenceIndex["compileTimeMetadata"],
): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const refusedResourceScopes = new Set<Node>();
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
      sourceNode: node, message }));
  };
  for (const node of nodes) {
    const order = nativeUse.order(node);
    if (order === undefined || metadata.get(node) || operations.nativeUnreachable.get(node) ||
      participation.get(node) === "erased") continue;
    if (ast.is.IsSwitchStatement(node)) {
      const selected = operations.switchStatement.get(node);
      if (selected === undefined || selected.kind === "rejected") {
        refuse(node, selected?.reason ?? "Switch requires sealed C# classification.");
      }
    } else if (ast.is.IsForOfStatement(node)) {
      const statement = ast.as.AsForInOrOfStatement(node);
      const initializer = statement?.Initializer;
      if (initializer !== undefined && !ast.is.IsVariableDeclarationList(initializer) && !ast.is.IsIdentifier(initializer)) {
        refuse(initializer, "For-of initializer binding is outside the current C# planning surface.");
      }
    } else if (ast.is.IsCatchClause(node)) {
      const clause = ast.as.AsCatchClause(node);
      const declaration = clause?.VariableDeclaration;
      const name = declaration === undefined ? undefined : ast.name(declaration);
      if (declaration === undefined || name === undefined || !order.some(step =>
        step.kind === "construct" && step.construct === declaration)) continue;
      if (name !== undefined && (ast.is.IsObjectBindingPattern(name) || ast.is.IsArrayBindingPattern(name))) {
        refuse(name, "Catch destructuring requires a closed thrown-value carrier; unknown catch values cannot trickle into C#.");
        continue;
      }
      const throwable = operations.throwable.get(name);
      if (throwable === undefined) {
        refuse(name, "Catch variable has no sealed C# throwable classification.");
        continue;
      }
      const carrier = storage.storageType.get(name);
      if (carrier === undefined && !throwable) {
        issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
          sourceNode: name,
          message: "Catch variables require finalized TSTS/provider exception-carrier facts before C# emission. C# runtime representation is not proven by authored source facts, the selected source profile, project declarations, or an exact provider relation.",
          evidence: Object.freeze(["C# type policy found no exact runtime representation."]) }));
      } else if (carrier === undefined || csharpTargetTypeRenderingRejection(carrier) !== undefined) {
        refuse(name, "Catch variable carrier must render to a closed C# type before C# emission.");
      } else if (!throwable && !isCsharpJsValueTargetType(carrier)) {
        refuse(name, "Catch variables require finalized TSTS/provider exception-carrier facts before C# emission. Resolved catch variable carrier is neither a target throwable carrier nor a closed TsValue catch carrier.");
      }
    } else if (ast.is.IsVariableDeclaration(node)) {
      const kind = ast.variableDeclarationKind(node);
      if (kind !== "using" && kind !== "await using") continue;
      const name = ast.name(node);
      if (name === undefined || !ast.is.IsIdentifier(name)) {
        refuse(name ?? node, "A resource declaration requires one exact identifier binding in C#.");
        continue;
      }
      const selected = operations.resource.get(node);
      const list = ast.parent(node);
      const declarationOwner = list === undefined ? undefined : ast.parent(list);
      const scope = selected?.kind === "resolved" && selected.source.acquisition.kind === "iteration"
        ? selected.source.acquisition.statement
        : declarationOwner !== undefined && ast.is.IsForStatement(declarationOwner)
          ? declarationOwner : declarationOwner === undefined ? undefined : ast.parent(declarationOwner);
      const callable = scope === undefined ? undefined : sourceEnclosingCallable(scope, ast);
      if (scope !== undefined && callable !== undefined && generator.get(callable) !== undefined) {
        if (!refusedResourceScopes.has(scope)) {
          refusedResourceScopes.add(scope);
          issues.push(Object.freeze({ code: "CSHARP_GENERATOR_RESOURCE_MANAGEMENT_NOT_PROVEN", category: "error",
            source: "tsonic-csharp", sourceNode: node,
            message: "Native C# iterator finally blocks cannot preserve SuppressedError composition when both generator execution and disposal fail." }));
        }
        continue;
      }
      if (selected === undefined) {
        refuse(node, "C# planning received a resource declaration without a sealed target classification.");
      } else if (selected.kind === "rejected") refuse(node, selected.reason);
      else if (kind === "using" && (selected.registration.kind === "direct"
        ? selected.registration.disposal.kind !== "sync"
        : selected.registration.arms.some(arm => arm.disposal.kind !== "sync"))) {
        refuse(node, "A synchronous resource scope cannot own an asynchronous disposer.");
      } else if (csharpTargetTypeRenderingRejection(selected.registration.resourceType) !== undefined) {
        refuse(node, "The exact resource disposal receiver has no closed C# source representation.");
      }
    }
  }
  return Object.freeze(issues);
}
