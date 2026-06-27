import express from "express";
import cors from "cors";
import "dotenv/config";
import { contexto_llm } from "./context.js";

const app = express();
const PORT = 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.LLM_MODEL || "openai/gpt-oss-120b:free";
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const detalhe = await response.text();
      throw new Error(`Falha ao consultar ${url}: ${response.status} - ${detalhe}`);
    }
    return response.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`Tempo limite esgotado ao consultar a API da Câmara. Tente novamente.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function consultarOpenRouter(messages, maxCompletionTokens = 220, tentativa = 1) {
  if (!API_KEY) {
    throw new Error("OPENROUTER_API_KEY não configurada.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

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
    }),
    signal: controller.signal
  });

  clearTimeout(timer);

  if (response.status === 429 && tentativa < 3) {
    const erro429 = await response.json().catch(() => ({}));
    const espera = (erro429?.error?.metadata?.retry_after_seconds ?? 3) * 1000;
    await new Promise((r) => setTimeout(r, espera));
    return consultarOpenRouter(messages, maxCompletionTokens, tentativa + 1);
  }

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
          const data = normalizarTexto(item?.dataHora);
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
      efeito_pratico: "Não está explícito no texto fornecido.",
      termos_tecnicos: "Não está explícito no texto fornecido.",
      limitacoes: "Resumo automático sem LLM, baseado apenas nos dados oficiais da Câmara."
    };
  }

  const contexto = montarContextoResumo(proposicao, autores, tramitacoes);
  const mensagens = [
    {
      role: "system",
      content:
        contexto_llm
    },
    {
      role: "user",
      content: `Contexto da proposição:\n\n${contexto}\n\nGere apenas o objeto JSON conforme o contrato acima.`
    }
  ];

  const texto = await consultarOpenRouter(mensagens, 800);

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

app.get("/api/temas", async (req, res) => {
  try {
    const data = await buscarJson(`${CAMARA_API_BASE}/referencias/proposicoes/codTema`);
    res.json({ temas: data.dados ?? [] });
  } catch (error) {
    res.status(502).json({ erro: "Erro ao buscar categorias.", detalhe: error.message });
  }
});

app.get("/api/proposicoes", async (req, res) => {
  try {
    const itens = Math.min(Math.max(Number(req.query.itens) || 12, 1), 20);
    const pagina = Math.max(Number(req.query.pagina) || 1, 1);

    const params = new URLSearchParams({ ordem: "DESC", ordenarPor: "id", itens: String(itens), pagina: String(pagina) });
    if (req.query.siglaTipo) params.append("siglaTipo", req.query.siglaTipo);
    if (req.query.numero)    params.append("numero",    req.query.numero);
    if (req.query.ano)       params.append("ano",       req.query.ano);
    if (req.query.keywords)  params.append("keywords",  req.query.keywords);
    if (req.query.codTema)   params.append("codTema",   req.query.codTema);

    const url = `${CAMARA_API_BASE}/proposicoes?${params.toString()}`;
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

    res.json({
      proposicoes,
      pagina,
      itens,
      consulta: url
    });
  } catch (error) {
    res.status(502).json({ erro: "Erro ao consultar a Câmara.", detalhe: error.message });
  }
});

app.get("/api/proposicoes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [proposicaoRes, autoresRes, tramitacoesRes] = await Promise.allSettled([
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}`),
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}/autores`),
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}/tramitacoes`)
    ]);

    if (proposicaoRes.status === "rejected") throw proposicaoRes.reason;

    const proposicao = proposicaoRes.value.dados ?? proposicaoRes.value;
    const autores = autoresRes.status === "fulfilled" ? (autoresRes.value.dados ?? []) : [];
    const tramitacoes = tramitacoesRes.status === "fulfilled" ? (tramitacoesRes.value.dados ?? []) : [];

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
      }))
    });
  } catch (error) {
    res.status(502).json({ erro: "Erro ao carregar detalhes da proposição.", detalhe: error.message });
  }
});

app.get("/api/proposicoes/:id/resumo", async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = String(id);
    const cached = resumoCache.get(cacheKey);
    if (cached) return res.json({ resumo: cached });

    const [proposicaoRes, autoresRes, tramitacoesRes] = await Promise.allSettled([
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}`),
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}/autores`),
      buscarJson(`${CAMARA_API_BASE}/proposicoes/${id}/tramitacoes`)
    ]);

    if (proposicaoRes.status === "rejected") throw proposicaoRes.reason;

    const proposicao = proposicaoRes.value.dados ?? proposicaoRes.value;
    const autores = autoresRes.status === "fulfilled" ? (autoresRes.value.dados ?? []) : [];
    const tramitacoes = tramitacoesRes.status === "fulfilled" ? (tramitacoesRes.value.dados ?? []) : [];

    const resumo = await gerarResumoProposicao(proposicao, autores, tramitacoes);
    resumoCache.set(cacheKey, resumo);
    res.json({ resumo });
  } catch (error) {
    res.status(502).json({ erro: "Erro ao gerar resumo.", detalhe: error.message });
  }
});

app.get("/api/status", (req, res) => {
  res.json({ status: "API local funcionando", model: MODEL, camaraApi: CAMARA_API_BASE });
});

// app.post("/api/llm", async (req, res) => {
//   try {
//     const { prompt } = req.body;
//     if (!prompt || prompt.trim().length === 0) {
//       return res.status(400).json({ erro: "O campo prompt e obrigatorio." });
//     }
//     if (prompt.length > 2000) {
//       return res.status(400).json({ erro: "Limite: 2000 caracteres." });
//     }

//     const mensagens = [
//       {
//         role: "system",
//         content:
//           "Você é o assistente oficial do projeto Lupa Legis. Traduza textos legislativos para linguagem cidadã com clareza, neutralidade e fidelidade. Use apenas o texto enviado; não invente nem complete lacunas; não use conhecimento externo; não dê opinião política ou jurídica. Se faltar dado, escreva exatamente: Não está explícito no texto fornecido. Responda em português do Brasil, frases curtas, sem tabelas e sem markdown complexo. Responda obrigatoriamente em 5 tópicos: Objetivo; Impactados; Mudanças práticas; Termos técnicos explicados; Limites. Limite de saída: entre 180 e 250 palavras, priorizando concisão e fidelidade."
//       },
//       {
//         role: "user",
//         content: prompt
//       }
//     ];

//     const resposta = await consultarOpenRouter(mensagens, 700);
//     res.json({ modelo: MODEL, resposta, uso: null });
//   } catch (error) {
//     res.status(500).json({ erro: "Erro interno no servidor.", detalhe: error.message });
//   }
// });

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});