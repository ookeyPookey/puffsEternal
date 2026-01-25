const { URL } = require("url");

const getMetaContent = (html, property) => {
  const regex = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(regex);
  return match ? match[1] : "";
};

const getTitle = (html) => {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1] : "";
};

exports.handler = async (event) => {
  const urlParam = event.queryStringParameters?.url || "";
  if (!urlParam) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing url parameter." }),
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlParam);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid URL." }),
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid URL protocol." }),
    };
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "PuffsEternalLinkPreview/1.0",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return {
        statusCode: 200,
        body: JSON.stringify({ title: "", image: "" }),
      };
    }

    const html = await response.text();
    const title =
      getMetaContent(html, "og:title") ||
      getMetaContent(html, "twitter:title") ||
      getTitle(html);
    const image =
      getMetaContent(html, "og:image") ||
      getMetaContent(html, "twitter:image");

    return {
      statusCode: 200,
      body: JSON.stringify({ title: title.trim(), image: image.trim() }),
    };
  } catch (error) {
    return {
      statusCode: 200,
      body: JSON.stringify({ title: "", image: "" }),
    };
  }
};
