#!/bin/bash
echo "Baixando o motor de backfill histórico (10 anos de limite)..."
curl -s http://192.168.15.119:8000/web-backfill.tar.gz | tar xz

echo "Extraindo configurações..."
docker compose exec -T soma env > soma_env.tmp

echo "Iniciando a MEGA sincronização! Isso vai demorar BASTANTE (pode levar 10+ minutos)..."
docker run --rm -v $(pwd)/web:/app -w /app --network soma_default --env-file soma_env.tmp node:22-alpine sh -c "npm ci && npx tsx scripts/sync-pipeline.mts"

rm soma_env.tmp
echo "MEGA Sincronização finalizada! Seu histórico deve estar completo."
