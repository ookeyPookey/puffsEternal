const { URL } = require("url");

const parseMetaTags = (html) => {
  const tags = [];
  const metaTagRegex = /<meta\s+[^>]*>/gi;
  const attrRegex = /([^\s=]+)=["']([^"']+)["']/g;
  const matches = html.match(metaTagRegex) || [];
  matches.forEach((tag) => {
    const attrs = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(tag))) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2];
    }
    tags.push(attrs);
  });
  return tags;
};

const getMetaValue = (tags, key, value) => {
  const lowerValue = value.toLowerCase();
  const tag = tags.find((item) => item[key] && item[key].toLowerCase() === lowerValue);
  return tag?.content || "";
};

const getTitle = (html) => {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1] : "";
};

const resolveUrl = (baseUrl, candidate) => {
  if (!candidate) {
    return "";
  }
  if (candidate.startsWith("data:")) {
    return candidate;
  }
  try {
    return new URL(candidate, baseUrl).toString();
  } catch (error) {
    return candidate;
  }
};

const buildProxyUrl = (absoluteUrl) => {
  if (!absoluteUrl) {
    return "";
  }
  return `/.netlify/functions/image-proxy?url=${encodeURIComponent(absoluteUrl)}`;
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
    if (contentType.startsWith("image/")) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          title: "",
          image: parsedUrl.toString(),
        }),
      };
    }
    if (!contentType.includes("text/html")) {
      return {
        statusCode: 200,
        body: JSON.stringify({ title: "", image: "" }),
      };
    }

    const html = await response.text();
    const tags = parseMetaTags(html);
    const title =
      getMetaValue(tags, "property", "og:title") ||
      getMetaValue(tags, "name", "twitter:title") ||
      getTitle(html);
    const image =
      getMetaValue(tags, "property", "og:image:secure_url") ||
      getMetaValue(tags, "property", "og:image") ||
      getMetaValue(tags, "name", "twitter:image") ||
      getMetaValue(tags, "name", "twitter:image:src");
    const resolvedImage = resolveUrl(parsedUrl.toString(), image.trim());
    const proxiedImage = buildProxyUrl(resolvedImage);

    return {
      statusCode: 200,
      body: JSON.stringify({ title: title.trim(), image: proxiedImage }),
    };
  } catch (error) {
    return {
      statusCode: 200,
      body: JSON.stringify({ title: "", image: "" }),
    };
  }
};
