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
  // Ignore stderr
});

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.id === 2) {
      console.log('\n--- Add Notebook Result ---');
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

// Call add_notebook tool
setTimeout(() => {
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: messageId++,
    method: 'tools/call',
    params: {
      name: 'add_notebook',
      arguments: {
        url: 'https://notebook.google.com/notebook/9472c1f5-bb00-4329-9214-009505fe6e01?authuser=2',
        name: 'Shared Notebook',
        description: 'A notebook shared by the user.',
        topics: ['general'],
        use_cases: 'General reference'
      }
    }
  }) + '\n');
}, 2000);
