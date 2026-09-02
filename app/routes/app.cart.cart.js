import { authenticateCartRequest, shopCartRequest } from "../cart.server";

export async function loader({ request }) {
  const auth = await authenticateCartRequest(request);
  if (auth.response) return auth.response;
  return shopCartRequest(request, auth.shop, "/cart.js");
}
