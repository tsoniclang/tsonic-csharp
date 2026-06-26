import type {
  ExtensionEvidence,
} from "@tsonic/tsts";

export type CsharpTargetAssignabilityValidation =
  | {
      readonly kind: "compatible";
      readonly evidence: readonly ExtensionEvidence[];
    }
  | {
      readonly kind: "invalid";
      readonly message: string;
      readonly evidence: readonly ExtensionEvidence[];
    };
