import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { TryStatement_FinallyBlock, sourceEnclosingCallable,
  type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpNativeParticipationInput, CsharpNativeUseClassifications } from "../../target-model/records/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeNativeArrayTargetType,
  isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { selectCsharpForInKeyBinding, selectCsharpForOfBinding } from "../operations/iteration/bindings.js";
import type { CsharpAdmittedIteration, CsharpForInKeyBinding, CsharpForOfBinding,
  CsharpResolvedIteration } from "../../target-model/records/selection.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { directCsharpSourceYieldExpression } from "../../target-model/syntax/yield-expression.js";
import { csharpDestructuringAssignmentSyntax } from "../../source/extension/operators.js";
import type { CsharpStatementCompletionRecords } from "../../target-model/records/statement-completion.js";
import { createCsharpAdmittedIterationProducer } from "../program/records/iteration.js";

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
  const iterations = createCsharpAdmittedIterationProducer();
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
        if (conversion !== undefined) iterations.admit(node, Object.freeze({ ...selected,
          binding: Object.freeze({ ...admitted.binding, conversion }) }));
      }
    } else {
      const admitted = selectCsharpForOfBinding({ ...policy, storage }, node, selected);
      if (admitted.kind === "rejected") refuse(admitted.node, admitted.reason);
      else {
        const conversion = admitConversion(selected, admitted.binding);
        if (conversion !== undefined) iterations.admit(node, Object.freeze({ ...selected,
          binding: Object.freeze({ ...admitted.binding, conversion }) }));
      }
    }
  }
  return Object.freeze({ operations: Object.freeze({ ...operations,
    iteration: iterations.seal() }), issues: Object.freeze(issues) });
}

export function analyzeCsharpNativeControlFlow(
  source: TargetSourceProgram,
  controlExit: CsharpStatementCompletionRecords["controlExit"],
  admitted: (node: Node) => boolean,
): readonly TargetDiagnostic[] {
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
    if (admitted(node) && cleanup !== undefined && (kind === "KindReturnStatement" || kind === "KindBreakStatement" ||
      kind === "KindContinueStatement")) {
      const target = kind === "KindReturnStatement" ? undefined : controlExit.get(node)?.target;
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
  operations: Pick<CsharpTargetOperationClassifications, "resource" | "throwable" | "throwValue" |
    "exactCatchRethrow" | "switchStatement" | "nativeUnreachable">,
  storage: Pick<CsharpStorageClassifications, "storageType">,
  generator: CsharpSourceEvidenceIndex["generator"],
  participation: CsharpNativeParticipationInput["participation"],
  metadata: CsharpSourceEvidenceIndex["compileTimeMetadata"],
  valueReads: CsharpValueReadClassifications["valueRead"],
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
    if (ast.is.IsThrowStatement(node)) {
      const expression = ast.as.AsThrowStatement(node)?.Expression;
      if (expression === undefined || operations.exactCatchRethrow.get(node)) continue;
      const thrown = operations.throwValue.get(node);
      const carrier = valueReads.get(expression)?.value;
      if (thrown === undefined || thrown.expression !== expression ||
        (carrier === undefined ? thrown.sourceCarrier !== undefined
          : thrown.sourceCarrier === undefined || !targetTypeRefEquals(thrown.sourceCarrier, carrier))) {
        refuse(expression, "Throw expression has no exact sealed C# native error carrier classification.");
      } else if (thrown.targetCarrier === undefined) {
        const reason = carrier === undefined
          ? "C# runtime representation is not proven by authored source facts, the selected source profile, project declarations, or an exact provider relation."
          : "Resolved thrown expression carrier is not a target throwable carrier.";
        issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
          sourceNode: expression,
          message: `Throw statements require finalized TSTS/provider exception-carrier facts before C# emission. ${reason}`,
          evidence: Object.freeze(carrier === undefined ? ["C# type policy found no exact runtime representation."] : []) }));
      } else if (csharpTargetTypeRenderingRejection(thrown.targetCarrier) !== undefined) {
        refuse(expression,
          `Throw statements require C# type syntax for the sealed thrown carrier '${targetTypeRefKey(thrown.targetCarrier)}' before C# emission.`);
      }
    } else if (ast.is.IsSwitchStatement(node)) {
      const selected = operations.switchStatement.get(node);
      if (selected === undefined || selected.kind === "rejected") {
        refuse(node, selected?.reason ?? "Switch requires sealed C# classification.");
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
      const declaration = ast.as.AsVariableDeclaration(node)!;
      const callable = sourceEnclosingCallable(node, ast);
      if (callable !== undefined && generator.get(callable) !== undefined &&
        directCsharpSourceYieldExpression(ast, declaration.Initializer) !== undefined && !ast.is.IsIdentifier(declaration.name)) {
        refuse(declaration.name ?? node,
          "A yield initializer with a binding pattern requires an explicit post-resume destructuring plan.");
        continue;
      }
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
      const scopeCallable = scope === undefined ? undefined : sourceEnclosingCallable(scope, ast);
      if (scope !== undefined && scopeCallable !== undefined && generator.get(scopeCallable) !== undefined) {
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

export function admitCsharpNativeStorageBindings(
  ast: AstReader,
  nodes: readonly Node[],
  nativeUse: CsharpNativeUseClassifications["nativeUse"],
  storage: Pick<CsharpStorageClassifications, "nativeBacking" | "nativeArray" | "storageType">,
  nativeRefs: CsharpTargetOperationClassifications["nativeRefReturn"],
  participation: CsharpNativeParticipationInput["participation"],
  metadata: CsharpSourceEvidenceIndex["compileTimeMetadata"],
  unreachable: CsharpTargetOperationClassifications["nativeUnreachable"],
): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
      sourceNode: node, message }));
  };
  const admitBindingSource = (source: Node, diagnosticNode: Node, description: string): void => {
    const selected = nativeUse.expression(source)?.use;
    if (selected === undefined) return;
    const carrier = selected.kind === "erased" ? undefined
      : selected.completion.kind === "value" ? selected.completion.type : selected.carrier;
    if (carrier === undefined || csharpTargetTypeRenderingRejection(carrier) !== undefined) {
      refuse(diagnosticNode, `${description} requires its admitted native source carrier before C# emission.`);
    }
  };
  for (const node of nodes) {
    if (nativeUse.order(node) === undefined || metadata.get(node) || unreachable.get(node) ||
      participation.get(node) === "erased") continue;
    const assignment = csharpDestructuringAssignmentSyntax(ast, node);
    if (assignment !== undefined) {
      admitBindingSource(assignment.source, assignment.pattern, "Destructuring assignment source");
    }
    const backing = storage.nativeBacking.get(node);
    if (ast.is.IsParameterDeclaration(node)) {
      if (backing !== undefined && csharpTargetTypeRenderingRejection(csharpRuntimeLocationTargetType(backing.pointeeType)) !== undefined) {
        refuse(node, "Sealed native parameter storage requires its exact planned binding and type.");
      }
      continue;
    }
    if (!ast.is.IsVariableDeclaration(node)) continue;
    const owner = ast.parent(node);
    if (owner !== undefined && ast.is.IsCatchClause(owner)) continue;
    const statement = owner === undefined ? undefined : ast.parent(owner);
    if (statement !== undefined && (ast.is.IsForInStatement(statement) || ast.is.IsForOfStatement(statement))) continue;
    const declaration = ast.as.AsVariableDeclaration(node)!;
    const initializer = declaration.Initializer;
    if (initializer !== undefined && declaration.name !== undefined &&
      (ast.is.IsObjectBindingPattern(declaration.name) || ast.is.IsArrayBindingPattern(declaration.name))) {
      admitBindingSource(initializer, declaration.name, "Destructuring source expression");
    }
    const nativeRef = initializer !== undefined && ast.variableDeclarationKind(node) === "const"
      ? nativeRefs.get(initializer) : undefined;
    if (nativeRef?.kind === "resolved" && nativeRef.returnType === undefined) {
      refuse(initializer ?? node, "A selected C# native ref-return local has no closed pointee type.");
    }
    if (ast.is.IsIdentifier(declaration.name)) {
      const type = nativeRef?.kind === "resolved" ? nativeRef.returnType : storage.storageType.get(node);
      const subject = declaration.Type ?? declaration.name ?? node;
      if (type === undefined) {
        if (nativeRef?.kind !== "resolved") refuse(subject,
          `C# type policy could not resolve source node kind '${ast.kindName(subject)}' to a closed target type.`);
      } else if (csharpTargetTypeRenderingRejection(type) !== undefined) {
        issues.push(Object.freeze({ category: "error", source: "tsonic-csharp", sourceNode: subject,
          code: type.kind === "opaque" ? "CSHARP_OPAQUE_TARGET_TYPE_UNSUPPORTED" : "CSHARP_UNSUPPORTED_AST",
          message: type.kind === "opaque" ? `Opaque target type '${type.id}' has no renderable C# source representation.`
            : `C# type policy resolved '${type.kind}', but that target type has no renderable C# syntax.` }));
      }
    }
    if (initializer === undefined) continue;
    const array = storage.nativeArray.get(node);
    if (array !== undefined && csharpTargetTypeRenderingRejection(csharpRuntimeNativeArrayTargetType(array.layout.pointeeType)) !== undefined) {
      refuse(node, "The sealed native array has no renderable storage type.");
    }
    if (backing !== undefined && csharpTargetTypeRenderingRejection(csharpRuntimeLocationTargetType(backing.pointeeType)) !== undefined) {
      refuse(node, "The sealed native local backing has no renderable location type.");
    }
  }
  return Object.freeze(issues);
}
