# Lupa Legis — Tradutor de Proposições Legislativas

Aplicação web que consulta proposições da Câmara dos Deputados e as traduz para linguagem cidadã usando uma LLM via OpenRouter.

## Tecnologias

- **Node.js** (ESModules) com **Express** como servidor HTTP
- **OpenRouter** para acesso à LLM (recomendado: `nvidia/nemotron-3-ultra-550b-a55b:free`)
- **API de Dados Abertos da Câmara** como fonte das proposições e dos textos integrais
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
OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
```

`OPENROUTER_MODEL` é opcional — sem ele o servidor usa `openai/gpt-oss-120b:free` como padrão.

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
3. **Painel de detalhes** — ao clicar em uma proposição, o painel direito exibe imediatamente os dados da Câmara (ementa, autores, tramitação recente) e, em seguida, o resumo gerado pela IA com os seguintes campos:
   - **Explicação** — síntese simples do que o projeto realmente propõe
   - **Objetivo** — o que a proposição solicita ou determina
   - **Quem é impactado** — grupos ou pessoas mencionados no texto
   - **Efeito prático** — direitos garantidos, obrigações criadas e áreas abrangidas
   - **Termos técnicos** — jargão legislativo explicado em linguagem simples
   - **Limitações** — restrições jurídicas reais com base na tramitação

   > A tramitação não é resumida pela IA — os dados brutos da Câmara já são exibidos acima e são mais confiáveis para esse campo.

4. **Aviso de IA** — rodapé do resumo lembra o leitor de verificar a fonte oficial antes de tomar decisões.
5. **Novo resumo** — botão que força a regeneração do resumo, ignorando o cache.
6. **Tentar novamente** — botão exibido automaticamente em caso de erro na geração.

## Texto integral

Quando disponível, o servidor busca o texto completo da proposição via `GET /proposicoes/{id}/textos` da API da Câmara e o envia à LLM como base principal do resumo. Isso permite que a IA extraia os artigos, direitos e obrigações reais do projeto — e não apenas parafrasear a ementa.

Se o texto integral não estiver disponível (PDF sem suporte ou documento ausente), o resumo é gerado com base na ementa e o campo "Limitações" do resumo informa essa restrição.

## Cache de resumos

Os resumos gerados pela LLM são armazenados em memória durante a execução do servidor. Se uma proposição já foi consultada, o resumo é retornado imediatamente sem chamar a LLM novamente. O cache é limpo ao reiniciar o servidor. Use `?force=true` na rota `/resumo` ou o botão "Novo resumo" para regenerar.

## Resiliência

- **Timeout de 30s** nas chamadas ao OpenRouter — se o modelo não responder nesse prazo, a requisição é cancelada e o frontend exibe o botão "Tentar novamente".
- **Retry automático em rate limit (429)** — se o modelo retornar 429, o servidor aguarda o tempo indicado pela API (`retry_after_seconds`) e tenta novamente até 3 vezes antes de retornar erro.
- **Falhas parciais da API da Câmara** — se autores ou tramitações falharem, os detalhes da proposição ainda são exibidos com os dados disponíveis.

## Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/status` | Verifica se o servidor está no ar e qual modelo está configurado |
| GET | `/api/temas` | Lista os temas disponíveis para filtro |
| GET | `/api/proposicoes` | Lista proposições com filtros opcionais |
| GET | `/api/proposicoes/:id` | Detalhes, autores e tramitações de uma proposição |
| GET | `/api/proposicoes/:id/resumo` | Resumo gerado pela IA (aceita `?force=true` para ignorar cache) |

### Parâmetros de `/api/proposicoes`

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `pagina` | número | Página dos resultados (padrão: 1) |
| `itens` | número | Itens por página, de 1 a 20 (padrão: 12) |
| `siglaTipo` | string | Ex: `PL`, `PEC`, `MPV` |
| `numero` | número | Número da proposição |
| `ano` | número | Ano de apresentação |
| `codTema` | número | Código do tema (obtido via `/api/temas`) |
