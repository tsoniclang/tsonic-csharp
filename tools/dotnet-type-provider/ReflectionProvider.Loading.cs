using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    IEnumerable<Type> LoadTypes()
    {
        RuntimeAssemblyRoots();
        var runtimePaths = RuntimeAssemblyPaths().ToHashSet(StringComparer.Ordinal);
        var referencePaths = ReferenceDirectoryAssemblyPaths()
            .Concat(ExplicitReferenceAssemblyPaths())
            .ToHashSet(StringComparer.Ordinal);
        var currentRequestPaths = runtimePaths
            .Concat(referencePaths)
            .ToHashSet(StringComparer.Ordinal);
        var loadedPaths = new HashSet<string>(StringComparer.Ordinal);
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (string.IsNullOrEmpty(assembly.Location))
            {
                continue;
            }
            var path = Path.GetFullPath(assembly.Location);
            if (!currentRequestPaths.Contains(path))
            {
                continue;
            }
            loadedPaths.Add(path);
            foreach (var type in ExportedTypes(assembly, path, referencePaths.Contains(path)))
            {
                yield return type;
            }
        }
        foreach (var path in currentRequestPaths)
        {
            if (loadedPaths.Contains(path))
            {
                continue;
            }
            foreach (var type in LoadTypesFromAssemblyPath(path, failOnError: referencePaths.Contains(path)))
            {
                yield return type;
            }
        }
    }

    IEnumerable<Type> LoadTypesFromAssemblyPath(string path, bool failOnError)
    {
        Assembly assembly;
        try
        {
            assembly = assembliesByPath.GetOrAdd(path, static candidate => AssemblyLoadContext.Default.LoadFromAssemblyPath(candidate));
        }
        catch (Exception) when (!failOnError)
        {
            return Array.Empty<Type>();
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"Unable to load explicit .NET reference assembly '{path}': {exception.Message}", exception);
        }

        return ExportedTypes(assembly, path, failOnError);
    }

    static void RuntimeAssemblyRoots()
    {
        _ = typeof(object);
        _ = typeof(Console);
        _ = typeof(Math);
        _ = typeof(List<>);
        _ = typeof(Dictionary<,>);
        _ = typeof(File);
        _ = typeof(Path);
        _ = typeof(Enumerable);
    }

    static IEnumerable<Type> ExportedTypes(Assembly assembly, string? path = null, bool failOnError = false)
    {
        try
        {
            return assembly.GetExportedTypes();
        }
        catch (ReflectionTypeLoadException exception)
        {
            return exception.Types.Where(type => type is not null).Cast<Type>().ToArray();
        }
        catch (Exception) when (!failOnError)
        {
            return Array.Empty<Type>();
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"Unable to read exported types from explicit .NET reference assembly '{path ?? assembly.FullName}': {exception.Message}", exception);
        }
    }

    IEnumerable<string> RuntimeAssemblyPaths()
    {
        var paths = new SortedSet<string>(StringComparer.Ordinal);
        var runtimeDirectory = Path.GetDirectoryName(typeof(object).Assembly.Location);
        if (runtimeDirectory is not null)
        {
            foreach (var path in Directory.EnumerateFiles(runtimeDirectory, "*.dll"))
            {
                paths.Add(Path.GetFullPath(path));
            }
        }
        return paths;
    }

    IEnumerable<string> ReferenceDirectoryAssemblyPaths()
    {
        var paths = new SortedSet<string>(StringComparer.Ordinal);
        if (request.ReferenceDirectory is not null && Directory.Exists(request.ReferenceDirectory))
        {
            foreach (var path in Directory.EnumerateFiles(request.ReferenceDirectory, "*.dll"))
            {
                paths.Add(Path.GetFullPath(path));
            }
        }
        else if (request.ReferenceDirectory is not null)
        {
            throw new InvalidOperationException($"Explicit .NET reference directory '{request.ReferenceDirectory}' does not exist.");
        }
        return paths;
    }

    IEnumerable<string> ExplicitReferenceAssemblyPaths()
    {
        var paths = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var reference in request.References)
        {
            if (File.Exists(reference))
            {
                paths.Add(Path.GetFullPath(reference));
                continue;
            }
            throw new InvalidOperationException($"Explicit .NET reference assembly '{reference}' does not exist.");
        }
        return paths;
    }
}
