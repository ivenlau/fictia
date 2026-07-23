import { createApp } from "./app.js";
import { providerService } from "./services/provider.service.js";

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "127.0.0.1";
const app = createApp();

// Seed preset providers + one-time migrate of legacy apiKey*/agentModels.
providerService.init();

app.listen(PORT, HOST, () => {
  console.log(`Fictia server running on http://${HOST}:${PORT}`);
});
