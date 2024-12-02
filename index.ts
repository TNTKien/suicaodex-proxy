import { serve } from "@hono/node-server";
import axios from "axios";
import { Hono } from "hono";
// import { fetch, request } from "undici";

const app = new Hono();

const API_BASE_URL = "https://api.mangadex.org";

// Bộ nhớ tạm với TTL
const chapterCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 phút

// Hàm thêm vào cache với TTL
function setCacheWithTTL(key: any, value: any) {
  const expiration = Date.now() + CACHE_TTL;
  chapterCache.set(key, { value, expiration });
  // Lên lịch tự động xóa sau TTL
  setTimeout(() => {
    if (chapterCache.get(key)?.expiration <= Date.now()) {
      chapterCache.delete(key);
    }
  }, CACHE_TTL);
}

// Hàm kiểm tra cache
function getCache(key: any) {
  const cached = chapterCache.get(key);
  if (cached && cached.expiration > Date.now()) {
    return cached.value;
  }
  // Nếu dữ liệu hết hạn, xóa khỏi cache
  chapterCache.delete(key);
  return null;
}

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

app.get("/ch/:id", async (c) => {
  const id = c.req.param("id");
  const atHomeAPIUrl = `${API_BASE_URL}/at-home/server/${id}`;
  try {
    let links = getCache(id);

    if (!links) {
      const { data: serverData } = await axios.get(atHomeAPIUrl, {
        headers: {
          "User-Agent": c.req.header("User-Agent") || "SuicaoDex/1.0",
        },
      });
      const baseUrl = serverData.baseUrl;
      const hash = serverData.chapter.hash;
      const fileNames = Object.values(serverData.chapter.data);
      links = fileNames.map(
        (fileName) => `${baseUrl}/data/${hash}/${fileName}`
      );
      setCacheWithTTL(id, links);
    }

    const proxiedLinks = links.map(
      (_: any, index: any) => `images/${id}/${index}`
    );

    return c.json(
      {
        chapterID: id,
        images: proxiedLinks,
      },
      200
    );

    // return new Response(JSON.stringify(data), {
    //   status,
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Access-Control-Allow-Origin": "*",
    //     "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    //     "Access-Control-Allow-Headers": "Content-Type, Authorization",
    //   },
    // });
  } catch (error) {
    console.error(error);
    return c.text("Internal Server Error", 500);
  }
});

app.get("/images/:id/:index", async (c) => {
  const id = c.req.param("id");
  const index = c.req.param("index");

  const links = getCache(id);
  if (!links) return c.text("Chapter not found", 404);

  const imageUrl = links[index];
  if (!imageUrl) return c.text("Image not found", 404);
  try {
    const response = await axios.get(imageUrl, { responseType: "stream" });
    //c.res.headers.set("Content-Type", response.headers["content-type"]);

    return new Response(response.data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers["content-type"],
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error(error);
    return c.text("Internal Server Error", 500);
  }
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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
