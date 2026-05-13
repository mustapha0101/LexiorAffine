import { z } from 'zod';
import { defineTool } from './tool';
import { toolError } from './error';

const A2AJ_ENDPOINT = 'https://mcp.a2aj.ca/mcp';

async function executeA2ajCall(method: string, params: any) {
  try {
    // 1. Get a session ID via HEAD request
    const initRes = await fetch(A2AJ_ENDPOINT, { method: 'HEAD' });
    const sessionId = initRes.headers.get('mcp-session-id');
    
    if (!sessionId) {
      throw new Error('A2AJ MCP server did not return a session ID.');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
    };

    // 2. Initialize
    const initBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'lexior-copilot', version: '1.0.0' },
      },
    };
    
    await fetch(A2AJ_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(initBody) });

    // 3. Send initialized notification
    const initializedBody = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    };
    await fetch(A2AJ_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(initializedBody) });

    // 4. Call the tool
    const callBody = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: method, arguments: params },
    };

    const res = await fetch(A2AJ_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(callBody) });
    const textRes = await res.text();
    
    // The response is an SSE event stream: "event: message\ndata: {...}"
    const lines = textRes.split('\n');
    const dataLine = lines.find(l => l.startsWith('data: '));
    if (!dataLine) {
      throw new Error('Invalid response format from A2AJ server.');
    }

    const json = JSON.parse(dataLine.substring(6));
    
    if (json.error) {
      throw new Error(json.error.message);
    }
    
    if (json.result && json.result.isError) {
      throw new Error(json.result.content.map((c: any) => c.text).join('\n'));
    }
    
    return json.result.content.map((c: any) => c.text).join('\n');
  } catch (error: any) {
    throw new Error(`A2AJ Call failed: ${error.message}`);
  }
}

export function createA2ajCoverageTool() {
  return defineTool({
    description: "Get dataset coverage for Canadian case law and legislation showing earliest/latest dates and document counts.",
    inputSchema: z.object({
      doc_type: z.enum(['cases', 'laws']).default('cases').describe("'cases' for Canadian case law (courts & tribunals), 'laws' for statutes & regulations")
    }),
    execute: async (args: any) => {
      try {
        const result = await executeA2ajCall('coverage', args);
        return result;
      } catch (e: any) {
        return toolError('A2AJ Coverage Failed', e.message);
      }
    },
  });
}

export function createA2ajFetchDocumentTool() {
  return defineTool({
    description: "Retrieve full text of Canadian legal documents by citation (e.g., '2020 SCC 5', 'RSC 1985, c C-46').",
    inputSchema: z.object({
      citation: z.string().describe("Official legal citation (e.g., '2020 SCC 5' or 'RSC 1985, c C-46')"),
      doc_type: z.enum(['cases', 'laws']).default('cases').describe("'cases' for Canadian case law, 'laws' for statutes & regulations"),
      output_language: z.enum(['en', 'fr', 'both']).default('en').describe("Language for output - 'en', 'fr', or 'both'"),
      section: z.string().optional().describe("For laws only - specific section to return (empty for full text)"),
      start_char: z.number().optional().describe("Starting character position for text slicing"),
      end_char: z.number().optional().describe("Ending character position for text slicing (-1 for end of text)")
    }),
    execute: async (args: any) => {
      try {
        if ('search_language' in args) delete args.search_language;
        const result = await executeA2ajCall('fetch_document', args);
        return result;
      } catch (e: any) {
        if (e.message.includes('fetch failed') || e.message.includes('ECONNRESET')) {
          return toolError('A2AJ Fetch Document Failed', "Network error or invalid citation causing connection drop. Please ensure your citation format is exact (e.g., 'RSC 1985, c C-46', not 'c-46').");
        }
        return toolError('A2AJ Fetch Document Failed', e.message);
      }
    },
  });
}

export function createA2ajSearchLegalDocumentsTool() {
  return defineTool({
    description: "Search Canadian case law and legislation. Use this for any Canadian legal research instead of web search.",
    inputSchema: z.object({
      query: z.string().describe("MUST BE A KEYWORD SEARCH. DO NOT USE NATURAL LANGUAGE. Supports boolean operators (AND/OR/NOT), quotes, wildcards (*), proximity ('A B'~n)"),
      search_type: z.enum(['full_text', 'name']).default('full_text').describe("'full_text' searches document content with snippets, 'name' searches titles only"),
      doc_type: z.enum(['cases', 'laws']).default('cases').describe("'cases' for Canadian case law, 'laws' for statutes & regulations"),
      size: z.number().optional().describe("Number of results to return (max 50)"),
      search_language: z.enum(['en', 'fr']).default('en').describe("Language to search in - 'en' or 'fr'"),
      sort_results: z.enum(['default', 'newest_first', 'oldest_first']).default('default').describe("'default' (relevance), 'newest_first', or 'oldest_first'"),
      dataset: z.string().optional().describe("Filter by specific datasets (e.g. 'SCC,ONCA' or 'LEGISLATION-FED')"),
      start_date: z.string().optional().describe("Start date filter in YYYY-MM-DD format"),
      end_date: z.string().optional().describe("End date filter in YYYY-MM-DD format")
    }),
    execute: async (args: any) => {
      try {
        if ('output_language' in args) delete args.output_language;
        if (args.search_language === 'both') args.search_language = 'en';
        const result = await executeA2ajCall('search_legal_documents', args);
        return result;
      } catch (e: any) {
        return toolError('A2AJ Search Legal Documents Failed', e.message);
      }
    },
  });
}
