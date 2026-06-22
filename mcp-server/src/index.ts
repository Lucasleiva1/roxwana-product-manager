import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const plannedTools = [
  "list_products",
  "get_product_by_sku",
  "search_products",
  "get_product_sheet",
  "validate_product",
  "suggest_next_model_code",
  "list_missing_product_fields",
  "open_product_folder",
];

const server = new Server(
  { name: "roxwana-product-manager", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: plannedTools.map((name) => ({
    name,
    description: `Herramienta planificada de ROXWANA: ${name}`,
    inputSchema: { type: "object", properties: {} },
  })),
}));

const transport = new StdioServerTransport();
await server.connect(transport);

