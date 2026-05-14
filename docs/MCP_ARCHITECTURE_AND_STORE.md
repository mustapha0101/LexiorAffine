# Architecture MCP (Model Context Protocol) dans Lexior Studio

Ce document détaille l'intégration du standard MCP au sein de Lexior Notebook, permettant l'extension illimitée des capacités d'analyse de documents juridiques via des plugins ("Actions Spécialisées").

---

## 1. Vue d'Ensemble de l'Architecture

Lexior Studio utilise une architecture hybride où le **Frontend (UI)** reste agnostique de la logique métier, tandis que le **Backend (Job Processor)** agit comme un "Chef d'Orchestre" (Orchestrator) qui connecte le modèle d'IA principal (ex: Gemini/Claude) à des serveurs MCP spécialisés.

### Le Flux de Données (Data Flow)

1. **Frontend (Studio UI)** : L'utilisateur sélectionne un document et clique sur une Action Spécialisée (ex: "Traitement d'Appel d'Offres"). Le Frontend envoie une requête `actionType = 'appel_offres'` au Backend.
2. **Backend (CopilotStudioService)** :
   - Lit la base de données ou le registre de plugins pour identifier le transport MCP associé à `appel_offres`.
   - Lance (via `stdio`) ou se connecte (via `sse`) au serveur MCP correspondant.
   - Demande au serveur MCP la liste de ses outils (`client.listTools()`).
3. **Orchestration LLM** :
   - Le Backend injecte les outils MCP récupérés dans le contexte de la requête adressée au LLM (`provider.streamText(..., { tools: mcpTools })`).
   - Le LLM utilise les outils de manière autonome pour extraire, analyser et générer le contenu demandé.
4. **Retour Frontend** : Le résultat est converti en Markdown, injecté dans un bloc `affine:note` et affiché à l'utilisateur.

---

## 2. Comment ajouter une nouvelle "Action Personnalisée" (Plugin MCP)

Ajouter une nouvelle action métier pour une organisation ou un client spécifique se fait en 3 étapes :

### Étape 1 : Créer le Serveur MCP (Logique Métier)

Créez un script Node.js (ou Python) qui implémente les outils spécifiques au domaine.
**Bonne Pratique** : Un serveur MCP ou un plugin doit toujours préciser sa portée (`scope`). Certains outils n'ont de sens que sur un document unique (`document`), tandis que d'autres s'appliquent sur tout le dossier (`workspace`). Cela évite les plantages ou les hallucinations lors du traitement de gros volumes.

Exemple pour l'audit RH (`packages/backend/server/src/plugins/copilot/studio/mcp/hr_compliance.ts`) :

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'HR Compliance Plugin', version: '1.0.0' });

server.tool(
  'audit_hr_contract',
  "Analyse un contrat de travail pour s'assurer du respect des normes.",
  {
    content: z.string().describe('Le texte à analyser'),
    scope: z.enum(['document', 'workspace']).describe("La portée de l'analyse en cours"),
  },
  async ({ content, scope }) => {
    if (scope === 'workspace') return { content: [{ type: 'text', text: "Erreur: Cet outil ne supporte que l'analyse d'un seul document à la fois." }] };

    // Logique d'audit...
    return { content: [{ type: 'text', text: 'Audit terminé. Aucun risque majeur identifié.' }] };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);
```

### Étape 2 : Enregistrer la route dans le Backend

Dans le fichier `packages/backend/server/src/plugins/copilot/studio/service.ts`, ajoutez le routage de l'`actionType` vers le nouveau serveur MCP.

```typescript
if (actionType === 'hr_compliance') {
  const scriptPath = join(process.cwd(), 'chemin/vers/hr_compliance.ts');
  mcpTransport = new StdioClientTransport({ command: 'npx', args: ['ts-node', scriptPath] });
  // Initialisation du client...
}
```

_(Note : Ce registre statique sera remplacé par le "Lexior Store", voir Section 3)._

### Étape 3 : Ajouter le bouton dans le Frontend

Dans `packages/frontend/core/src/desktop/pages/workspace/detail-page/tabs/studio.tsx`, ajoutez le bouton visuel sous l'onglet **Actions spécialisées** :

```tsx
<StudioCard title="Conformité RH" icon={<CardPanelIcon />} bgColor="#F8F9FA" color="#495057" onClick={() => handleAction('hr_compliance')} />
```

---

## 3. Plan de Développement : Le "Lexior Store" (App Store B2B MCP)

Pour scalabiliser cette architecture et adopter un modèle économique "Platform-as-a-Service", nous allons construire le **Lexior Store**.

### Objectif

Le "Lexior Store" est le catalogue d'applications privées où **vos clients (les cabinets d'avocats)** pourront découvrir, télécharger ou s'abonner aux serveurs MCP spécialisés que **vous développez et leur rendez disponibles**.
Cela transforme la gestion manuelle des plugins en une marketplace dynamique où chaque cabinet d'avocats peut installer et configurer les outils spécialisés dont il a besoin (Serveurs MCP distants via SSE ou hébergés par vos soins).

### Plan d'Implémentation

#### Phase 1 : Base de données du Store (Schema Prisma)

Création des tables pour gérer les plugins dynamiques.

- `McpPlugin` : Représente un plugin disponible (Nom, Description, Icone, Mode: Stdio/SSE, URL/Command, Prix).
- `WorkspaceMcpInstallation` : Table de jointure enregistrant quels plugins sont installés dans quel Workspace.

#### Phase 2 : API & Interface d'Administration (Marketplace)

- **Frontend** : Création d'une nouvelle page (ex: `lexior.ai/store`) ou d'un onglet "Plugin Store" dans les paramètres d'organisation de Lexior.
- Fonctionnalités : Catalogue de plugins, boutons "Installer/Désinstaller", configuration des clés d'API (pour les serveurs MCP externes nécessitant une authentification).

#### Phase 3 : Le Générateur Dynamique de Studio (UI)

- Modifier `studio.tsx` pour ne plus coder les "Actions spécialisées" en dur.
- Le Frontend interroge le backend (`getWorkspaceInstalledPlugins()`).
- Génère dynamiquement une `StudioCard` pour chaque plugin MCP installé, transmettant l'`id` du plugin comme `actionType`.

#### Phase 4 : Routage Backend Dynamique

- Modifier `CopilotStudioService`. Au lieu des blocs `if (actionType === '...')`, le service cherchera l'`actionType` dans la table `McpPlugin`.
- Si le plugin est de type `HTTP_SSE`, Lexior instanciera un `SSEClientTransport(plugin.url, plugin.headers)`.
- Cela permet une intégration totale d'outils tiers distants (ex: a2aj pour la jurisprudence canadienne) sans modifier le code de l'application Lexior.
