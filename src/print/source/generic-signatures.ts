export function csharpTypeParameterShadowingPragma(
  declaration: { readonly kind: string; readonly shadowsEnclosingTypeParameter?: true },
  action: "disable" | "restore",
): readonly string[] {
  if (declaration.shadowsEnclosingTypeParameter !== true) return [];
  const warning = declaration.kind === "LocalFunctionStatement" ? "CS8387" : "CS0693";
  return [`#pragma warning ${action} ${warning}`];
}
