import type { Node } from "@tsonic/tsts";
import { sourceEnclosingCallable, sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpTypeParameterConstraintsImply } from "../../policy/constraints/type-parameter-constraints.js";
import { csharpCarrierAdmitsSourceAbsence } from "../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpAbsenceTargetType } from "../../target-model/types/index.js";
import { getCsharpGenericOptionalParts, csharpTypeProjection } from "../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpTypeParameterConstraint } from "../../target-model/types/generic-constraints.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpOptionalLocalOperation, CsharpOptionalLocalPlacement, CsharpOptionalLocalValue } from "../../target-model/records/storage/local-bindings.js";
import { csharpSourceTypeParameter, csharpSourceTypeParameters } from "../../source/extension/type-parameters.js";
import type { CsharpSourceNameResolver } from "../names/index.js";

export interface CsharpOptionalLocalPlan {
  readonly entries: readonly { readonly node: Node; readonly operation: CsharpOptionalLocalOperation }[];
  get(node: Node): CsharpOptionalLocalOperation | undefined;
  removesProjection(node: Node, identity: string): boolean;
}

export function analyzeCsharpOptionalLocals(policy: CsharpPolicyContext, evidence: CsharpSourceEvidenceIndex,
  nodes: readonly Node[], names: CsharpSourceNameResolver,
  selectedOperations: Pick<CsharpTargetOperationClassifications, "typedLocation">): CsharpOptionalLocalPlan {
  const { ast, navigation } = policy;
  const candidates = new Map<Node, CsharpOptionalLocalPlacement>();
  const operations = new Map<Node, CsharpOptionalLocalOperation>();
  const removed = new Map<Node, Set<string>>();
  const dependencies = new Map<Node, Set<Node>>();
  const owners = new Map<Node, boolean>();
  const constraintsByOwner = new Map<Node, ReadonlyMap<string, readonly CsharpTypeParameterConstraint[]>>();
  const addressed = new Set<Node>();
  const unwrap = (node: Node): Node => {
    while (ast.is.IsParenthesizedExpression(node)) {
      const operand = ast.as.AsParenthesizedExpression(node)?.Expression;
      if (operand === undefined) break;
      node = operand;
    }
    return node;
  };
  for (const node of nodes) {
    const passing = evidence.sourceArgument.get(node);
    if (passing?.kind === "resolved" && passing.argument.passingMode !== "by-value") {
      const declaration = navigation.referenceFor(unwrap(passing.argument.storageExpression))?.declaration;
      if (declaration !== undefined) addressed.add(declaration);
    }
    const operation = selectedOperations.typedLocation.get(node);
    if (operation?.kind !== "location-address") continue;
    let storage = operation.storage;
    while (storage.kind === "value-property-storage") storage = storage.receiverStorage;
    if (storage.kind === "direct-storage" && storage.identity.kind === "local-storage") addressed.add(storage.identity.declaration);
  }
  const constraintsFor = (node: Node): ReadonlyMap<string, readonly CsharpTypeParameterConstraint[]> => {
    const existing = constraintsByOwner.get(node);
    if (existing !== undefined) return existing;
    const parameters = new Map<string, readonly CsharpTypeParameterConstraint[]>();
    for (let owner: Node | undefined = node; owner !== undefined; owner = ast.parent(owner)) {
      for (const parameter of csharpSourceTypeParameters(owner, ast)) {
        const identity = parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, ast)?.identity;
        const constraints = parameter === undefined ? undefined : evidence.typeParameterConstraints.get(parameter);
        if (identity !== undefined && constraints?.kind === "resolved") parameters.set(identity, constraints.constraints);
      }
    }
    constraintsByOwner.set(node, parameters);
    return parameters;
  };
  const hasSuspension = (owner: Node): boolean => {
    const known = owners.get(owner);
    if (known !== undefined) return known;
    let suspends = false;
    const visit = (node: Node): void => {
      if (node !== owner && sourceEnclosingCallable(node, ast) !== owner) return;
      if (ast.is.IsAwaitExpression(node) || ast.is.IsYieldExpression(node)) { suspends = true; return; }
      ast.forEachChild(node, child => { if (child !== undefined && !suspends) visit(child); });
    };
    visit(owner);
    owners.set(owner, suspends);
    return suspends;
  };
  for (const node of nodes) {
    if (addressed.has(node) || evidence.compileTimeMetadata.get(node) || !ast.is.IsVariableDeclaration(node) || !ast.is.IsIdentifier(ast.name(node)) ||
      sourceDeclarationIsModuleScoped(node, ast)) continue;
    const owner = sourceEnclosingCallable(node, ast);
    const parent = ast.parent(node);
    const statement = parent === undefined ? undefined : ast.parent(parent);
    if (owner === undefined || parent === undefined || !ast.is.IsVariableDeclarationList(parent) ||
      statement === undefined || !ast.is.IsVariableStatement(statement) || hasSuspension(owner) ||
      !["let", "const"].includes(ast.variableDeclarationKind(node) ?? "")) continue;
    const storage = evidence.storageTargetType.get(node);
    const parts = getCsharpGenericOptionalParts(storage);
    if (storage === undefined || parts?.element.kind !== "type-parameter" || parts.element.csharpProjection !== undefined) continue;
    const parameters = constraintsFor(owner);
    const constraints = parameters.get(parts.element.identity) ?? (parts.element.csharpConstraints?.kind === "resolved"
      ? parts.element.csharpConstraints.constraints : undefined);
    if (constraints === undefined || !csharpTypeParameterConstraintsImply(policy, constraints,
      [{ kind: "keyword", keyword: "notnull" }], parameters)) continue;
    const summary = navigation.declarationUseSummary(node);
    if (summary.captured || summary.exported || summary.memberWritten || summary.hasUnclassifiedValueUse ||
      summary.uses.some(use => use.captured || use.throughMember || sourceEnclosingCallable(use.reference, ast) !== owner)) continue;
    const name = names.resolve(ast.name(node), node);
    if (name.kind !== "resolved") continue;
    candidates.set(node, Object.freeze({ declaration: node, storage, payload: parts.element,
      payloadName: name.name, presenceName: names.temporaryName(`${name.name}_present`) }));
  }
  const sourceValue = (expression: Node | undefined, placement: CsharpOptionalLocalPlacement): CsharpOptionalLocalValue | undefined => {
    if (expression === undefined) return Object.freeze({ kind: "absence", expression });
    const current = unwrap(expression);
    const source = evidence.valueRefinement.get(current)?.flowReadTargetType ?? evidence.nodeTargetType.get(current);
    if (source === undefined) return undefined;
    if (isCsharpAbsenceTargetType(source)) return Object.freeze({ kind: "absence", expression });
    if (ast.is.IsIdentifier(current)) {
      const declaration = navigation.referenceFor(current)?.declaration;
      const copied = declaration === undefined ? undefined : candidates.get(declaration);
      if (copied !== undefined && targetTypeRefEquals(copied.storage, placement.storage))
        return Object.freeze({ kind: "copy", expression, placement: copied });
    }
    if (csharpCarrierAdmitsSourceAbsence(source) || !targetTypeRefEquals(source, placement.payload)) return undefined;
    return Object.freeze({ kind: "present", expression });
  };
  const privateNodes = new Map<Node, Set<Node>>();
  const pendingOperations = new Map<Node, Map<Node, CsharpOptionalLocalOperation>>();
  for (const [declaration, placement] of candidates) {
    const selected = new Map<Node, CsharpOptionalLocalOperation>();
    const privateUses = new Set<Node>([declaration]);
    const variable = ast.as.AsVariableDeclaration(declaration);
    if (variable?.Type !== undefined) privateUses.add(variable.Type);
    const initial = sourceValue(variable?.Initializer, placement);
    let valid = initial !== undefined;
    const depends = new Set<Node>();
    const retainValue = (value: CsharpOptionalLocalValue): void => {
      if (value.expression !== undefined) privateUses.add(value.expression);
      if (value.kind === "copy") depends.add(value.placement.declaration);
    };
    if (initial !== undefined) {
      selected.set(declaration, Object.freeze({ kind: "declaration", placement, value: initial }));
      retainValue(initial);
    }
    for (const use of navigation.declarationUseSummary(declaration).uses) {
      if (!valid || use.kind === "type-only" || ast.name(declaration) === use.reference) continue;
      let reference = use.reference;
      while (ast.is.IsParenthesizedExpression(ast.parent(reference))) reference = ast.parent(reference)!;
      const parent = ast.parent(reference);
      const binary = parent === undefined ? undefined : ast.as.AsBinaryExpression(parent);
      const operator = parent === undefined ? undefined : ast.operatorKindName(parent);
      privateUses.add(reference);
      privateUses.add(use.reference);
      if (binary?.Left === reference && binary.Right !== undefined &&
        (operator === "KindEqualsToken" || operator === "KindQuestionQuestionEqualsToken")) {
        const value = sourceValue(binary.Right, placement);
        if (value === undefined || navigation.expressionResultUse(parent!) !== "discarded") { valid = false; break; }
        if (operator === "KindQuestionQuestionEqualsToken" && value.kind !== "present") { valid = false; break; }
        selected.set(parent!, operator === "KindEqualsToken"
          ? Object.freeze({ kind: "write", placement, value })
          : Object.freeze({ kind: "coalesce", placement, right: binary.Right, assignment: true }));
        retainValue(value);
        privateUses.add(parent!);
        continue;
      }
      if (binary !== undefined && binary.Left !== undefined && binary.Right !== undefined &&
        ["KindEqualsEqualsToken", "KindEqualsEqualsEqualsToken", "KindExclamationEqualsToken", "KindExclamationEqualsEqualsToken"].includes(operator ?? "")) {
        const other = binary.Left === reference ? binary.Right : binary.Right === reference ? binary.Left : undefined;
        const otherCarrier = other === undefined ? undefined : evidence.nodeTargetType.get(unwrap(other));
        if (otherCarrier !== undefined && isCsharpAbsenceTargetType(otherCarrier)) {
          selected.set(parent!, Object.freeze({ kind: "absence-test", placement,
            negated: operator === "KindExclamationEqualsToken" || operator === "KindExclamationEqualsEqualsToken",
            other: other!, localFirst: binary.Left === reference }));
          privateUses.add(parent!);
          privateUses.add(other!);
          continue;
        }
      }
      if (binary?.Left === reference && binary.Right !== undefined && operator === "KindQuestionQuestionToken") {
        const value = sourceValue(binary.Right, placement);
        const contextual = evidence.contextualType.get(parent!)?.targetType;
        if (value?.kind !== "present" || contextual === undefined || !targetTypeRefEquals(contextual, placement.payload)) { valid = false; break; }
        selected.set(parent!, Object.freeze({ kind: "coalesce", placement, right: binary.Right, assignment: false }));
        privateUses.add(parent!);
        continue;
      }
      if (parent !== undefined && ast.is.IsVariableDeclaration(parent) && ast.as.AsVariableDeclaration(parent)?.Initializer === reference) {
        if (!candidates.has(parent)) { valid = false; break; }
        depends.add(parent);
        continue;
      }
      if (binary?.Right === reference && binary.Left !== undefined && operator === "KindEqualsToken") {
        const target = navigation.referenceFor(unwrap(binary.Left))?.declaration;
        if (target === undefined || !candidates.has(target)) { valid = false; break; }
        depends.add(target);
        continue;
      }
      const passing = evidence.sourceArgument.get(use.reference);
      if (passing?.kind === "resolved" && passing.argument.passingMode !== "by-value") { valid = false; break; }
      const asserted = parent === undefined ? undefined : evidence.nodeTargetType.get(parent);
      if (parent !== undefined && ast.is.IsNonNullExpression(parent)) {
        const contextual = evidence.contextualType.get(parent)?.targetType;
        if (asserted === undefined || !targetTypeRefEquals(asserted, placement.payload) ||
          contextual === undefined || !targetTypeRefEquals(contextual, placement.payload)) { valid = false; break; }
        selected.set(parent, Object.freeze({ kind: "read", placement, guarded: true }));
        privateUses.add(parent);
        continue;
      }
      const carrier = evidence.valueRefinement.get(use.reference)?.flowReadTargetType ?? evidence.nodeTargetType.get(use.reference);
      const contextual = evidence.contextualType.get(use.reference)?.targetType;
      if (carrier !== undefined && targetTypeRefEquals(carrier, placement.payload) &&
        contextual !== undefined && targetTypeRefEquals(contextual, placement.payload)) {
        selected.set(reference, Object.freeze({ kind: "read", placement, guarded: false }));
        continue;
      }
      valid = false;
    }
    if (valid) { pendingOperations.set(declaration, selected); privateNodes.set(declaration, privateUses); dependencies.set(declaration, depends); }
  }
  const rejected = [...candidates.keys()].filter(node => !pendingOperations.has(node));
  const dependents = new Map<Node, Node[]>();
  for (const [declaration, values] of dependencies) for (const dependency of values) {
    const existing = dependents.get(dependency);
    if (existing === undefined) dependents.set(dependency, [declaration]); else existing.push(declaration);
  }
  for (let index = 0; index < rejected.length; index++) {
    for (const dependent of dependents.get(rejected[index]!) ?? []) if (pendingOperations.delete(dependent)) rejected.push(dependent);
  }
  for (const [declaration, selected] of pendingOperations) {
    const placement = candidates.get(declaration)!;
    for (const [node, operation] of selected) operations.set(node, operation);
    for (const node of privateNodes.get(declaration)!) {
      let projections = removed.get(node);
      if (projections === undefined) { projections = new Set(); removed.set(node, projections); }
      projections.add(csharpTypeProjection(placement.storage)!.identity);
    }
  }
  return Object.freeze({ entries: Object.freeze([...operations].map(([node, operation]) => Object.freeze({ node, operation }))),
    get: (node: Node) => operations.get(node),
    removesProjection: (node: Node, identity: string) => removed.get(node)?.has(identity) === true });
}
