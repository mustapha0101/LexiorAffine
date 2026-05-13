import fetch from 'node-fetch';

const A2AJ_ENDPOINT = 'https://mcp.a2aj.ca/mcp';

async function test() {
  try {
    const initRes = await fetch(A2AJ_ENDPOINT, { method: 'HEAD' });
    const sessionId = initRes.headers.get('mcp-session-id');
    console.log('Session ID:', sessionId);
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
    };

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
    
    let res = await fetch(A2AJ_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(initBody) });
    console.log('Init Response:', res.status, await res.text());

    const initializedBody = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    };
    res = await fetch(A2AJ_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(initializedBody) });
    console.log('Initialized Response:', res.status, await res.text());

    const callBody = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'fetch_document', arguments: { citation: 'c-46', doc_type: 'laws' } },
    };

    res = await fetch(A2AJ_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(callBody) });
    const textRes = await res.text();
    console.log('Call Response Status:', res.status);
    console.log('Call Response Body:', textRes);
    
  } catch (e) {
    console.error(e);
  }
}
test();
