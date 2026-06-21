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
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            foreach (var type in ExportedTypes(assembly))
            {
                yield return type;
            }
        }
        foreach (var path in AssemblyPaths())
        {
            Assembly assembly;
            try
            {
                assembly = assembliesByPath.GetOrAdd(path, static candidate => AssemblyLoadContext.Default.LoadFromAssemblyPath(candidate));
            }
            catch
            {
                continue;
            }

            foreach (var type in ExportedTypes(assembly))
            {
                yield return type;
            }
        }
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

    static IEnumerable<Type> ExportedTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetExportedTypes();
        }
        catch (ReflectionTypeLoadException exception)
        {
            return exception.Types.Where(type => type is not null).Cast<Type>().ToArray();
        }
        catch
        {
            return Array.Empty<Type>();
        }
    }

    IEnumerable<string> AssemblyPaths()
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
        if (request.ReferenceDirectory is not null && Directory.Exists(request.ReferenceDirectory))
        {
            foreach (var path in Directory.EnumerateFiles(request.ReferenceDirectory, "*.dll"))
            {
                paths.Add(Path.GetFullPath(path));
            }
        }
        foreach (var reference in request.References)
        {
            if (File.Exists(reference))
            {
                paths.Add(Path.GetFullPath(reference));
            }
        }
        return paths;
    }
}
