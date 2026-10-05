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
  console.log('STDERR:', data.toString());
});

rl.on('line', (line) => {
  console.log('Received:', line);
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

// Call setup_auth tool
setTimeout(() => {
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: messageId++,
    method: 'tools/call',
    params: {
      name: 'setup_auth',
      arguments: {}
    }
  }) + '\n');
  console.log('Sent setup_auth call. A browser window should open shortly.');
}, 2000);
