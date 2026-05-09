import { spawn } from 'child_process';
import readline from 'readline';

async function main() {
  const child = spawn('npx', ['-y', 'canlii-mcp'], { env: { ...process.env, CANLII_API_KEY: 'jHMJUg6g6DaWXDcR5dlCuxHdjssKvha1XbLRYMb2' }});
  
  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    console.log(line);
    const msg = JSON.parse(line);
    if (msg.id === 1) {
      console.log('TOOLS:', JSON.stringify(msg.result, null, 2));
      process.exit(0);
    }
  });

  child.stderr.on('data', d => console.error(d.toString()));
  
  const initMsg = { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" }}};
  child.stdin.write(JSON.stringify(initMsg) + '\n');
  
  setTimeout(() => {
    const listMsg = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    child.stdin.write(JSON.stringify(listMsg) + '\n');
  }, 1000);
}
main();
