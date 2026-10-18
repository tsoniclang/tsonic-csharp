export {
  analyzeCsharpDeclarations,
  reconcileInferredReturnTargetContract,
} from "./analyze.js";
export { admitCsharpNativeDeclarations, admitCsharpRawInterfaceDeclarations } from "./native-value-declarations.js";
export type { CsharpDeclarationClassifications, CsharpReturnTargetContract } from "../../target-model/records/declarations.js";
