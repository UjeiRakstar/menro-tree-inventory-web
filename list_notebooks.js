import { spawn } from 'child_process';
import { createInterface } from 'readline';

const mcpProcess = spawn('npx', ['notebooklm-mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true
});

const rl = createInterface({
  input: mcpProcess.stdout,
  terminal: false
});

let messageId = 1;

mcpProcess.stderr.on('data', (data) => {
  // Ignore stderr to keep output clean
});

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    // The response for our call is id: 2
    if (response.id === 2) {
      console.log('\n--- Your Notebooks ---');
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

// Call list_notebooks tool
setTimeout(() => {
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: messageId++,
    method: 'tools/call',
    params: {
      name: 'list_notebooks',
      arguments: {}
    }
  }) + '\n');
}, 2000);
