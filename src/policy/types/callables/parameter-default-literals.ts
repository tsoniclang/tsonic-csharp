import type { SourceLiteralUnit, SourcePresence } from "@tsonic/target-api/source";
import type { CsharpExactLiteralSelection } from "../../../target-model/conversions/exact-literals.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function csharpParameterDefaultIsLiteral(input: {
  readonly source: SourcePresence<SourceLiteralUnit>;
  readonly exact: CsharpExactLiteralSelection | undefined;
  readonly carrier: TargetTypeRef;
}): boolean {
  if (input.exact?.kind === "resolved") {
    const recipe = input.exact.recipe;
    if (recipe.kind === "integer") return recipe.width !== "int128" && recipe.width !== "uint128" && recipe.width !== "native-int" && recipe.width !== "native-uint";
    if (recipe.kind === "float") return recipe.precision !== "float16";
    return recipe.kind === "char" || recipe.kind === "string" || recipe.kind === "signed-zero";
  }
  if (input.source.kind === "none") return false;
  if (input.source.value.kind === "absence") return input.carrier.kind !== "type-parameter";
  return input.source.value.kind === "boolean" || input.source.value.kind === "string";
}
