import { authenticate } from "./shopify.server";

function getCartCookie(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("cart="));
}

function appCookie(setCookie) {
  if (!setCookie) return null;
  return setCookie
    .split(";")
    .filter((part) => !/^\s*Domain=/i.test(part))
    .join(";");
}

export async function authenticateCartRequest(request) {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    return {
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { shop: session.shop };
}

export async function shopCartRequest(request, shop, path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  const cartCookie = getCartCookie(request);
  if (cartCookie) headers.set("Cookie", cartCookie);

  const response = await fetch(`https://${shop}${path}`, {
    ...options,
    headers,
  });
  const responseHeaders = new Headers({
    "Content-Type": response.headers.get("Content-Type") || "application/json",
  });
  const setCookie = appCookie(response.headers.get("Set-Cookie"));
  if (setCookie) responseHeaders.set("Set-Cookie", setCookie);

  return new Response(await response.text(), {
    status: response.status,
    headers: responseHeaders,
  });
}
