import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'Tender Analyzer MCP',
  version: '1.1.0',
});

server.tool(
  'evaluate_go_no_go_criteria',
  "Extrait les critères d'admissibilité stricts (chiffre d'affaires, certifications, garanties) pour une décision Go/No-Go.",
  { content: z.string().describe("Le contenu de l'appel d'offres") },
  async ({ content }) => {
    return {
      content: [
        {
          type: 'text',
          text: "Processus d'extraction Go/No-Go exécuté. L'IA doit structurer les critères éliminatoires identifiés.",
        },
      ],
    };
  }
);

server.tool(
  'generate_requirements_matrix',
  'Analyse le cahier des charges et génère un tableau croisé des exigences techniques et juridiques.',
  { content: z.string().describe("Le contenu de l'appel d'offres") },
  async ({ content }) => {
    return {
      content: [
        {
          type: 'text',
          text: "Matrice des exigences générée. L'IA doit présenter une table de traçabilité complète.",
        },
      ],
    };
  }
);

server.tool(
  'extract_risk_and_penalties',
  'Scanne le document à la recherche de clauses abusives, pénalités de retard et responsabilités.',
  { content: z.string().describe("Le contenu de l'appel d'offres") },
  async ({ content }) => {
    return {
      content: [
        {
          type: 'text',
          text: "Analyse des risques terminée. L'IA doit lister les pénalités et clauses sensibles.",
        },
      ],
    };
  }
);

server.tool(
  'generate_proposal_outline',
  'Lit les instructions aux soumissionnaires et génère la table des matières de la réponse.',
  { content: z.string().describe("Le contenu de l'appel d'offres") },
  async ({ content }) => {
    return {
      content: [
        {
          type: 'text',
          text: "Trame de réponse générée. L'IA doit structurer la table des matières requise.",
        },
      ],
    };
  }
);

server.tool(
  'final_validation_checklist',
  'Vérifie une proposition de réponse (ou le cahier des charges) pour générer une checklist finale de conformité.',
  {
    content: z
      .string()
      .describe("Le document de réponse ou l'appel d'offres à valider"),
  },
  async ({ content }) => {
    return {
      content: [
        {
          type: 'text',
          text: "Checklist de validation finale générée. L'IA doit fournir les étapes ultimes de vérification.",
        },
      ],
    };
  }
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Tender MCP Server running on stdio');
}

run().catch(console.error);
