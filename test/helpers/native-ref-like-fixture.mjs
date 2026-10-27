import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDotnetFixture } from "./dotnet-fixtures.mjs";
import { createDotnetModuleSpecifierPolicy, csharpDotnetProviderContributionKind } from "../../dist/public/provider-dotnet.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const directory = join(root, `.temp/ref-like-native-owner-${process.pid}`);
export const nativeRefLikeProject = join(directory, "RefLikeProof.csproj");
let fixture;

export function nativeRefLikeFixture() {
  if (fixture !== undefined) return fixture;
  mkdirSync(directory, { recursive: true });
  writeFileSync(nativeRefLikeProject, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup></Project>`);
  writeFileSync(join(directory, "Native.cs"), `namespace RefLikeProof;
public readonly ref struct Lease {
    public Lease(int value) { Value = value; }
    public int Value { get; }
}
public readonly ref struct Envelope<T> where T : allows ref struct {
    public Envelope(int value) { Value = value; }
    public int Value { get; }
}
public readonly ref struct DisposableLease : System.IDisposable {
    public DisposableLease(int value) { Value = value; }
    public int Value { get; }
    public void Dispose() { }
}
public readonly ref struct ConvertibleLease {
    public ConvertibleLease(int value) { Value = value; }
    public int Value { get; }
    public static implicit operator int(ConvertibleLease value) => value.Value;
}
public static class Methods {
    public static int Allowed<T>(T value) where T : allows ref struct => 7;
    public static int Ordinary<T>(T value) => 7;
}
public sealed class Box<T> {
    public Box() { }
    public int Value => 11;
}
`);
  const assembly = buildDotnetFixture({ project: nativeRefLikeProject, projectDirectory: directory,
    outputDirectory: join(directory, "bin"), intermediateDirectory: join(directory, "obj/"),
    outputAssemblyName: "RefLikeProof.dll" });
  const packageName = "@fixture/ref-like";
  const moduleSpecifierPolicy = createDotnetModuleSpecifierPolicy(packageName);
  const capability = { kind: "target-capability", id: packageName, targetId: "csharp", displayName: "Native ref-like owner proof",
    moduleOwnership: [{ specifierPrefix: moduleSpecifierPolicy.modulePrefix }], createTargetContributions: () => [{
      kind: csharpDotnetProviderContributionKind,
      providerIdentity: { id: "fixture.ref-like", version: "1.0.0", target: "csharp", displayName: "Native ref-like owner proof" },
      moduleSpecifierPolicy, referenceDirectoryUrl: pathToFileURL(`${dirname(assembly)}/`).href,
      assemblySourcePackages: [{ assemblyName: "RefLikeProof", packageName }], targetFramework: "net10.0",
    }] };
  fixture = { assembly, capability, project: nativeRefLikeProject };
  return fixture;
}
