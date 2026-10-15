using System.Runtime.InteropServices;

namespace ProviderDefaultFixtures;

public enum DefaultMode
{
    None = 0,
    Enabled = 2,
}

public sealed class DefaultParameterSource
{
    public void WithDefaults(
        string text = "proved",
        int count = 7,
        bool enabled = true,
        char marker = 'x',
        decimal amount = 12.5m,
        DefaultMode mode = DefaultMode.Enabled,
        string? nullableText = null)
    {
    }

    public void OptionalWithoutDefault([Optional] string value)
    {
    }

    public void Required(string value)
    {
    }
}
