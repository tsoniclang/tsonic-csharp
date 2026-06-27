export const unsupportedAnyOperationCode = "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED";
export const unsupportedAnyOperationNumericCode = 9100121;
export const unsupportedCompatRuntimeOperationCode = "CSHARP_COMPAT_RUNTIME_OPERATION_UNSUPPORTED";
export const unsupportedCompatRuntimeOperationNumericCode = 9100128;

export interface UnsupportedCompatRuntimeOperation {
  readonly kind: string;
  readonly message: string;
  readonly reason: string;
  readonly architecture: string;
}

export function hardRejectedCompatOperation(
  kind: string,
  message: string,
  reason: string,
): UnsupportedCompatRuntimeOperation {
  return {
    kind,
    message,
    reason,
    architecture: "This pattern is classified as hard-reject until an explicit closed Tsonic-owned compat-runtime carrier and finalized target operation fact exists; the backend must not use QuickJS, CLR reflection dispatch, C# dynamic, or source-name guessing.",
  };
}
