FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# 复制整个 backend 目录的内容
COPY . .

# 明确指定项目文件进行还原和发布
RUN dotnet restore "backend.csproj"
RUN dotnet publish "backend.csproj" -c Release -o /app/publish

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
    CMD curl -f http://localhost:5000/health || exit 1

ENTRYPOINT ["dotnet", "backend.dll"]