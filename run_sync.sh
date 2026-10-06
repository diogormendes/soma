#!/bin/bash
echo "Baixando o código fonte do motor de sincronização..."
curl -s http://192.168.15.119:8000/web.tar.gz | tar xz

echo "Extraindo configurações do seu aplicativo..."
docker compose exec -T soma env > soma_env.tmp

echo "Iniciando a sincronização local de dados no NAS (isso pode demorar 1-2 minutos)..."
docker run --rm -v $(pwd)/web:/app -w /app --network soma_default --env-file soma_env.tmp node:22-alpine sh -c "npm ci && npx tsx scripts/sync-pipeline.mts"

rm soma_env.tmp
echo "Sincronização finalizada! Recarregue a página do Soma no navegador."
