namespace ProviderEventFixtures;

public unsafe delegate void PointerEventHandler(int* value);

public unsafe sealed class EventSource
{
    public event PointerEventHandler? PointerEvent;

    public void Raise(int* value)
    {
        PointerEvent?.Invoke(value);
    }
}
