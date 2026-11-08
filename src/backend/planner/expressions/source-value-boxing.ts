import type { SourceCategory } from "@tsonic/target-api/source";
import type { CsharpSourceCategoryWitness } from "../../../target-model/types/representation.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { csharpTsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { qualifiedCsharpType } from "../types/primitives.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

const categoryMembers: Readonly<Record<SourceCategory, string>> = Object.freeze({
  absence: "Absent",
  boolean: "Boolean",
  number: "Number",
  bigint: "BigInt",
  string: "String",
  symbol: "Symbol",
  object: "Object",
  function: "Function",
});

export function planCsharpSourceValueBox(
  names: ReadonlyMap<string, string> | undefined,
  category: CsharpSourceCategoryWitness,
  expression: CsharpExpression,
): CsharpExpression {
  const site = category.evidence.component.root;
  const owner = csharpTypeFromTargetTypeRef(csharpTsValueTargetType(), names);
  const valueType = csharpTypeFromTargetTypeRef(category.valueType, names);
  if (owner === undefined || valueType === undefined) failCsharpPlannerInvariant(
    "A Source erasure requires its exact physical value and closed runtime owner.", site);
  if (category.kind === "known") return {
    kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: "fromsource", typeArguments: [valueType] },
    arguments: [{ kind: "Argument", expression }, { kind: "Argument", expression: {
      kind: "SimpleMemberAccessExpression", receiver: qualifiedCsharpType("Tsonic.CSharp.Runtime", "SourceValueCategory"),
      name: categoryMembers[category.category],
    } }],
  };
  const witnessType = csharpTypeFromTargetTypeRef(category.witnessType, names);
  if (witnessType === undefined) failCsharpPlannerInvariant(
    "A Source erasure requires its exact typed category witness.", site);
  return {
    kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: "fromsource", typeArguments: [valueType, witnessType] },
    arguments: [{ kind: "Argument", expression }],
  };
}
