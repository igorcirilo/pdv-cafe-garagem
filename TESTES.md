# Verificação da adaptação local

Ambiente de execução: Linux, Node.js 24.22.1. Testes usam SQLite real e um servidor
HTTP real em porta temporária; não usam o banco operacional do usuário.

## Verificações automáticas

`npm run check` executa:

- 9 testes de integração do servidor e SQLite, incluindo venda, cancelamento,
  edição com falha e com sucesso, pagamentos, caixa fechado, estoque insuficiente,
  reversão integral de transações, produção sob demanda e em lote, receitas-base,
  CMV, compras de insumos, lote misto, prevenção de lote duplicado, contas a pagar,
  baixa e estorno, ajustes, fechamento de comandas, consultas aninhadas, filtros,
  contagem, paginação, retenção de 30 backups, validação de backup, restauração,
  preservação do banco quando o backup é inválido, reinício e persistência,
  acesso sem autenticação, rejeição de Host/Origin externos e tabelas privadas.
- 38 testes Vitest/Testing Library da interface e regras de dinheiro, datas e estoque.
  Inclui uma verificação de que o App abre diretamente no caixa e não oferece login.
- Compilação TypeScript estrita e build de produção Vite.

`npm run lint` verifica o código TypeScript/React com ESLint.

## Teste opcional em navegador real

O roteiro reproduzível `scripts/e2e.mjs` abre um banco temporário, verifica acesso
sem login, percorre os 9 módulos, confere ausência de requisições externas e
exercita download e restauração pela interface. Para executar no Windows:

```powershell
npm.cmd ci
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Esta verificação **não foi concluída neste ambiente**: o Chromium instalado não
pôde iniciar porque o ambiente bloqueou a criação do socket local do navegador
(`Operation not permitted`). Portanto, não há alegação de aprovação E2E.

## Limites da validação

Os arquivos BAT foram preparados com CRLF, caminhos relativos à própria pasta,
`cd /d` e `call npm` para Windows. Não foram executados em Windows real aqui.
O roteiro manual para o computador de destino é:

1. Extrair o pacote para uma pasta com permissão de escrita.
2. Executar INSTALAR.bat, depois INICIAR.bat.
3. Confirmar que abre diretamente em http://127.0.0.1:3210.
4. Abrir caixa; cadastrar produto/insumo e estoque; registrar venda.
5. Fechar e reabrir, e confirmar que os dados continuam presentes.
6. Baixar backup; alterar um cadastro; restaurar e conferir a versão anterior.
7. Executar TESTAR.bat.

Não foi feita migração de dados de um serviço externo, pois o arquivo enviado
contém somente o código-fonte e não contém uma exportação de cadastros/vendas.

Resultado: **47 testes aprovados** (9 do servidor + 38 da interface/regras).

## Atualização Café Garagem

Dois testes adicionais verificam os 30 produtos, oito categorias, preços, estoque inicial zero, importação única, preservação de dados existentes e compatibilidade de banco/backup anterior sem categoria. O iniciador aceita Node.js >=24; a versão 26 não foi executada neste ambiente.

Resultado desta atualização: **50 testes aprovados** (11 de SQLite/API/catálogo + 39 da interface/regras). O teste da interface do catálogo verifica filtro por categoria e edição de preço.
