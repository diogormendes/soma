#!/bin/bash
echo "Baixando o NOVO esquema oficial do seu Mac (192.168.15.119)..."
curl -s http://192.168.15.119:8000/web/lib/db/schema.sql -o schema.sql

echo "Apagando o banco antigo..."
docker compose down -v
docker compose up -d postgres
echo "Aguardando 10 segundos para o Postgres inicializar..."
sleep 10

echo "Injetando o esquema OFICIAL completo..."
cat schema.sql | docker compose exec -T postgres psql -U drmPostGres -d soma_db

echo "Subindo tudo!"
docker compose up -d
echo "Tudo pronto e atualizado com a versão oficial do autor!"
