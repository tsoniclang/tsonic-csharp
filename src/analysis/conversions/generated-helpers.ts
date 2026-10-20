import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpGeneratedHelper } from "../../target-model/records/generated-helpers.js";

export function collectCsharpGeneratedHelpers(selection: CsharpConversionSelection, helpers: Set<CsharpGeneratedHelper>): void {
  switch (selection.kind) {
    case "lifted-provider-argument-adapter":
      helpers.add("lifted-provider-argument-adapter");
      return;
    case "nullable-map":
      collectCsharpGeneratedHelpers(selection.conversion, helpers);
      return;
    case "implicit":
      if (selection.proof === "runtime-union-arm") collectCsharpGeneratedHelpers(selection.sourceToArm, helpers);
      return;
    case "delegate-adapter":
      for (const parameter of selection.parameterConversions) collectCsharpGeneratedHelpers(parameter, helpers);
      if (selection.returnConversion.kind !== "void-return") collectCsharpGeneratedHelpers(selection.returnConversion, helpers);
      return;
    case "provider-argument-adapter":
      collectCsharpGeneratedHelpers(selection.sourceToInput, helpers);
      collectCsharpGeneratedHelpers(selection.resultToTarget, helpers);
      return;
    default:
      return;
  }
}
