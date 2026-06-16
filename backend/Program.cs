using ERPWEB.Dbcontext;
using ERPWEB.Middleware;
using ERPWEB.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// 1. CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.AllowAnyOrigin()
       .AllowAnyHeader()
       .AllowAnyMethod();
              
    });
});

// 2. JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };
});

// 3. Controllers & Swagger (with JWT support in Swagger UI)
builder.Services.AddControllers()
    .AddJsonOptions(o => {
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    })
    .ConfigureApiBehaviorOptions(o =>
    {
        // Log model binding / validation failures that would otherwise silently return 400
        // before the controller action runs.
        o.InvalidModelStateResponseFactory = ctx =>
        {
            var dbcon  = ctx.HttpContext.RequestServices.GetRequiredService<DbCon>();
            var errors = string.Join(" | ", ctx.ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage));
            var fakeEx = new Exception($"Model binding failed: {errors}");
            var rv = ctx.ActionDescriptor.RouteValues;
            _ = dbcon.WriteLog(fakeEx,
                controller:  rv.TryGetValue("controller", out var ctrl)   ? ctrl   : null,
                action:      rv.TryGetValue("action",     out var act)    ? act    : null,
                requestPath: ctx.HttpContext.Request.Path);
            return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(new { message = errors });
        };
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "ERPWEB API", Version = "v1" });

    // Adds the "Authorize" button in Swagger UI
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter: Bearer {your token}"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id   = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// 4. Register services
builder.Services.AddSingleton<LicenseService>();
builder.Services.AddScoped<DbCon>();
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<ERPWEB.Services.EmailAlertProcessorService>();
builder.Services.AddHostedService<ERPWEB.Services.AlertSchedulerService>();
builder.Services.AddHostedService<ERPWEB.Services.CreditHoldSchedulerService>();

var app = builder.Build();

// 5. Middleware pipeline
//if (app.Environment.IsDevelopment())
//{
    app.UseSwagger();
    app.UseSwaggerUI();
//}

app.UseCors("AllowReactApp");       // CORS before everything
if (!app.Environment.IsDevelopment())
    app.UseMiddleware<LicenseMiddleware>();
app.UseStaticFiles();               // serves wwwroot (uploads, logos, etc.)
app.UseHttpsRedirection();
app.UseAuthentication();            // MUST come before UseAuthorization
app.UseAuthorization();

app.MapControllers();

app.Run();
