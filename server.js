import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
const PORT = 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "openai/gpt-oss-120b:free";
const CAMARA_API_BASE = "https://dadosabertos.camara.leg.br/api/v2";
const resumoCache = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

function normalizarTexto(valor) {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

function montarTituloProposicao(proposicao) {
  const siglaTipo = normalizarTexto(proposicao?.siglaTipo);
  const numero = proposicao?.numero ? `${proposicao.numero}/` : "";
  const ano = proposicao?.ano ?? "";
  return normalizarTexto(`${siglaTipo} ${numero}${ano}`) || "Proposição sem título";
}

async function buscarJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha ao consultar ${url}: ${response.status} - ${detalhe}`);
  }
  return response.json();
}

async function consultarOpenRouter(messages, maxCompletionTokens = 220) {
  if (!API_KEY) {
    throw new Error("OPENROUTER_API_KEY não configurada.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": `http://localhost:${PORT}`,
      "X-OpenRouter-Title": "Lupa Legis - Resumo de proposições"
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_completion_tokens: maxCompletionTokens
    })
  });

  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Erro ao consultar o OpenRouter: ${response.status} - ${detalhe}`);
  }

  const data = await response.json();
  const texto = data.choices?.[0]?.message?.content;
  if (!texto) {
    throw new Error("Resposta vazia ou inesperada da LLM.");
  }

  return texto;
}

function montarContextoResumo(proposicao, autores, tramitacoes) {
  const autoresTexto = autores.length
    ? autores.map((autor) => normalizarTexto(autor?.nomeAutor || autor?.nome)).filter(Boolean).join(", ")
    : "Não informado";

  const tramitacoesTexto = tramitacoes.length
    ? tramitacoes
        .slice(0, 3)
        .map((item) => {
          const data = normalizarTexto(item?.dataTramitacao);
          const situacao = normalizarTexto(item?.descricaoSituacao);
          const orgao = normalizarTexto(item?.siglaOrgao);
          const despacho = normalizarTexto(item?.descricaoTramitacao);
          return [data, situacao, orgao, despacho].filter(Boolean).join(" - ");
        })
        .filter(Boolean)
        .join("\n")
    : "Não informado";

  return [
    `Título: ${montarTituloProposicao(proposicao)}`,
    `Ementa: ${normalizarTexto(proposicao?.ementa) || "Não informada"}`,
    `Tipo: ${normalizarTexto(proposicao?.descricaoTipo || proposicao?.siglaTipo) || "Não informado"}`,
    `Situação: ${normalizarTexto(proposicao?.statusProposicao?.descricaoSituacao || proposicao?.statusProposicao?.descricaoTramitacao) || "Não informada"}`,
    `Autores: ${autoresTexto}`,
    `Tramitações recentes:\n${tramitacoesTexto}`
  ].join("\n\n");
}

async function gerarResumoProposicao(proposicao, autores, tramitacoes) {
  // Se não há API_KEY, retornamos um objeto fallback com campos previsíveis
  if (!API_KEY) {
    return {
      objetivo: normalizarTexto(proposicao?.ementa) || "Não informado",
      impactados: "Não está explícito no texto fornecido.",
      mudancas_praticas: "Não está explícito no texto fornecido.",
      termos_tecnicos_explicados: montarTituloProposicao(proposicao),
      limites: "Resumo automático sem LLM, baseado apenas nos dados oficiais da Câmara."
    };
  }

  const contexto = montarContextoResumo(proposicao, autores, tramitacoes);
  const mensagens = [
    {
      role: "system",
      content:
        "Você é o assistente do projeto Lupa Legis. Responda estritamente com um objeto JSON válido (apenas o JSON) com as chaves: objetivo, impactados, mudancas_praticas, termos_tecnicos_explicados, limites. Cada valor deve ser uma string em português do Brasil. Não use Markdown, não insira asteriscos, não inclua texto fora do objeto JSON. Seja conciso; procure manter o texto total entre 180 e 250 palavras."
    },
    {
      role: "user",
      content: `Contexto da proposição:\n\n${contexto}\n\nGere apenas o objeto JSON conforme o contrato acima.`
    }
  ];

  const texto = await consultarOpenRouter(mensagens, 220);

  // Tentar parsear diretamente como JSON
  try {
    const parsed = JSON.parse(texto);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    // tentar extrair um trecho JSON da resposta (entre a primeira '{' e a última '}')
    const match = texto.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed2 = JSON.parse(match[0]);
        if (parsed2 && typeof parsed2 === "object") {
          return parsed2;
        }
      } catch (err2) {
        // segue para fallback
      }
    }
  }

  // Fallback: limpar asteriscos e retornar texto em campo de fallback
  const cleaned = String(texto).replace(/\*+/g, "").trim();
  return { fallback_text: cleaned, raw: cleaned };
}

app.get("/api/proposicoes", async (req, res) => {
  try {
    const itens = Math.min(Number(req.query.itens) || 12, 20);
    const url = `${CAMARA_API_BASE}/proposicoes?ordem=DESC&ordenarPor=id&itens=${itens}`;
    const data = await buscarJson(url);

    const proposicoes = (data.dados ?? []).map((proposicao) => ({
      id: proposicao.id,
      titulo: montarTituloProposicao(proposicao),
      ementa: normalizarTexto(proposicao.ementa),
      ano: proposicao.ano,
      siglaTipo: proposicao.siglaTipo,
      numero: proposicao.numero,
      situacao: normalizarTexto(proposicao.statusProposicao?.descricaoSituacao || proposicao.statusProposicao?.descricaoTramitacao),
      dataApresentacao: proposicao.dataApresentacao
    }));

    res.json({ proposicoes });
  } catch (error) {
    res.status(502).json({ erro: "Erro ao consultar a Câmara.", detalhe: error.message });
  }
});

app.get("/api/proposicoes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [proposicaoResp, autoresResp, tramitacoesResp] = await Promise.all([
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}`),
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}/autores`),
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}/tramitacoes`)
    ]);

    const proposicao = proposicaoResp.dados ?? proposicaoResp;
    const autores = autoresResp.dados ?? [];
    const tramitacoes = tramitacoesResp.dados ?? [];

    const cacheKey = String(id);
    let resumo = resumoCache.get(cacheKey);
    if (!resumo) {
      resumo = await gerarResumoProposicao(proposicao, autores, tramitacoes);
      resumoCache.set(cacheKey, resumo);
    }

    res.json({
      proposicao: {
        id: proposicao.id,
        titulo: montarTituloProposicao(proposicao),
        ementa: normalizarTexto(proposicao.ementa),
        ano: proposicao.ano,
        siglaTipo: proposicao.siglaTipo,
        numero: proposicao.numero,
        situacao: normalizarTexto(proposicao.statusProposicao?.descricaoSituacao || proposicao.statusProposicao?.descricaoTramitacao),
        dataApresentacao: proposicao.dataApresentacao,
        descricaoTipo: normalizarTexto(proposicao.descricaoTipo)
      },
      autores: autores.map((autor) => ({
        nome: normalizarTexto(autor.nomeAutor || autor.nome),
        uri: autor.uri
      })),
      tramitacoes: tramitacoes.slice(0, 5).map((item) => ({
        data: item.dataHora,
        situacao: normalizarTexto(item.descricaoSituacao),
        orgao: normalizarTexto(item.siglaOrgao),
        despacho: normalizarTexto(item.descricaoTramitacao)
      })),
      resumo
    });
  } catch (error) {
    res.status(502).json({ erro: "Erro ao carregar detalhes da proposição.", detalhe: error.message });
  }
});

app.get("/api/status", (req, res) => {
  res.json({ status: "API local funcionando", model: MODEL, camaraApi: CAMARA_API_BASE });
});

app.post("/api/llm", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ erro: "O campo prompt e obrigatorio." });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ erro: "Limite: 2000 caracteres." });
    }

    const mensagens = [
      {
        role: "system",
        content:
          "Você é o assistente oficial do projeto Lupa Legis. Traduza textos legislativos para linguagem cidadã com clareza, neutralidade e fidelidade. Use apenas o texto enviado; não invente nem complete lacunas; não use conhecimento externo; não dê opinião política ou jurídica. Se faltar dado, escreva exatamente: Não está explícito no texto fornecido. Responda em português do Brasil, frases curtas, sem tabelas e sem markdown complexo. Responda obrigatoriamente em 5 tópicos: Objetivo; Impactados; Mudanças práticas; Termos técnicos explicados; Limites. Limite de saída: entre 180 e 250 palavras, priorizando concisão e fidelidade."
      },
      {
        role: "user",
        content: prompt
      }
    ];

    const resposta = await consultarOpenRouter(mensagens, 700);
    res.json({ modelo: MODEL, resposta, uso: null });
  } catch (error) {
    res.status(500).json({ erro: "Erro interno no servidor.", detalhe: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});