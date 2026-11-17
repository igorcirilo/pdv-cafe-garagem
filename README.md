# Café Garagem PDV

Ponto de venda do Café Garagem: vendas, comandas, caixa, revenda, estoque, fichas técnicas,
produção, contas a pagar e relatórios.

- **Interface:** React + TypeScript + Vite, publicada na Vercel.
- **Banco:** Supabase (Postgres), schema `pdv`. As operações que mexem em estoque e dinheiro
  (vender, cancelar, editar venda, produção, ajustes, compras, baixa e estorno de contas)
  são funções no banco e rodam numa transação única: se algo falha, nada é gravado.

> **Atenção: esta versão não tem login.** Quem tiver o endereço do site consegue ver e
> alterar os dados. Veja [Ativar login](#ativar-login) para fechar o acesso.

## Configuração

### 1. Banco (Supabase)

1. Aplique a migration `supabase/migrations/20261117000000_pdv_inicial.sql` no projeto
   (SQL Editor do painel ou `supabase db push`). Ela cria os schemas `pdv` (tabelas e funções
   públicas) e `pdv_priv` (auxiliares internos), as regras de acesso (RLS) e o catálogo inicial
   com 30 produtos.
2. No painel do Supabase: **Project Settings → Data API → Exposed schemas**, adicione `pdv`.
   Não exponha `pdv_priv`.

### 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` (desenvolvimento) ou cadastre na Vercel (produção):

| Variável | Onde encontrar |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → chave publicável (`sb_publishable_...`) |

A chave publicável pode ir para o navegador. Quem controla o acesso são as regras (RLS) do banco.

### 3. Desenvolvimento

```bash
npm ci
npm run dev        # http://127.0.0.1:5173
npm run check      # testes da interface + build
npm run lint
```

Testes das funções do banco (rodam como o papel `anon` e desfazem tudo no final):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/operacoes.test.sql
```

### 4. Deploy na Vercel

O projeto é um site estático do Vite (`npm run build` → `dist`). Na Vercel, importe o
repositório, mantenha o preset **Vite** e cadastre as duas variáveis acima. Cada push na
`main` publica em produção, e cada branch gera uma prévia.

## Backup

Em **Backup dos dados**, acima do módulo atual, o botão **Baixar backup agora** baixa um JSON
com todas as tabelas do PDV. Guarde cópias periodicamente: no plano gratuito do Supabase não
há backup automático que você possa baixar.

## Ativar login

Todo acesso passa pela função `pdv.acesso_permitido()`, que hoje retorna `true`. Para exigir
login:

1. Crie o usuário do café em Supabase → Authentication → Users.
2. Troque o corpo da função para algo como
   `select auth.uid() = '<id do usuário>'::uuid` (nova migration).
3. Adicione uma tela de login na interface com `supabase.auth.signInWithPassword`.

## Limites conhecidos

- Os relatórios buscam no máximo 1000 linhas por consulta (limite padrão da API do Supabase).
- Não inclui emissão fiscal (NFC-e/SAT) nem integração bancária.

Código sob licença MIT (arquivo LICENSE).
