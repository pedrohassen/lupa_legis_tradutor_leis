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

### 3. Configure as variáveis de ambiente

Copie o arquivo de exemplo e preencha com sua chave do OpenRouter:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```
OPENROUTER_API_KEY=sua_chave_aqui
LLM_MODEL="openai/gpt-oss-120b:free"
```

`LLM_MODEL` é opcional — sem ele o servidor usa `openai/gpt-oss-120b:free` como padrão.

> Sem a chave, a aplicação ainda funciona: o campo de resumo exibirá a ementa original no lugar do texto gerado pela LLM.

### 4. Inicie o servidor

```bash
npm start
```

Acesse **http://localhost:3000** no navegador.

## Interface (frontend)

O frontend é uma SPA simples em HTML/CSS/JS sem frameworks. Ao abrir a aplicação:

1. **Lista de proposições** — exibida no painel esquerdo, carregada automaticamente da API da Câmara.
2. **Filtros de busca** — filtre por tipo (PL, PEC, MPV...), número, ano e categoria.
3. **Painel de detalhes** — ao clicar em uma proposição, o painel direito exibe imediatamente os dados da Câmara (ementa, autores, tramitação recente com data formatada) e, em seguida, o resumo gerado pela IA com os seguintes campos:
   - **Objetivo** — o que a proposição solicita ou determina
   - **Quem é impactado** — grupos ou pessoas mencionados no texto
   - **Efeito prático** — o que o texto expressamente autoriza, solicita ou determina
   - **Termos técnicos** — jargão legislativo em linguagem simples
   - **Limitações** — restrições reais com base na tramitação

   > A tramitação não é resumida pela IA — os dados brutos da Câmara já são exibidos acima e são mais confiáveis para esse campo. O resumo exibe um aviso ao final lembrando o usuário de verificar a fonte antes de tomar decisões.

## Cache de resumos

Os resumos gerados pela LLM são armazenados em memória durante a execução do servidor. Se uma proposição já foi consultada, o resumo é retornado imediatamente sem chamar a LLM novamente. O cache é limpo ao reiniciar o servidor.

## Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/status` | Verifica se o servidor está no ar |
| GET | `/api/temas` | Lista os temas disponíveis para filtro |
| GET | `/api/proposicoes` | Lista proposições com filtros opcionais |
| GET | `/api/proposicoes/:id` | Detalhes, autores e tramitações de uma proposição |
| GET | `/api/proposicoes/:id/resumo` | Resumo gerado pela IA para uma proposição |

### Parâmetros de `/api/proposicoes`

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `pagina` | número | Página dos resultados (padrão: 1) |
| `itens` | número | Itens por página, de 1 a 20 (padrão: 12) |
| `siglaTipo` | string | Ex: `PL`, `PEC`, `MPV` |
| `numero` | número | Número da proposição |
| `ano` | número | Ano de apresentação |
| `codTema` | número | Código do tema (obtido via `/api/temas`) |
