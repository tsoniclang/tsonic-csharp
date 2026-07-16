using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed record Request(string NamespaceName, string ModuleSpecifier, string ModuleSpecifierPrefix, string SourcePackage, IReadOnlyList<AssemblySourcePackage> AssemblySourcePackages, bool AllModules, IReadOnlyList<string> Exports, IReadOnlyList<string> TargetIds, IReadOnlyList<string> MetadataNames, string? ReferenceDirectory, IReadOnlyList<string> References, string? AssemblyName)
{
    public static Request Parse(string[] args)
    {
        var namespaceName = "";
        var moduleSpecifier = "";
        var moduleSpecifierPrefix = "";
        var sourcePackage = "@tsonic/dotnet";
        var assemblySourcePackages = new List<AssemblySourcePackage>();
        var allModules = false;
        var exports = new List<string>();
        var targetIds = new List<string>();
        var metadataNames = new List<string>();
        string? referenceDirectory = null;
        var references = new List<string>();
        string? assemblyName = null;
        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];
            switch (arg)
            {
                case "--namespace":
                    namespaceName = RequiredValue(args, ref index, arg);
                    break;
                case "--module-specifier":
                    moduleSpecifier = RequiredValue(args, ref index, arg);
                    break;
                case "--module-specifier-prefix":
                    moduleSpecifierPrefix = RequiredValue(args, ref index, arg);
                    break;
                case "--source-package":
                    sourcePackage = RequiredValue(args, ref index, arg);
                    break;
                case "--assembly-source-package":
                    assemblySourcePackages.Add(ParseAssemblySourcePackage(RequiredValue(args, ref index, arg)));
                    break;
                case "--all-modules":
                    allModules = true;
                    break;
                case "--export":
                    exports.Add(RequiredValue(args, ref index, arg));
                    break;
                case "--target-id":
                    targetIds.Add(RequiredValue(args, ref index, arg));
                    break;
                case "--metadata-name":
                    metadataNames.Add(RequiredValue(args, ref index, arg));
                    break;
                case "--reference-dir":
                    referenceDirectory = RequiredValue(args, ref index, arg);
                    break;
                case "--reference":
                    references.Add(RequiredValue(args, ref index, arg));
                    break;
                case "--assembly-name":
                    assemblyName = RequiredValue(args, ref index, arg);
                    break;
                default:
                    throw new InvalidOperationException($"Unknown argument '{arg}'.");
            }
        }
        return new Request(namespaceName, moduleSpecifier, moduleSpecifierPrefix, sourcePackage, assemblySourcePackages, allModules, exports, targetIds, metadataNames, referenceDirectory, references, assemblyName);
    }

    static string RequiredValue(string[] args, ref int index, string name)
    {
        if (index + 1 >= args.Length)
        {
            throw new InvalidOperationException($"Argument '{name}' requires a value.");
        }
        index++;
        return args[index];
    }

    static AssemblySourcePackage ParseAssemblySourcePackage(string value)
    {
        var separator = value.IndexOf('=');
        if (separator <= 0 || separator == value.Length - 1 || value.IndexOf('=', separator + 1) >= 0)
        {
            throw new InvalidOperationException($"Invalid assembly source package '{value}'. Expected '<assembly-name>=<package-name>'.");
        }
        return new AssemblySourcePackage(value[..separator], value[(separator + 1)..]);
    }
}

sealed record AssemblySourcePackage(string AssemblyName, string PackageName);
