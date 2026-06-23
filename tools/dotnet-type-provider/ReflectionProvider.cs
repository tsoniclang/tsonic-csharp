using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    readonly Request request;
    readonly ConcurrentDictionary<string, Assembly> assembliesByPath = new(StringComparer.Ordinal);
    Dictionary<string, SourceReference> providerSourceReferencesByTargetId = new(StringComparer.Ordinal);
    string moduleSpecifierPrefix = "";
    string activeNamespaceName;
    string activeModuleSpecifier;

    public ReflectionProvider(Request request)
    {
        this.request = request;
        activeNamespaceName = request.NamespaceName;
        activeModuleSpecifier = request.ModuleSpecifier;
    }

    public object GetModule()
    {
        var loadedTypes = LoadPublicTypes();
        moduleSpecifierPrefix = GetModuleSpecifierPrefix();
        providerSourceReferencesByTargetId = SourceReferencesByTargetId(loadedTypes);
        return BuildModule(loadedTypes, activeNamespaceName, activeModuleSpecifier);
    }

    public object GetModules()
    {
        var loadedTypes = LoadPublicTypes();
        moduleSpecifierPrefix = request.ModuleSpecifierPrefix;
        providerSourceReferencesByTargetId = SourceReferencesByTargetId(loadedTypes);
        return loadedTypes
            .Where(type => type.Namespace is not null)
            .Select(type => type.Namespace!)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(namespaceName => namespaceName, StringComparer.Ordinal)
            .Select(namespaceName => BuildModule(loadedTypes, namespaceName, ModuleSpecifierForNamespace(namespaceName)))
            .ToArray();
    }

    Type[] LoadPublicTypes()
    {
        return LoadTypes()
            .Where(type => type.IsPublic || type.IsNestedPublic)
            .Where(type => !type.IsSpecialName)
            .GroupBy(TargetId, StringComparer.Ordinal)
            .Select(group => group.First())
            .OrderBy(type => TargetId(type), StringComparer.Ordinal)
            .ToArray();
    }

    object BuildModule(Type[] loadedTypes, string namespaceName, string moduleSpecifier)
    {
        activeNamespaceName = namespaceName;
        activeModuleSpecifier = moduleSpecifier;
        var allTypes = loadedTypes
            .Where(type => type.Namespace == activeNamespaceName)
            .ToArray();
        var sourceGroups = allTypes
            .Where(type => !type.IsNested)
            .GroupBy(SourceTypeName, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .ToArray();
        var exportTypes = sourceGroups
            .Where(group => group.Count() == 1)
            .Select(group => group.First())
            .ToArray();
        var exportTypeNames = exportTypes.Select(TargetId).ToHashSet(StringComparer.Ordinal);
        var unsupportedExports = sourceGroups
            .Where(group => group.Count() > 1)
            .Select(ToUnsupportedTypeFamilyExport)
            .Concat(allTypes.Where(type => type.IsNested).Select(ToUnsupportedNestedTypeExport))
            .ToArray();
        var targetOnlyTypes = allTypes
            .Where(type => !exportTypeNames.Contains(TargetId(type)))
            .Select(ToTypeExport)
            .Where(export => export is not null)
            .Cast<object>()
            .ToArray();

        var exports = exportTypes
            .Select(ToTypeExport)
            .Where(export => export is not null)
            .Cast<object>()
            .ToArray();

        return new
        {
            moduleSpecifier = activeModuleSpecifier,
            namespaceName = activeNamespaceName,
            exports,
            targetOnlyTypes = targetOnlyTypes.Length == 0 ? null : targetOnlyTypes,
            unsupportedExports = unsupportedExports.Length == 0 ? null : unsupportedExports,
        };
    }
}
