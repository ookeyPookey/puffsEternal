exports.handler = async (event) => {
  const urlParam = event.queryStringParameters?.url || "";
  if (!urlParam) {
    return {
      statusCode: 400,
      body: "Missing url parameter.",
    };
  }

  let response;
  try {
    response = await fetch(urlParam, {
      redirect: "follow",
      headers: {
        "User-Agent": "PuffsEternalImageProxy/1.0",
        Referer: "https://puffseternal.example",
      },
    });
  } catch (error) {
    return {
      statusCode: 502,
      body: "Failed to fetch image.",
    };
  }

  if (!response.ok) {
    return {
      statusCode: response.status,
      body: "Failed to fetch image.",
    };
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  const body = Buffer.from(arrayBuffer).toString("base64");

  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
    body,
  };
};
