import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return Response.json(
      { error: "This shop is not authenticated with the app." },
      { status: 401 },
    );
  }

  const requestBody = await request.text();
  const response = await fetch(`https://${session.shop}/cart/add.js`, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      ...(request.headers.get("Cookie")
        ? { Cookie: request.headers.get("Cookie") }
        : {}),
    },
    body: requestBody,
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") || "application/json",
    },
  });
};
