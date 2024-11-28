import { serve } from "@hono/node-server";
import { Hono } from "hono";
// import { fetch, request } from "undici";

const app = new Hono();

const API_BASE_URL = "https://api.mangadex.org";

// headers
app.use("*", async (c, next) => {
  const viaHeader = c.req.header("Via");
  if (viaHeader)
    return c.text('Requests with "Via" header are not allowed.', 403);

  const userAgent = c.req.header("User-Agent");
  if (!userAgent) return c.text("User-Agent header is required.", 400);

  await next();
});

// CORS
app.use("*", (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return next();
});

app.all("*", async (c) => {
  try {
    const url = new URL(c.req.url);

    const targetPath = url.pathname + url.search;

    if (targetPath === "/") return c.text("nothing here", 200);

    const apiUrl = API_BASE_URL + targetPath;

    const res = await fetch(apiUrl, {
      method: c.req.method,
      headers: {
        "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
      },
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error(error);
    return c.text("Internal Server Error", 500);
  }
});

const port = 3000;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
