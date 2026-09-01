import { authenticate } from "../shopify.server";

export async function action({ request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    let body = await request.text();
    const contentType = request.headers.get("Content-Type") || "";
    const headers = {
      Accept: "application/json",
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

    const response = await fetch(`https://${session.shop}/add.js`, {
      method: "POST",
      headers,
      body,
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[AddToCart] Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
