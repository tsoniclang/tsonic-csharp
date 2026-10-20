export const csharpGeneratedHelperNamespace = "Tsonic.CSharp.Generated";
export const csharpGeneratedConversionHelperName = "__TsonicConversions";

export type CsharpGeneratedHelper = "lifted-provider-argument-adapter";

export interface CsharpGeneratedHelperRecords {
  readonly generatedHelpers: { readonly get: () => readonly CsharpGeneratedHelper[] };
  readonly generatedHelper: { readonly get: (helper: CsharpGeneratedHelper) => true | undefined };
}
