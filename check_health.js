import { spawn } from 'child_process';
import { createInterface } from 'readline';

const mcpProcess = spawn('npx', ['-y', 'notebooklm-mcp@latest'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true
});

const rl = createInterface({
  input: mcpProcess.stdout,
  terminal: false
});

let messageId = 1;

mcpProcess.stderr.on('data', (data) => {
  // Ignore stderr to keep output clean, unless you want debug logs
});

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.id === 2) {
      console.log('\n--- NotebookLM Health Check ---');
      console.log(JSON.stringify(response.result, null, 2));
      mcpProcess.kill();
      process.exit(0);
    }
  } catch (e) {
    // ignore
  }
});

// Initialize
mcpProcess.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: messageId++,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0' }
  }
}) + '\n');

// Call get_health tool
setTimeout(() => {
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: messageId++,
    method: 'tools/call',
    params: {
      name: 'get_health',
      arguments: {}
    }
  }) + '\n');
}, 2000);
