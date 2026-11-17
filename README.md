# Café Garagem PDV — SQLite local, sem login

Versão adaptada para um computador Windows. O sistema abre diretamente no PDV,
sem criar conta e sem pedir senha. Todos os registros usam **Operador local**.
Os módulos de vendas, comandas, caixa, revenda, estoque, fichas técnicas,
produção, contas a pagar e relatórios usam um arquivo SQLite no computador.
Nenhuma chave, conta, banco em nuvem ou instalação separada de SQLite é necessária.

## Começar no Windows

1. Instale **Node.js 24 ou superior, 64 bits**, de <https://nodejs.org/>. Marque a opção
   de adicionar ao PATH. Feche e reabra o terminal após instalar.
2. Extraia o ZIP completo para uma pasta sua, por exemplo `C:\CafeGaragem`.
   Não execute de dentro do ZIP, de `Arquivos de Programas` ou de uma pasta de rede.
3. Na primeira instalação, dê dois cliques em **INSTALAR.bat**. É necessária
   internet para baixar as dependências. Aguarde a mensagem de conclusão.
4. Dê dois cliques em **INICIAR.bat** e mantenha essa janela aberta.
5. Abra **http://127.0.0.1:3210** no Chrome ou Edge. O acesso é direto, sem login.
6. Em **Dashboard**, abra o caixa. Cadastre fornecedores/insumos em **Estoque**,
   os produtos em **Revenda**, e configure receitas em **Fichas** conforme necessário.
   Depois volte a **PDV Caixa** para vender.

Depois da instalação, o uso diário e os backups funcionam sem internet.
O ZIP inclui o código-fonte e a interface já compilada em `dist`; o servidor
usa apenas módulos nativos do Node.js e também pode iniciar com `node server/index.mjs`
sem instalar dependências, se você não precisar recompilar nem executar os testes.
O Node.js continua sendo necessário. Este pacote não inclui instalador `.exe`.

Para fechar, pressione **Ctrl+C** na janela do servidor. Fechar somente a aba do
navegador deixa o servidor em execução. Para voltar a usar, execute INICIAR.bat.

## Onde ficam os dados

- `dados/pdv.sqlite`: banco principal, criado automaticamente no primeiro uso.
- `dados/pdv.sqlite-wal` e `dados/pdv.sqlite-shm`: arquivos auxiliares enquanto o
  servidor está funcionando. Não os apague nem copie só o banco durante o uso.
- `dados/backups/`: cópias de segurança.

O catálogo do Café Garagem é importado automaticamente uma única vez (30 produtos em 8 categorias). Os preços seguem a foto recebida; estoque e custos iniciais são zero. Veja ATUALIZAR_CAFE_GARAGEM.txt para atualizar preservando os seus dados.

A pasta `dados` não vem preenchida: o projeto enviado contém código, não os dados
que eventualmente estejam em um banco externo. Esta edição começa com o catálogo do Café Garagem, saldo bancário zero e parâmetros de precificação iniciais. Dados antigos
não são importados automaticamente.

Não apague `dados` ao atualizar a aplicação. Não use o banco em pasta compartilhada,
OneDrive/Dropbox com sincronização ativa ou unidade de rede. Para transferir de PC,
use um backup pelo sistema e restaure-o no outro computador.

Opcional: a variável de ambiente `PDV_DATA_DIR` define outra pasta local para os
dados. Ela deve ser a mesma em todos os comandos. O padrão é a pasta `dados` do projeto.

## Backup e restauração

Abra **Backup e restauração — SQLite local**, acima do módulo atual.

- **Baixar backup agora** cria uma cópia consistente e a baixa pelo navegador.
  Outra cópia fica em `dados/backups`.
- **Restaurar backup** pede a escolha de um arquivo `.sqlite` e uma confirmação.
  Valida a integridade, a versão e a estrutura antes de substituir os dados.
  Cria uma cópia `antes-restauracao-...sqlite` antes da substituição e recarrega a tela.
- O servidor cria backup **ao iniciar e a cada hora em funcionamento**. Mantém
  os **30 backups automáticos mais recentes**. Backups manuais e anteriores à
  restauração são preservados até você apagá-los.

Guarde cópias em outro disco ou pen drive: os backups na mesma unidade não protegem
contra perda ou avaria dessa unidade. Não há envio automático para a nuvem.
Os backups contêm todos os dados comerciais e não são criptografados.
Restauração substitui todo o banco; não mescla cadastros nem vendas.
O envio pela interface aceita até 100 MB; use o comando de restauração para maiores.

Com o PDV **fechado**, também é possível:

- Executar **BACKUP.bat**.
- Arrastar um backup sobre **RESTAURAR.bat**, e confirmar com S.
- Pelo terminal na pasta do projeto: `npm run backup` ou
  `npm run restore -- "C:\caminho\backup.sqlite"`.

A aplicação impede que dois servidores ou comandos de manutenção usem a mesma
pasta simultaneamente. Se houver queda de energia, a trava de processo órfã é
recuperada no próximo início. Nunca remova uma trava com o PDV aberto.

## Testes e desenvolvimento

Após INSTALAR.bat, execute **TESTAR.bat**, ou no terminal:

```powershell
npm run check
```

Esse comando executa testes reais do SQLite/HTTP, os testes da interface e a
compilação TypeScript/Vite. Os testes usam pastas temporárias e não alteram `dados`.
O detalhamento da verificação acompanha o pacote em `TESTES.md`.

```powershell
npm ci
npm run test:server
npm test
npm run build
npm run dev
```

`npm run dev` inicia API local na porta 3210 e Vite na 5173. Para uso diário, use
`npm start` ou INICIAR.bat, que servem a interface compilada na porta 3210.
As dependências de desenvolvimento são necessárias somente para editar, compilar e testar.

## Arquitetura e limites

- Interface React/TypeScript preservada e cliente HTTP próprio em `src/lib/localDB.ts`.
- API Node.js com `node:sqlite`; banco real no disco, sem localStorage/IndexedDB.
- Transações indivisíveis para vendas, edição/cancelamento, produção, compras e
  baixa/estorno de contas. Falhas desfazem estoque e financeiro da mesma operação.
- Fechamento de comanda e venda acontecem na mesma transação.
- Senhas e usuários não são necessários nem existem nesta edição. Qualquer pessoa
  com acesso ao computador pode operar o PDV. O servidor escuta somente em
  `127.0.0.1` e rejeita Host/Origin externos; não publique a porta na internet.
- Concebido para **um computador/uma operação local**. Não é uma solução de rede
  multiusuário. As consultas de relatórios percorrem registros em memória e podem
  precisar de otimização para bases grandes.
- Mantém a moeda BRL e os meios de pagamento da interface original.
  Não inclui emissão fiscal/NFC-e/SAT, integração bancária ou comprovativo fiscal.
- Sem download de fontes externas em tempo de execução.

## Problemas comuns no Windows

- **node não é reconhecido:** instale Node.js 24 ou superior e reabra o terminal.
- **npm.ps1 bloqueado:** use os arquivos `.bat`, o Prompt de Comando, ou `npm.cmd`
  no PowerShell; não é necessário alterar a política de execução do Windows.
- **Porta ocupada / PDV já aberto:** procure outra janela INICIAR.bat em execução,
  feche com Ctrl+C e tente novamente. O endereço padrão é 127.0.0.1:3210.
- **Tela não reflete alterações:** execute INSTALAR.bat novamente para recompilar
  e atualize o navegador com Ctrl+F5. Preserve a pasta `dados`.
- **Servidor indisponível:** mantenha INICIAR.bat aberto e confira erros na janela.
- **Arquivo de backup inválido:** use um `.sqlite` gerado nesta edição. O banco
  atual é preservado se a validação falhar.

Código original sob licença MIT (arquivo LICENSE). Esta adaptação mantém a licença.

Teste opcional completo em Chromium: execute `npx.cmd playwright install chromium`
e depois `npm.cmd run test:e2e`. Veja os limites de execução em TESTES.md.
