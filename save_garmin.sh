#!/bin/bash
read -p "Cole aqui a URL inteira (https://sso.garmin.com/sso/embed?ticket=ST-...) que você copiou do navegador: " URL
TICKET=$(echo "$URL" | grep -o 'ticket=.*' | cut -d '=' -f 2)

if [ -z "$TICKET" ]; then
    echo "Não encontrei o ticket na URL. Tem certeza que copiou certo?"
    exit 1
fi

echo "Trocando o ticket pelos tokens no novo servidor da Garmin..."
curl -s -X POST https://garmin-auth-sso.gkos.workers.dev/exchange \
     -H "Content-Type: application/json" \
     -d "{\"ticket\":\"$TICKET\"}" > tokens.json

echo "Salvando os tokens no banco de dados do seu Soma..."
curl -s -X POST http://localhost:3456/api/connections/garmin/ticket \
     -H "Content-Type: application/json" \
     -d @tokens.json > result.json

if grep -q '"ok":true' result.json; then
    echo "✅ SUCESSO! A sua conta da Garmin foi autorizada com o MFA e já está conectada!"
else
    echo "❌ Ops, ocorreu um erro ao salvar:"
    cat result.json
fi

rm tokens.json result.json
