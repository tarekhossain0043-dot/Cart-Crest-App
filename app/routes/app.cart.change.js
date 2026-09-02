import { authenticateCartRequest, shopCartRequest } from "../cart.server";

export async function action({ request }) {
  const auth = await authenticateCartRequest(request);
  if (auth.response) return auth.response;

  const formData = await request.formData();
  const body = new URLSearchParams();
  body.set("line", String(formData.get("line") || ""));
  body.set("quantity", String(formData.get("quantity") || "0"));

  return shopCartRequest(request, auth.shop, "/cart/change.js", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });
}
