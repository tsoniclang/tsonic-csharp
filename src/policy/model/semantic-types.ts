import type { CsharpSemanticTypeClassification } from "../../target-model/records/program/source-evidence.js";

export type CsharpSemanticCarrierInput = Pick<CsharpSemanticTypeClassification, "intrinsic" | "targetType" | "typeParameter">;
