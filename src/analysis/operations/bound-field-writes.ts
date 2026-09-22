import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import {
  isCsharpValueTypeTargetType,
  resolveCsharpObjectShapeMemberBySelectedSubject,
  type TargetTypeRef,
} from "../../policy/types/index.js";
import {
  selectCsharpTypedLocationStorage,
  type CsharpTypedLocationStorageSelection,
} from "../../policy/operations/typed-locations/typed-location-storage.js";

export function classifyCsharpBoundFieldWrite(
  policy: CsharpPolicyContext,
  expression: Node,
  sourceFile: SourceFile,
  valueType: TargetTypeRef | undefined,
): CsharpTypedLocationStorageSelection | undefined {
  const semantics = policy.semantics(sourceFile);
  const source = semantics.operations.propertyAccess(expression);
  if (source === undefined ||
      (source.accessMode !== "write" && source.accessMode !== "read-write")) return undefined;
  let receiver = source.receiver.expression;
  while (policy.ast.is.IsPropertyAccessExpression(receiver)) {
    const type = policy.types.resolveReadStorage(receiver, sourceFile);
    if (type === undefined || !isCsharpValueTypeTargetType(type)) return undefined;
    const selected = semantics.operations.propertyAccess(receiver);
    if (selected === undefined) return undefined;
    const shape = policy.objectShapes.resolveNode(selected.receiver.expression, sourceFile);
    const field = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(
      shape, semantics.facts.selectedSubjects(selected.selectedSymbol, selected.selectedDeclaration),
    );
    if (field?.kind === "resolved" && field.member.bound === true) {
      return valueType === undefined
        ? { kind: "rejected", reason: "A bound value-field write requires its exact C# storage type." }
        : selectCsharpTypedLocationStorage(policy, expression, valueType, sourceFile,
            new WeakSet(), source.selectedDeclaration);
    }
    receiver = selected.receiver.expression;
  }
  return undefined;
}
