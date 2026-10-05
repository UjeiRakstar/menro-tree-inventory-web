import { spawn } from 'child_process';

const mcpProcess = spawn('npx', ['notebooklm-mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true
});

let messageId = 1;

mcpProcess.stderr.on('data', (data) => {
  console.log('STDERR:', data.toString());
});

mcpProcess.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
});

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
