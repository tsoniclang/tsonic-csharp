using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed record Request(string NamespaceName, string ModuleSpecifier, string ModuleSpecifierPrefix, bool AllModules, IReadOnlyList<string> Exports, string? ReferenceDirectory, IReadOnlyList<string> References)
{
    public static Request Parse(string[] args)
    {
        var namespaceName = "";
        var moduleSpecifier = "";
        var moduleSpecifierPrefix = "";
        var allModules = false;
        var exports = new List<string>();
        string? referenceDirectory = null;
        var references = new List<string>();
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
                case "--all-modules":
                    allModules = true;
                    break;
                case "--export":
                    exports.Add(RequiredValue(args, ref index, arg));
                    break;
                case "--reference-dir":
                    referenceDirectory = RequiredValue(args, ref index, arg);
                    break;
                case "--reference":
                    references.Add(RequiredValue(args, ref index, arg));
                    break;
                default:
                    throw new InvalidOperationException($"Unknown argument '{arg}'.");
            }
        }
        return new Request(namespaceName, moduleSpecifier, moduleSpecifierPrefix, allModules, exports, referenceDirectory, references);
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
}
