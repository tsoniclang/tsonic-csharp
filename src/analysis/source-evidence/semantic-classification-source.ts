import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics, TargetSourceProgram } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpSemanticTypeClassification } from "../../target-model/records/program/source-evidence.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import { selectCsharpSemanticCarrier } from "../../policy/types/resolution/semantic-types.js";
import type { CsharpTypeQuerySource } from "./types/resolution/root-sources.js";
import type { CsharpTypeResolutionServices } from "./types/resolution/engine.js";

export interface CsharpSemanticTypeClassificationSource {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly query: CsharpTypeQuerySource;
  readonly intrinsic: CsharpSemanticTypeClassification["intrinsic"];
  readonly nullish: boolean;
  readonly typeParameter: ReturnType<typeof csharpSourceTypeParameter>;
}

export function formCsharpSemanticTypeClassificationSource(
  source: Pick<TargetSourceProgram, "ast">,
  type: Type,
  queries: SourceFileSemantics,
  typeQueries: Pick<CsharpTypeResolutionServices, "typeQuerySource">,
): CsharpSemanticTypeClassificationSource {
  const intrinsic: CsharpSemanticTypeClassification["intrinsic"] = queries.types.isAny(type) ? "any"
    : queries.types.isUnknown(type) ? "unknown" : queries.types.isBooleanLike(type) ? "boolean"
      : queries.types.isNumberLike(type) ? "number" : queries.types.isStringLike(type) ? "string"
        : queries.types.isBigIntLike(type) ? "bigint" : queries.types.isVoidLike(type) ? "void" : "other";
  const query = typeQueries.typeQuerySource(type, queries.sourceFile);
  const symbol = queries.declarations.typeSymbol(type);
  const parameters = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol)
    .filter(declaration => source.ast.is.IsTypeParameterDeclaration(declaration));
  const typeParameter = parameters.length === 1 ? csharpSourceTypeParameter(parameters[0]!, source.ast) : undefined;
  return Object.freeze({ type, queries, query, intrinsic, typeParameter, nullish: queries.types.isNullish(type) });
}

export function completeCsharpSemanticTypeClassification(
  source: CsharpSemanticTypeClassificationSource,
  input: { readonly source: CsharpTypeQuerySource; readonly type: TargetTypeRef | undefined },
): CsharpSemanticTypeClassification {
  if (input.source !== source.query || input.source.type !== source.type ||
    input.source.sourceFile !== source.queries.sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
      "Semantic classification requires its exact retained checked Type and Native child receipt.");
  const targetType = input.type;
  const { intrinsic, typeParameter, nullish } = source;
  return Object.freeze({ carrier: selectCsharpSemanticCarrier({ intrinsic, targetType, typeParameter }), intrinsic, nullish,
    ...(targetType === undefined ? {} : { targetType }), ...(typeParameter === undefined ? {} : { typeParameter }),
  });
}
