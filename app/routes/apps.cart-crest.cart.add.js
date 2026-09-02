import { authenticate } from "../shopify.server";

export async function action({ request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    console.error("[AddToCart] Missing appProxy session shop", {
      url: request.url,
      host: request.headers.get("host"),
    });
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  console.log("[AddToCart] appProxy session shop:", session.shop);

  try {
    let body = await request.text();
    const contentType = request.headers.get("Content-Type") || "";
    const headers = {
      Accept: "application/json",
      "Content-Type": contentType || "application/x-www-form-urlencoded",
      ...(request.headers.get("Cookie")
        ? { Cookie: request.headers.get("Cookie") }
        : {}),
    };

    if (contentType.includes("application/json") && body) {
      try {
        const parsed = JSON.parse(body);
        const item = parsed?.items?.[0];
        const rawId = item?.id ?? parsed?.id;
        const normalizedId = String(rawId ?? "")
          .split("/")
          .pop();

        if (normalizedId && Number.isFinite(Number(normalizedId))) {
          const params = new URLSearchParams();
          params.set("id", String(Number(normalizedId)));
          params.set(
            "quantity",
            String(item?.quantity ?? parsed?.quantity ?? 1),
          );
          params.set("form_type", "product");
          params.set("utf8", "✓");
          body = params.toString();
          headers["Content-Type"] =
            "application/x-www-form-urlencoded; charset=UTF-8";
        }
      } catch (parseError) {
        console.warn(
          "[AddToCart] Invalid JSON payload; forwarding raw body.",
          parseError,
        );
      }
    }

    if (!body || !body.includes("id=")) {
      return Response.json(
        { error: "Missing product variant id for add-to-cart request." },
        { status: 400 },
      );
    }

    console.log("[AddToCart] forwarding to Shopify cart add:", {
      shop: session.shop,
      method: "POST",
      contentType: headers["Content-Type"],
      body,
    });

    const response = await fetch(`https://${session.shop}/cart/add.js`, {
      method: "POST",
      headers,
      body,
    });

    const data = await response.text();
    console.log("[AddToCart] Shopify response status:", response.status);
    console.log("[AddToCart] Shopify response body:", data);

    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        ...(request.headers.get("Origin")
          ? {
              "Access-Control-Allow-Origin": request.headers.get("Origin"),
              "Access-Control-Allow-Credentials": "true",
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("[AddToCart] Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
