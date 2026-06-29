import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "127.0.0.1";
const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`Fictia server running on http://${HOST}:${PORT}`);
});
