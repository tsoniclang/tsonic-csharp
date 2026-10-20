import type { CsharpSemanticTypeClassification } from "../../target-model/records/source-evidence.js";

export type CsharpSemanticCarrierInput = Pick<CsharpSemanticTypeClassification, "intrinsic" | "targetType" | "typeParameter">;
