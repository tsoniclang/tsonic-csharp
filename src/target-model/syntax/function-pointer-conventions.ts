export function csharpFunctionPointerCallingConvention(
  abi: readonly string[] | undefined,
): {
  readonly callingConvention?: "managed" | "unmanaged";
  readonly callingConventionModifiers?: readonly string[];
} | undefined {
  if (abi === undefined || abi.length === 0) {
    return {};
  }
  if (abi.length === 1 && abi[0] === "target-default") {
    return {};
  }
  const [kind, ...modifiers] = abi;
  if (kind === "managed") {
    return modifiers.length === 0 ? { callingConvention: "managed" } : undefined;
  }
  if (kind !== "unmanaged" || modifiers.some((modifier) =>
    ![
      "Cdecl",
      "Fastcall",
      "MemberFunction",
      "Stdcall",
      "SuppressGCTransition",
      "Swift",
      "Thiscall",
    ].includes(modifier))) {
    return undefined;
  }
  return {
    callingConvention: "unmanaged",
    ...(modifiers.length === 0 ? {} : { callingConventionModifiers: modifiers }),
  };
}

