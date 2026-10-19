import type { SourceLiteralValue } from "@tsonic/target-api/source";
import type { CsharpExactLiteralSelection } from "../../target-model/conversions/exact-literals.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export function csharpParameterDefaultIsLiteral(input: {
  readonly source: SourceLiteralValue | undefined;
  readonly exact: CsharpExactLiteralSelection | undefined;
  readonly carrier: TargetTypeRef;
  readonly nullLiteral: boolean;
}): boolean {
  if (input.exact?.kind === "resolved") {
    const recipe = input.exact.recipe;
    if (recipe.kind === "integer") return recipe.width !== "int128" && recipe.width !== "uint128" && recipe.width !== "native-int" && recipe.width !== "native-uint";
    if (recipe.kind === "float") return recipe.precision !== "float16";
    return recipe.kind === "char" || recipe.kind === "string" || recipe.kind === "signed-zero";
  }
  if (input.nullLiteral) return input.carrier.kind !== "type-parameter";
  return input.source?.form === "true" || input.source?.form === "false" || input.source?.form === "string" || input.source?.form === "template";
}
