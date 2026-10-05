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
  console.log('STDERR:', data.toString());
});

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.id === 2) {
      console.log('\n--- Question Response ---');
      console.log(JSON.stringify(response.result, null, 2));
      mcpProcess.kill();
      process.exit(0);
    } else {
      console.log('Other response:', line);
    }
  } catch (e) {
    console.log('Raw line:', line);
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

const prompt = `What is this notebook about? Please summarize the main points, purpose, components, and concepts of C1 Concept Note.`;

setTimeout(() => {
  mcpProcess.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: messageId++,
    method: 'tools/call',
    params: {
      name: 'ask_question',
      arguments: {
        notebook_id: 'shared-notebook',
        question: prompt
      }
    }
  }) + '\n');
}, 2000);
