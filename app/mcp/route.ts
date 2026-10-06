import { createMcpHandler } from "mcp-handler";
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

async function securedHandler(request: Request) {
  const expectedToken = process.env.MCP_AUTH_TOKEN;
  const providedToken = request.headers.get("x-api-key");
  if (!expectedToken) {
    return new Response("MCP_AUTH_TOKEN is not configured", {
      status: 500,
    });
  }

  if (providedToken !== expectedToken) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  return handler(request);
}

export {
  securedHandler as GET,
  securedHandler as POST,
};
