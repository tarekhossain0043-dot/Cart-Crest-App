import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.public.appProxy(request);

    if (!session?.shop) {
      return Response.json(
        { error: "This shop is not authenticated with the app." },
        { status: 401 },
      );
    }

    const response = await fetch(`https://${session.shop}/cart.js`, {
      headers: {
        Accept: "application/json",
        ...(request.headers.get("Cookie")
          ? { Cookie: request.headers.get("Cookie") }
          : {}),
      },
    });
    console.log("Status:", response.status);
    console.log("Status Text:", response.statusText);
    console.log("Response URL:", response.url);
    const body = await response.text();

    console.log("Response Body:", body);

    if (!response.ok) {
      console.error(`[Cart.js] Shopify returned ${response.status}`);
      return Response.json(
        { items: [], total_price: 0, item_count: 0 },
        { status: 200 },
      );
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Origin")
          ? {
              "Access-Control-Allow-Origin": request.headers.get("Origin"),
              "Access-Control-Allow-Credentials": "true",
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("[Cart.js] Error:", error);
    return Response.json(
      { items: [], total_price: 0, item_count: 0 },
      { status: 200 },
    );
  }
};
