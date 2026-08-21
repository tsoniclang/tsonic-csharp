import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type {
  TargetCompilationSessionContext,
} from "@tsonic/target-api";
import type {
  TargetRuntimeContributionContext,
} from "@tsonic/target-api/provider";
import type {
  TargetRuntimeReference,
} from "@tsonic/target-api/artifacts";

const require = createRequire(import.meta.url);

export function csharpRuntimeAssemblyReference(
  context: Pick<TargetCompilationSessionContext, "paths"> |
    Pick<TargetRuntimeContributionContext, "paths">,
  packageName: string,
  assemblyName: string,
): TargetRuntimeReference {
  const packageRoot = resolveRuntimePackageRoot(context, packageName);
  return Object.freeze({
    kind: "assembly",
    include: assemblyName,
    attributes: Object.freeze({
      HintPath: resolve(packageRoot, `runtimes/net10.0/${assemblyName}.dll`),
    }),
  });
}

function resolveRuntimePackageRoot(
  context: { readonly paths: { readonly projectRoot: string } },
  packageName: string,
): string {
  const packageJsonSpecifier = `${packageName}/package.json`;
  const projectRequire = createRequire(resolve(context.paths.projectRoot, "package.json"));
  for (const resolver of [projectRequire, require]) {
    try {
      return dirname(resolver.resolve(packageJsonSpecifier));
    } catch {
      continue;
    }
  }
  throw new Error(
    `Required C# runtime package '${packageName}' is not installed or does not export package.json.`,
  );
}
