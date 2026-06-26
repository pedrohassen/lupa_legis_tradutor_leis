# Lupa Legis — Tradutor de Proposições Legislativas

Aplicação web que consulta proposições da Câmara dos Deputados e as traduz para linguagem cidadã usando uma LLM via OpenRouter.

## Tecnologias

- **Node.js** (ESModules) com **Express** como servidor HTTP
- **OpenRouter** para acesso à LLM (modelo `openai/gpt-oss-120b:free`)
- **API de Dados Abertos da Câmara** como fonte das proposições
- Frontend em HTML/CSS/JS puro, servido como estático pelo Express

## Pré-requisitos

- [Node.js](https://nodejs.org/) v18 ou superior
- Uma chave de API do [OpenRouter](https://openrouter.ai/) (gratuita)

## Como rodar

### 1. Clone o repositório

```bash
git clone <url-do-repositorio>
cd lupa_legis_tradutor_leis
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure a variável de ambiente

Copie o arquivo de exemplo e preencha com sua chave do OpenRouter:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```
OPENROUTER_API_KEY=sua_chave_aqui
```

> Sem a chave, a aplicação ainda funciona: o campo de resumo exibirá a ementa original no lugar do texto gerado pela LLM.

### 4. Inicie o servidor

```bash
npm start
```

Acesse **http://localhost:3000** no navegador.

## Interface (frontend)

O frontend é uma SPA simples em HTML/CSS/JS sem frameworks. Ao abrir a aplicação:

1. **Lista de proposições** — exibida no painel esquerdo, carregada automaticamente da API da Câmara.
2. **Filtros de busca** — filtre por palavras-chave, tipo (PL, PEC, MPV...), número, ano e tema.
3. **Painel de detalhes** — ao clicar em uma proposição, o painel direito exibe autores, tramitações recentes e o resumo gerado pela IA com os seguintes campos:
   - **Objetivo** — o que a proposição pretende fazer
   - **Impactados** — quem é afetado
   - **Mudanças práticas** — o que muda no dia a dia
   - **Termos técnicos explicados** — jargão legislativo em linguagem simples
   - **Previsão de vigência** — quando entraria em vigor se aprovada
   - **Limites** — o que o resumo não cobre

## Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/status` | Verifica se o servidor está no ar |
| GET | `/api/temas` | Lista os temas disponíveis para filtro |
| GET | `/api/proposicoes` | Lista proposições com filtros opcionais |
| GET | `/api/proposicoes/:id` | Detalhes, autores, tramitações e resumo de uma proposição |
| POST | `/api/llm` | Traduz um texto legislativo enviado no corpo da requisição |

### Parâmetros de `/api/proposicoes`

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `pagina` | número | Página dos resultados (padrão: 1) |
| `itens` | número | Itens por página, de 1 a 20 (padrão: 12) |
| `siglaTipo` | string | Ex: `PL`, `PEC`, `MPV` |
| `numero` | número | Número da proposição |
| `ano` | número | Ano de apresentação |
| `keywords` | string | Palavras-chave |
| `codTema` | número | Código do tema (obtido via `/api/temas`) |
