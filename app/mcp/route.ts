import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

const handler = createMcpHandler((server) => {
  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echo a message",
      inputSchema: z
        .object({
          message: z
            .string()
            .min(1)
            .max(100)
            .describe("Message to echo back"),
        })
        .strict(),
      outputSchema: z
        .object({
          message: z.string().describe("Echoed message"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ message }) => ({
      content: [
        {
          type: "text",
          text: `Tool echo: ${message}`,
        },
      ],
      structuredContent: { message },
    })
  );
});

const verifyToken = async (
  _request: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  const expectedToken = process.env.MCP_AUTH_TOKEN;

  if (!expectedToken || !bearerToken) {
    return undefined;
  }

  if (bearerToken !== expectedToken) {
    return undefined;
  }

  return {
    token: bearerToken,
    scopes: ["architect:use"],
    clientId: "claude-web",
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["architect:use"],
});

export {
  authHandler as GET,
  authHandler as POST,
};
