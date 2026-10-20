import type { AstReader, Node } from "@tsonic/tsts";
import { KindNullKeyword } from "@tsonic/target-api/source";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpExactLiteralRecipe, CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeEmissionRecords } from "../../target-model/records/type-emission.js";
import type { CsharpSourceReferenceRecords } from "../../target-model/records/source-references.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";
import { createCsharpNativeConstantRecords } from "../program/records/native-constants.js";

export function analyzeCsharpNativeConstants(input: { readonly ast: AstReader; readonly demand: CsharpNativeDemandAnalysis;
  readonly literals: SourceLiteralIndex; readonly exact: CsharpExactLiteralSelectionIndex; readonly values: CsharpValueReadClassifications;
  readonly types: CsharpTypeEmissionRecords; readonly references: CsharpSourceReferenceRecords }) {
  const values = new Map<Node, Map<string, boolean>>();
  const absence = new Map<Node, Map<string, boolean>>();
  const constant = (recipe: CsharpExactLiteralRecipe): boolean => {
    switch (recipe.kind) {
      case "char": case "string": case "signed-zero": return true;
      case "float": return recipe.precision !== "float16";
      case "integer": return recipe.width !== "native-int" && recipe.width !== "native-uint" &&
        recipe.width !== "int128" && recipe.width !== "uint128" && (recipe.width !== "int64" || recipe.value >= 0n);
    }
  };
  const select = (node: Node, carrier: TargetTypeRef): void => {
    const carriers = values.get(node) ?? new Map<string, boolean>();
    const key = targetTypeRefKey(carrier);
    if (carriers.has(key)) return;
    let literalNode = node;
    for (;;) {
      const expression = input.ast.as.AsParenthesizedExpression(literalNode)?.Expression;
      if (expression === undefined) break;
      literalNode = expression;
    }
    const exact = input.exact.exactLiteral.get(literalNode, carrier);
    const literal = input.literals.literalValue.get(literalNode);
    const storage = input.types.typeEmission.get(carrier)?.optionalStorage;
    const absent = storage?.kind === "native" && storage.absence && !storage.jsValue &&
      (input.ast.kindName(literalNode) === KindNullKeyword || input.ast.is.IsVoidExpression(literalNode) ||
        input.references.identifierEmission.get(literalNode)?.kind === "absence");
    const selected = exact?.kind === "resolved" ? constant(exact.recipe)
      : literal !== undefined && ((literal.form === "true" || literal.form === "false") && carrier.kind === "source-primitive" && carrier.name === "bool" ||
        (literal.form === "string" || literal.form === "template" && input.ast.is.IsNoSubstitutionTemplateLiteral(literalNode)) && isCsharpStringTargetType(carrier) ||
        literal.form === "numeric" && carrier.kind === "source-primitive" && carrier.name === "float64" &&
          literal.number !== undefined && Number.isFinite(literal.number));
    carriers.set(key, selected || absent); values.set(node, carriers);
    const absenceCarriers = absence.get(node) ?? new Map<string, boolean>();
    absenceCarriers.set(key, absent); absence.set(node, absenceCarriers);
  };
  for (const { use } of input.demand.entries) {
    if (use.kind === "erased") continue;
    select(use.expression, use.carrier);
    if (use.kind === "converted") select(use.expression, use.target);
    const read = input.values.valueRead.get(use.expression);
    if (read?.source !== undefined) select(use.expression, read.source);
    if (read?.value !== undefined) select(use.expression, read.value);
  }
  return createCsharpNativeConstantRecords(values, absence);
}
