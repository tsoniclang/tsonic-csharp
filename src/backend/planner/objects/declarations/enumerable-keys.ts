import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpInterfaceMember, CsharpTypeMember, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import { csharpEnumerableKeysMethodName, csharpEnumerableKeysStorageName } from "../../../../target-model/names/object-members.js";
import type { CsharpNativeMemberHidingReader } from "../../../../target-model/records/native-member-names.js";
import { planCsharpArtifactMemberHiding } from "../../declarations/modifiers.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

const stringType: CsharpTypeNode = { kind: "PredefinedType", name: "string" };
export const csharpEnumerableKeysType: CsharpTypeNode = {
  kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" },
  name: "ReadOnlySpan", typeArguments: [stringType],
};

export function csharpEnumerableKeysContract(shape: CsharpObjectShapeFact, names: CsharpNativeMemberHidingReader): CsharpInterfaceMember {
  return { kind: "MethodDeclaration", name: csharpEnumerableKeysMethodName,
    modifiers: planCsharpArtifactMemberHiding(names, shape, csharpEnumerableKeysMethodName),
    returnType: csharpEnumerableKeysType, parameters: [] };
}

export function renderCsharpEnumerableKeys(
  shape: CsharpObjectShapeFact,
  input: CsharpPlanningContext,
): readonly CsharpTypeMember[] | undefined {
  const order = input.program.records.enumerableKeys.get(shape);
  if (order === undefined) failCsharpPlannerInvariant("An admitted enumerable-key contract requires its sealed native property order.");
  return [
    { kind: "FieldDeclaration", name: csharpEnumerableKeysStorageName,
      modifiers: [...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, csharpEnumerableKeysStorageName), "private", "static", "readonly"],
      type: { kind: "ArrayType", elementType: stringType },
      initializer: { kind: "ArrayCreationExpression", elementType: stringType,
        elements: order.map(value => ({ kind: "LiteralExpression", value })) } },
    { kind: "MethodDeclaration", name: csharpEnumerableKeysMethodName,
      modifiers: [...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, csharpEnumerableKeysMethodName), "public"],
      returnType: csharpEnumerableKeysType, parameters: [],
      body: { kind: "Block", statements: [{ kind: "ReturnStatement",
        expression: { kind: "IdentifierName", name: csharpEnumerableKeysStorageName } }] } },
  ];
}

export function isCsharpEnumerableKeysMember(member: CsharpTypeMember): boolean {
  return member.kind === "FieldDeclaration" && member.name === csharpEnumerableKeysStorageName ||
    member.kind === "MethodDeclaration" && member.name === csharpEnumerableKeysMethodName;
}
