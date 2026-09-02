import { authenticateCartRequest, shopCartRequest } from "../cart.server";

export async function action({ request }) {
  const auth = await authenticateCartRequest(request);
  if (auth.response) return auth.response;

  const formData = await request.formData();
  const body = new URLSearchParams();
  body.set("id", String(formData.get("id") || ""));
  body.set("quantity", String(formData.get("quantity") || "1"));

  if (!body.get("id")) {
    return Response.json(
      { error: "Product variant id is required." },
      { status: 400 },
    );
  }

  return shopCartRequest(request, auth.shop, "/cart/add.js", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });
}
