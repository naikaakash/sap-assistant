var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddOpenApi();

var app = builder.Build();

app.MapDefaultEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseHttpsRedirection();
}

var api = app.MapGroup("/api");

api.MapGet("/hello", () => new { message = "Hello from SapAssistant.Api", utc = DateTime.UtcNow })
   .WithName("Hello");

app.Run();

public partial class Program;
