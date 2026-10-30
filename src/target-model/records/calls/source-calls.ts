import type { SourceFileSemantics } from "@tsonic/target-api/source";
export type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["call"]>
>;

export type CsharpSourceCallParameterReadDomain = "declared" | "callable";
