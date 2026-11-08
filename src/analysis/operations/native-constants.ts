import type { AstReader, Node } from "@tsonic/tsts";
import { AsParenthesizedExpression, KindNullKeyword } from "@tsonic/target-api/source";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpNativeLiteralQueries } from "../../policy/model/native-literals.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { csharpFloat64LiteralValue } from "../../target-model/syntax/numeric-literals.js";
import { csharpRepresentationDiagnostic } from "../source-evidence/representations.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpExactLiteralRecipe, CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeEmissionRecords } from "../../target-model/records/types/type-emission.js";
import type { CsharpSourceReferenceRecords } from "../../target-model/records/program/source-references.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";
import { createCsharpNativeConstantRecords } from "../program/records/native/native-constants.js";

export function analyzeCsharpNativeConstants(input: { readonly ast: AstReader; readonly demand: CsharpNativeDemandAnalysis;
  readonly facts: SourceProgramFacts; readonly literals: CsharpNativeLiteralQueries;
  readonly exact: CsharpExactLiteralSelectionIndex; readonly values: CsharpValueReadClassifications;
  readonly types: CsharpTypeEmissionRecords; readonly references: CsharpSourceReferenceRecords }) {
  const values = new Map<Node, Map<string, boolean>>();
  const issues: TargetDiagnostic[] = [];
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
      const expression = AsParenthesizedExpression(input.ast, literalNode)?.Expression;
      if (expression === undefined) break;
      literalNode = expression;
    }
    const exact = input.exact.exactLiteral.get(literalNode, carrier);
    const literalResult = input.literals.recipe(literalNode);
    if (literalResult.kind !== "represented") { issues.push(csharpRepresentationDiagnostic(literalResult)); return; }
    const literal = literalResult.value.kind === "present" ? literalResult.value.value : undefined;
    const storage = input.types.typeEmission.get(carrier)?.optionalStorage;
    let absent = storage?.kind === "native" && storage.absence && !storage.jsValue &&
      (input.ast.kindName(literalNode) === KindNullKeyword ||
        input.references.identifierEmission.get(literalNode)?.kind === "absence");
    if (!absent && storage?.kind === "native" && storage.absence && !storage.jsValue && input.ast.is.IsVoidExpression(literalNode)) {
      const effects = input.facts.navigation.expressionEffects(literalNode);
      if (!effects.invokes && !effects.mutates && !effects.suspends && !effects.mayThrow) {
        const selected = input.literals.scalar(literalNode);
        if (selected.kind !== "represented") { issues.push(csharpRepresentationDiagnostic(selected)); return; }
        absent = selected.value.kind === "present" && selected.value.value.kind === "absence";
      }
    }
    const selected = exact?.kind === "resolved" ? constant(exact.recipe)
      : literal !== undefined && (literal.kind === "boolean" && carrier.kind === "source-primitive" && carrier.name === "bool" ||
        literal.kind === "string" && isCsharpStringTargetType(carrier) ||
        literal.kind === "number" && carrier.kind === "source-primitive" && carrier.name === "float64" &&
          Number.isFinite(csharpFloat64LiteralValue(literal)));
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
  return Object.freeze({ records: createCsharpNativeConstantRecords(values, absence), issues: Object.freeze(issues) });
}
