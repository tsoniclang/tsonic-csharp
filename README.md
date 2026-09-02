# `@tsonic/target-csharp`

C# target pack for Tsonic. This package owns C# target analysis, exact .NET
provider relations, Roslyn-shaped planning and printing, generated `.csproj`
artifacts, and .NET toolchain handoff.

Canonical product documentation lives in the Tsonic repository:

- [C# manual](https://github.com/tsoniclang/tsonic/tree/main/docs/manual/targets/csharp)
- [C# reference](https://github.com/tsoniclang/tsonic/tree/main/docs/reference/targets/csharp)
- [Target-pack architecture](https://github.com/tsoniclang/tsonic/blob/main/docs/architecture/target-pack-contract.md)

## Package entry points

| Export | Purpose |
| --- | --- |
| `@tsonic/target-csharp` | Target plugin |
| `@tsonic/target-csharp/provider` | Generic C# provider-authoring contract |
| `@tsonic/target-csharp/provider/dotnet` | .NET provider-authoring helpers |

## Development

The sibling Tsonic packages and runtime repositories must be available through
the workspace dependencies.

```sh
npm install
npm run build
npm test
```

`npm test` runs the repository through Tsonic's bounded parallel test harness.
