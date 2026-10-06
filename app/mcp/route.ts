import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

export const maxDuration = 60;

const handler = createMcpHandler((server) => {
  server.registerTool(
    "generate_architectural_image",
    {
      title: "Generate Architectural Image",
      description:
        "Generate a real architectural image using Gemini. Use this when the user asks to create, render, visualize, or generate an architectural image.",
      inputSchema: z
        .object({
          prompt: z
            .string()
            .min(10)
            .describe(
              "Detailed architectural image prompt. Include architecture, materials, camera, lighting, landscape, atmosphere, and realism requirements."
            ),

          aspect_ratio: z
            .enum([
              "1:1",
              "3:2",
              "2:3",
              "3:4",
              "4:3",
              "4:5",
              "5:4",
              "9:16",
              "16:9",
              "21:9",
            ])
            .default("16:9")
            .describe("Required image aspect ratio"),
        })
        .strict(),

      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },

    async ({ prompt, aspect_ratio }) => {
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "GEMINI_API_KEY is not configured on the server.",
            },
          ],
        };
      }

      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              model: "gemini-3.1-flash-image",

              input: prompt,

              response_format: {
                type: "image",
                mime_type: "image/jpeg",
                aspect_ratio: aspect_ratio,
                image_size: "1K",
              },
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  "Gemini image generation failed: " +
                  JSON.stringify(result).slice(0, 2000),
              },
            ],
          };
        }

        let imageData =
          result?.output_image?.data ||
          result?.outputImage?.data ||
          null;

        let mimeType =
          result?.output_image?.mime_type ||
          result?.output_image?.mimeType ||
          result?.outputImage?.mime_type ||
          result?.outputImage?.mimeType ||
          "image/jpeg";

        if (!imageData && Array.isArray(result?.steps)) {
          for (const step of result.steps) {
            if (!Array.isArray(step?.content)) continue;

            for (const block of step.content) {
              if (block?.type === "image" && block?.data) {
                imageData = block.data;
                mimeType =
                  block.mime_type ||
                  block.mimeType ||
                  "image/jpeg";
                break;
              }
            }

            if (imageData) break;
          }
        }

        if (!imageData) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  "Gemini completed the request but no image was found in the response.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "image",
              data: imageData,
              mimeType: mimeType,
            },
            {
              type: "text",
              text:
                "Architectural image successfully generated with Gemini 3.1 Flash Image.",
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "Image generation error: " +
                (error instanceof Error
                  ? error.message
                  : String(error)),
            },
          ],
        };
      }
    }
  );
});

async function authenticatedHandler(request: Request) {
  const expectedToken = process.env.MCP_AUTH_TOKEN;

  if (!expectedToken) {
    return new Response("MCP_AUTH_TOKEN is not configured.", {
      status: 500,
    });
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${expectedToken}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  return handler(request);
}

export {
  authenticatedHandler as GET,
  authenticatedHandler as POST,
};
