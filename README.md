# Lupa Legis — Tradutor de Leis

## Proposta do Projeto

O Lupa Legis é uma Prova de Conceito (PoC) acadêmica que valida a viabilidade técnica de um sistema de simplificação e resumo de textos legislativos, tornando-os compreensíveis para o cidadão comum.

O sistema foi desenhado para atender três propósitos centrais:

**Tradução de Termos Técnicos:** Receber o texto oficial de propostas de lei, projetos ou emendas e reescrevê-lo em linguagem acessível, eliminando o "juridiquês" sem perder o rigor técnico fundamental.

**Foco na Utilidade Pública:** Estruturar as informações de forma direta, respondendo objetivamente a três pilares: Qual o objetivo do projeto? Quem será impactado? O que muda na prática?

**Validação de Viabilidade:** Servir como protótipo funcional para demonstrar que a integração de LLMs com bases de dados legislativos públicos é solução viável para promover transparência e educação política da população.

---

## Estratégia contra Alucinação

O prompt é ancorado: o modelo recebe instrução explícita de resumir apenas o que está no trecho fornecido, sem inferir, interpretar ou complementar com conhecimento externo. O prompt de sistema nunca pede opinião — apenas compressão fiel do texto.

---

## Processamento de Documentos Longos (Chunking + Map-Reduce)

Proposições longas são divididas por estrutura semântica — artigos, incisos, parágrafos, ementa, justificativa — e não por contagem de linhas. A divisão respeita as unidades naturais do texto jurídico, com sobreposição entre segmentos para evitar perda de contexto nas bordas:

```
[Ementa + Justificativa]
[Art. 1º ao Art. 5º]
[Art. 4º ao Art. 9º]  ← sobreposição evita perda de contexto na divisão
[Art. 8º ao Art. 12º]
...
```

Cada segmento é resumido individualmente (**rodada 1**). Ao final, os resumos parciais são concatenados e enviados numa passagem final para gerar o resumo consolidado (**rodada 2 — consolidação**), também sem acréscimos.

---

## Fluxo de Processamento

1. **Entrada** — número ou texto bruto da proposição (via API da Câmara ou upload manual)
2. **Busca** — recupera o texto original
3. **Segmentação** — divide por estrutura jurídica com sobreposição
4. **Resumo parcial** — resume cada segmento (rodada 1)
5. **Consolidação** — resume os resumos parciais (rodada 2)
6. **Saída** — resumo fiel, sem viés, sem acréscimos — apenas o original comprimido
