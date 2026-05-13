import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { z } from 'zod';
import { defineTool } from './tool';
import { toolError } from './error';

let messageIdCounter = 0;

async function executeMcpCall(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', 'canlii-mcp'], {
      env: { ...process.env, CANLII_API_KEY: process.env.CANLII_API_KEY },
      shell: true,
    });

    const rl = createInterface({ input: child.stdout });
    const id = ++messageIdCounter;

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id === id) {
          if (msg.error) {
            reject(new Error(msg.error.message));
          } else {
            resolve(msg.result);
          }
          child.kill();
        }
      } catch (e) {
        // ignore
      }
    });

    child.on('error', (err) => {
      reject(err);
    });

    const initMsg = {
      jsonrpc: '2.0',
      id: ++messageIdCounter,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'lexior-copilot', version: '1.0.0' },
      },
    };

    child.stdin.write(JSON.stringify(initMsg) + '\n');

    setTimeout(() => {
      const callMsg = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: method, arguments: params },
      };
      child.stdin.write(JSON.stringify(callMsg) + '\n');
    }, 500);
  });
}

function parseMcpResult(result: any) {
  if (result.isError) {
    throw new Error(result.content.map((c: any) => c.text).join('\n'));
  }
  return result.content.map((c: any) => c.text).join('\n');
}

export function createCanliiSearchCasesTool() {
  return defineTool({
    description: 'Full-text search of Canadian jurisprudence across all courts and tribunals. Returns relevance-ranked case citations, summaries, and URLs.',
    inputSchema: z.object({
      query: z.string().describe('MUST BE A KEYWORD SEARCH. DO NOT USE NATURAL LANGUAGE. Search query using boolean operators (AND, OR, NOT), exact phrases in quotes, or keywords.'),
      language: z.enum(['en', 'fr']).optional().default('en'),
      jurisdiction: z.string().optional().describe('Filter by jurisdiction (e.g., "ON", "QC", "FCA").'),
      decisionDateAfter: z.string().optional().describe('Date lower bound (YYYY-MM-DD).'),
    }),
    execute: async (args: any) => {
      try {
        const result = await executeMcpCall('search', args);
        return parseMcpResult(result);
      } catch (e: any) {
        return toolError('CanLII Search Failed', e.message);
      }
    },
  });
}

export function createCanliiGetCaseMetadataTool() {
  return defineTool({
    description: 'Get detailed metadata for a specific case, including citation info, docket numbers, headnotes, and the direct CanLII URL.',
    inputSchema: z.object({
      databaseId: z.string().describe('Court database ID (e.g., "onsc", "csc-scc"). Get this from search_cases.'),
      caseId: z.string().describe('Case unique identifier. Get this from search_cases.'),
      language: z.enum(['en', 'fr']).optional().default('en'),
    }),
    execute: async (args: any) => {
      try {
        const result = await executeMcpCall('get_case_metadata', args);
        return parseMcpResult(result);
      } catch (e: any) {
        return toolError('CanLII Metadata Failed', e.message);
      }
    },
  });
}

export function createCanliiSearchLegislationTool() {
  return defineTool({
    description: 'List legislation items in a database to find specific statutes.',
    inputSchema: z.object({
      databaseId: z.string().describe('Legislation database ID (e.g., "ons" for Ontario Statutes, "cas" for Canada Statutes, "onr" for Ontario Regulations)'),
      language: z.enum(['en', 'fr']).optional().default('en'),
    }),
    execute: async (args: any) => {
      try {
        const result = await executeMcpCall('browse_legislation', args);
        return parseMcpResult(result);
      } catch (e: any) {
        return toolError('CanLII Browse Legislation Failed', e.message);
      }
    },
  });
}

export function createCanliiLegislationMetadataTool() {
  return defineTool({
    description: 'Get metadata for a specific statute or regulation including its CanLII URL, citation, and table of contents.',
    inputSchema: z.object({
      databaseId: z.string().describe('Legislation database ID (e.g., "ons" for Ontario Statutes)'),
      legislationId: z.string().describe('Specific legislation ID from browse results'),
      language: z.enum(['en', 'fr']).optional().default('en'),
    }),
    execute: async (args: any) => {
      try {
        const result = await executeMcpCall('get_legislation_regulation_metadata', args);
        return parseMcpResult(result);
      } catch (e: any) {
        return toolError('CanLII Legislation Metadata Failed', e.message);
      }
    },
  });
}
