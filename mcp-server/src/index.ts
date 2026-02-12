#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { notifyUser, askUser } from './tools.js';

const server = new McpServer({
  name: 'command-center',
  version: '1.0.0',
});

server.registerTool(
  'notify_user',
  {
    description:
      'Send a push notification to the user. Fire-and-forget — returns immediately. Use for status updates or FYI messages.',
    inputSchema: {
      message: z.string().describe('The notification message'),
      priority: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe('Priority 1-5 (default 3). 5 = urgent, 1 = low'),
    },
  },
  async ({ message, priority }) => {
    const result = await notifyUser(message, priority);
    return { content: [{ type: 'text', text: result }] };
  },
);

server.registerTool(
  'ask_user',
  {
    description:
      'Ask the user a question and wait for their response. Sends a push notification with the question and optional action buttons. Blocks until the user responds or timeout (10 min). Use when you need user input or a decision.',
    inputSchema: {
      question: z.string().describe('The question to ask the user'),
      options: z
        .array(z.string())
        .optional()
        .describe('Quick-reply options shown as buttons (max 2 recommended)'),
      allow_text: z
        .boolean()
        .optional()
        .describe('Whether to allow free-text responses (default true)'),
    },
  },
  async ({ question, options, allow_text }) => {
    const result = await askUser(question, options ?? [], allow_text ?? true);
    return { content: [{ type: 'text', text: result }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Command Center MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
