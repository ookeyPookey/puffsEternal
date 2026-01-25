const { URL } = require("url");

const parseTags = (html, tagName) => {
  const tags = [];
  const tagRegex = new RegExp(`<${tagName}\\s+[^>]*>`, "gi");
  const attrRegex =
    /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  const matches = html.match(tagRegex) || [];
  matches.forEach((tag) => {
    const attrs = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(tag))) {
      const value = attrMatch[2] || attrMatch[3] || attrMatch[4] || "";
      attrs[attrMatch[1].toLowerCase()] = value;
    }
    tags.push(attrs);
  });
  return tags;
};

const getTagValue = (tags, key, value, attr = "content") => {
  const lowerValue = value.toLowerCase();
  const tag = tags.find((item) => item[key] && item[key].toLowerCase() === lowerValue);
  return tag?.[attr] || "";
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
    const metaTags = parseTags(html, "meta");
    const linkTags = parseTags(html, "link");
    const title =
      getTagValue(metaTags, "property", "og:title") ||
      getTagValue(metaTags, "name", "twitter:title") ||
      getTagValue(metaTags, "name", "title") ||
      getTitle(html);
    const image =
      getTagValue(metaTags, "property", "og:image:secure_url") ||
      getTagValue(metaTags, "property", "og:image") ||
      getTagValue(metaTags, "name", "twitter:image") ||
      getTagValue(metaTags, "name", "twitter:image:src") ||
      getTagValue(metaTags, "itemprop", "image") ||
      getTagValue(metaTags, "name", "image") ||
      getTagValue(linkTags, "rel", "image_src", "href");
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
