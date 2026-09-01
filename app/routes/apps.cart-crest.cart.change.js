import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return Response.json(
      { error: "This shop is not authenticated with the app." },
      { status: 401 },
    );
  }

  const contentType = request.headers.get("Content-Type") || "";
  let body = "";

  if (contentType.includes("application/json")) {
    const payload = await request.json().catch(() => ({}));
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(payload || {})) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }

    body = params.toString();
  } else {
    const formData = await request.formData();
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") params.append(key, value);
    }

    body = params.toString();
  }

  const response = await fetch(`https://${session.shop}/cart/change.js`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...(request.headers.get("Cookie")
        ? { Cookie: request.headers.get("Cookie") }
        : {}),
    },
    body,
  });

  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") || "application/json",
    },
  });
};
