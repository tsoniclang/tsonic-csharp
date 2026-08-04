using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    ISet<string> CompleteSourceTargetIds(Type[] allTypes, ISet<string> sourceExportableTargetIds)
    {
        var completeExports = request.CompleteExports.ToHashSet(StringComparer.Ordinal);
        var completeExportIds = request.CompleteExportIds.ToHashSet(StringComparer.Ordinal);
        var allTypesByTargetId = allTypes.ToDictionary(TargetId, StringComparer.Ordinal);
        var completeTargetIds = allTypes
            .Where(type => sourceExportableTargetIds.Contains(TargetId(type)))
            .Where(type => request.CompleteAllExports ||
                completeExports.Contains(ProviderSourceExportName(type)) ||
                completeExportIds.Contains(TargetId(type)))
            .Select(TargetId)
            .ToHashSet(StringComparer.Ordinal);
        var pending = new Queue<string>(completeTargetIds);
        while (pending.Count > 0)
        {
            var targetId = pending.Dequeue();
            if (!allTypesByTargetId.TryGetValue(targetId, out var type) || type.BaseType is null)
            {
                continue;
            }
            var baseType = NormalizeClosureType(type.BaseType);
            if (baseType is null ||
                baseType.Namespace != activeNamespaceName ||
                !sourceExportableTargetIds.Contains(TargetId(baseType)) ||
                !completeTargetIds.Add(TargetId(baseType)))
            {
                continue;
            }
            pending.Enqueue(TargetId(baseType));
        }
        return completeTargetIds;
    }

    Type[] SourceClosureTypes(
        Type[] allTypes,
        Type[] exportedTypes,
        ISet<string> sourceExportableTargetIds,
        ISet<string> completeSourceTargetIds)
    {
        if (request.Exports.Count == 0 && request.TargetIds.Count == 0 && request.MetadataNames.Count == 0)
        {
            return [];
        }
        var allTypesByTargetId = allTypes.ToDictionary(TargetId, StringComparer.Ordinal);
        var sourceFamilyTypesByExportName = allTypes
            .Select(type => new
            {
                Type = type,
                Family = ProviderSourceTypeFamily(type),
            })
            .Where(entry => entry.Family is not null)
            .GroupBy(entry => entry.Family!.Value.ExportName, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(entry => entry.Type)
                    .OrderBy(TargetId, StringComparer.Ordinal)
                    .ToArray(),
                StringComparer.Ordinal);
        var exportedTargetIds = exportedTypes.Select(TargetId).ToHashSet(StringComparer.Ordinal);
        var closureTargetIds = new SortedSet<string>(StringComparer.Ordinal);
        var pendingTypes = new Queue<Type>(exportedTypes);
        var expandedTargetIds = new HashSet<string>(StringComparer.Ordinal);
        while (pendingTypes.Count > 0)
        {
            var pending = pendingTypes.Dequeue();
            if (!expandedTargetIds.Add(TargetId(pending)))
            {
                continue;
            }
            foreach (var dependency in DirectSourceDependencies(
                pending,
                completeSourceTargetIds.Contains(TargetId(pending))))
            {
                var normalized = NormalizeClosureType(dependency);
                if (normalized is null ||
                    normalized.Namespace != activeNamespaceName ||
                    exportedTargetIds.Contains(TargetId(normalized)) ||
                    !sourceExportableTargetIds.Contains(TargetId(normalized)) ||
                    !allTypesByTargetId.ContainsKey(TargetId(normalized)))
                {
                    continue;
                }
                foreach (var closureType in SourceClosureFamilyTypes(normalized, sourceFamilyTypesByExportName, sourceExportableTargetIds))
                {
                    var targetId = TargetId(closureType);
                    if (exportedTargetIds.Contains(targetId) ||
                        !sourceExportableTargetIds.Contains(targetId) ||
                        !allTypesByTargetId.ContainsKey(targetId))
                    {
                        continue;
                    }
                    closureTargetIds.Add(targetId);
                    if (!expandedTargetIds.Contains(targetId))
                    {
                        pendingTypes.Enqueue(closureType);
                    }
                }
            }
        }
        return closureTargetIds
            .Select(targetId => allTypesByTargetId[targetId])
            .Where(type => sourceExportableTargetIds.Contains(TargetId(type)))
            .ToArray();
    }

    IEnumerable<Type> DirectSourceDependencies(Type type, bool complete)
    {
        if (type.BaseType is not null && !IsRuntimeType(type.BaseType, typeof(object)))
        {
            foreach (var dependency in SourceDependencyTypes(type.BaseType))
            {
                yield return dependency;
            }
        }
        foreach (var contract in type.GetInterfaces())
        {
            foreach (var dependency in SourceDependencyTypes(contract))
            {
                yield return dependency;
            }
        }
        foreach (var typeParameter in type.GetGenericArguments().Where(parameter => parameter.IsGenericParameter))
        {
            foreach (var constraint in typeParameter.GetGenericParameterConstraints())
            {
                foreach (var dependency in SourceDependencyTypes(constraint))
                {
                    yield return dependency;
                }
            }
        }
        if (!complete)
        {
            yield break;
        }
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
        {
            foreach (var parameter in constructor.GetParameters())
            {
                foreach (var dependency in SourceDependencyTypes(parameter.ParameterType))
                {
                    yield return dependency;
                }
            }
        }
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            foreach (var dependency in SourceDependencyTypes(property.PropertyType))
            {
                yield return dependency;
            }
            foreach (var parameter in property.GetIndexParameters())
            {
                foreach (var dependency in SourceDependencyTypes(parameter.ParameterType))
                {
                    yield return dependency;
                }
            }
        }
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            foreach (var dependency in SourceDependencyTypes(field.FieldType))
            {
                yield return dependency;
            }
        }
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            if (eventInfo.EventHandlerType is not null)
            {
                foreach (var dependency in SourceDependencyTypes(eventInfo.EventHandlerType))
                {
                    yield return dependency;
                }
            }
        }
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            foreach (var dependency in SourceDependencyTypes(method.ReturnType))
            {
                yield return dependency;
            }
            foreach (var parameter in method.GetParameters())
            {
                foreach (var dependency in SourceDependencyTypes(parameter.ParameterType))
                {
                    yield return dependency;
                }
            }
            foreach (var methodParameter in method.GetGenericArguments())
            {
                foreach (var constraint in methodParameter.GetGenericParameterConstraints())
                {
                    foreach (var dependency in SourceDependencyTypes(constraint))
                    {
                        yield return dependency;
                    }
                }
            }
        }
    }

    static IEnumerable<Type> SourceDependencyTypes(Type type)
    {
        type = UnwrapByRef(type);
        if (type.IsPointer || type.IsGenericParameter || IsRuntimeType(type, typeof(void)))
        {
            yield break;
        }
        if (type.IsArray)
        {
            foreach (var dependency in SourceDependencyTypes(type.GetElementType()!))
            {
                yield return dependency;
            }
            yield break;
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            foreach (var dependency in SourceDependencyTypes(nullableElement))
            {
                yield return dependency;
            }
            yield break;
        }
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            yield return type.GetGenericTypeDefinition();
            foreach (var argument in type.GetGenericArguments())
            {
                foreach (var dependency in SourceDependencyTypes(argument))
                {
                    yield return dependency;
                }
            }
            yield break;
        }
        yield return type;
    }

    static Type? NormalizeClosureType(Type type)
    {
        type = UnwrapByRef(type);
        if (type.IsPointer || type.IsGenericParameter || IsRuntimeType(type, typeof(void)))
        {
            return null;
        }
        if (type.IsArray)
        {
            return NormalizeClosureType(type.GetElementType()!);
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            return NormalizeClosureType(nullableElement);
        }
        return type.IsGenericType && !type.IsGenericTypeDefinition
            ? type.GetGenericTypeDefinition()
            : type;
    }

    Type[] SourceClosureFamilyTypes(
        Type type,
        IReadOnlyDictionary<string, Type[]> sourceFamilyTypesByExportName,
        ISet<string> sourceExportableTargetIds)
    {
        var family = ProviderSourceTypeFamily(type);
        if (family is null ||
            !sourceFamilyTypesByExportName.TryGetValue(family.Value.ExportName, out var familyTypes))
        {
            return new[] { type };
        }
        return familyTypes
            .Where(candidate => sourceExportableTargetIds.Contains(TargetId(candidate)))
            .ToArray();
    }
}
