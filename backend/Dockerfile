# Build context must be the repository root (Render default).
# docker-compose also uses repo root — see docker-compose.yml.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/backend.csproj ./backend/
RUN dotnet restore ./backend/backend.csproj

COPY backend/ ./backend/
RUN dotnet publish ./backend/backend.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/data

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5000
ENV ConnectionStrings__DefaultConnection=Data Source=/app/data/learnchain.db

EXPOSE 5000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD sh -c 'curl -f http://localhost:${PORT:-5000}/health || exit 1'

ENTRYPOINT ["dotnet", "backend.dll"]
