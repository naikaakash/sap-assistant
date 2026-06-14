using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SapAssistant.Api.Tests;

public class HelloEndpointTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Hello_returns_message_payload()
    {
        var response = await _client.GetAsync("/api/hello");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<HelloPayload>();
        Assert.NotNull(payload);
        Assert.Equal("Hello from SapAssistant.Api", payload!.Message);
    }

    private sealed record HelloPayload(string Message, DateTime Utc);
}
