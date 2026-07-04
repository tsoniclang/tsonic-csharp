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
        var assembly = ModuleAssemblyReference(allTypes);
        var requestedExports = request.Exports.Count == 0
            ? null
            : request.Exports.ToHashSet(StringComparer.Ordinal);
        var requestedTargetIds = request.TargetIds.Count == 0
            ? null
            : request.TargetIds.ToHashSet(StringComparer.Ordinal);
        var requestedMetadataNames = request.MetadataNames.Count == 0
            ? null
            : request.MetadataNames.ToHashSet(StringComparer.Ordinal);
        var requestedSlice = requestedExports is not null ||
            requestedTargetIds is not null ||
            requestedMetadataNames is not null;
        var sourceGroups = allTypes
            .GroupBy(ProviderSourceTypeName, StringComparer.Ordinal)
            .Select(group => new
            {
                SourceName = group.Key,
                AllTypes = group.OrderBy(TargetId, StringComparer.Ordinal).ToArray(),
            })
            .OrderBy(group => group.SourceName, StringComparer.Ordinal)
            .ToArray();
        var requestedSourceGroups = sourceGroups
            .Select(group => new
            {
                group.SourceName,
                group.AllTypes,
                RequestedTypes = group.AllTypes
                    .Where(type => IncludesRequestedType(type, requestedExports, requestedTargetIds, requestedMetadataNames))
                    .ToArray(),
            })
            .Where(group => group.RequestedTypes.Length > 0)
            .ToArray();
        var sourceExportableTargetIds = sourceGroups
            .Where(group => group.AllTypes.Length == 1)
            .Select(group => group.AllTypes[0])
            .Where(type => UnsupportedSourceExportReason(type) is null)
            .Select(TargetId)
            .ToHashSet(StringComparer.Ordinal);
        var exportCandidates = requestedSourceGroups
            .Where(group => group.AllTypes.Length == 1)
            .Select(group => group.RequestedTypes[0])
            .ToArray();
        var exportTypes = exportCandidates
            .Where(type => UnsupportedSourceExportReason(type) is null)
            .ToArray();
        var exportTypeNames = exportTypes.Select(TargetId).ToHashSet(StringComparer.Ordinal);
        var closureTypes = SourceClosureTypes(allTypes, exportTypes, sourceExportableTargetIds);
        var unsupportedExports = requestedSourceGroups
            .Where(group => group.AllTypes.Length > 1)
            .Select(group => ToUnsupportedTypeFamilyExport(group.SourceName, group.AllTypes))
            .Concat(exportCandidates
                .Select(type => ToUnsupportedTypeExport(type, UnsupportedSourceExportReason(type)))
                .Where(export => export is not null)
                .Cast<object>())
            .ToArray();
        var targetOnlyCandidates = requestedSlice
            ? allTypes.Where(type => IsRequestedTargetType(type, requestedTargetIds, requestedMetadataNames))
            : allTypes;
        var targetOnlyTypes = targetOnlyCandidates
            .Where(type => !exportTypeNames.Contains(TargetId(type)))
            .Select(ToTypeExport)
            .Where(export => export is not null)
            .Cast<object>()
            .ToArray();

        var exports = exportTypes
            .Select(ToTypeExport)
            .Where(export => export is not null)
            .Cast<object>()
            .Concat(closureTypes.Select(ToClosureTypeExport).Where(export => export is not null).Cast<object>())
            .ToArray();

        return new
        {
            moduleSpecifier = activeModuleSpecifier,
            namespaceName = activeNamespaceName,
            assembly,
            exports,
            targetOnlyTypes = targetOnlyTypes.Length == 0 ? null : targetOnlyTypes,
            unsupportedExports = unsupportedExports.Length == 0 ? null : unsupportedExports,
        };
    }

    bool IncludesRequestedType(
        Type type,
        ISet<string>? requestedExports,
        ISet<string>? requestedTargetIds,
        ISet<string>? requestedMetadataNames)
    {
        if (requestedExports is null && requestedTargetIds is null && requestedMetadataNames is null)
        {
            return true;
        }
        return requestedExports?.Contains(ProviderSourceTypeName(type)) == true ||
            requestedTargetIds?.Contains(TargetId(type)) == true ||
            requestedMetadataNames?.Contains(MetadataName(type)) == true;
    }

    static bool IsRequestedTargetType(
        Type type,
        ISet<string>? requestedTargetIds,
        ISet<string>? requestedMetadataNames)
    {
        return requestedTargetIds?.Contains(TargetId(type)) == true ||
            requestedMetadataNames?.Contains(MetadataName(type)) == true;
    }

    static object? ModuleAssemblyReference(Type[] types)
    {
        var assemblies = types
            .Select(type => type.Assembly)
            .GroupBy(AssemblyIdentity, StringComparer.Ordinal)
            .ToArray();
        return assemblies.Length == 1 ? AssemblyReference(assemblies[0].First()) : null;
    }
}
