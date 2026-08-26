import { useLoaderData } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query ProductDetail($id: ID!) {
        shop { myshopifyDomain }
        product(id: $id) {
          id title handle status descriptionHtml productType vendor totalInventory
          featuredImage { url altText }
          variants(first: 1) { nodes { id price sku } }
        }
        products(first: 5, sortKey: UPDATED_AT, reverse: true, query: "status:active") {
          nodes {
            id title handle featuredImage { url altText }
            variants(first: 1) { nodes { id price } }
          }
        }
      }`,
    { variables: { id: `gid://shopify/Product/${params.id}` } },
  );
  const responseJson = await response.json();

  if (responseJson.errors?.length) {
    throw new Error(
      responseJson.errors.map(({ message }) => message).join(", "),
    );
  }

  const product = responseJson.data?.product;
  if (!product) throw new Response("Product not found", { status: 404 });

  return {
    product,
    shopDomain: responseJson.data?.shop?.myshopifyDomain ?? "",
    relatedProducts: (responseJson.data?.products?.nodes ?? [])
      .filter((item) => item.id !== product.id)
      .slice(0, 4),
  };
};

export default function ProductDetailPage() {
  const { product, relatedProducts, shopDomain } = useLoaderData();
  const variant = product.variants.nodes[0];
  const [addingVariantId, setAddingVariantId] = useState("");
  const [cartMessage, setCartMessage] = useState("");

  const addToCart = async (event, variantId) => {
    event.preventDefault();
    if (!shopDomain || !variantId) return;

    setAddingVariantId(variantId);
    setCartMessage("");
    try {
      const response = await fetch(`https://${shopDomain}/cart/add.js`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: [{ id: Number(variantId), quantity: 1 }],
        }),
      });
      if (!response.ok) throw new Error("Unable to add this product to cart.");
      await response.json();
      document.dispatchEvent(new CustomEvent("cart:refresh"));
      setCartMessage("Added to cart");
    } catch (error) {
      setCartMessage(error.message || "Unable to add this product to cart.");
    } finally {
      setAddingVariantId("");
    }
  };

  return (
    <s-page heading={product.title}>
      <div className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-[#18221d] sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <a
            className="text-sm font-semibold text-[#2f8c59] hover:underline"
            href="/app/product"
          >
            Back to products
          </a>
          <main className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className="overflow-hidden rounded-2xl border border-[#dce5df] bg-white shadow-[0_8px_24px_rgba(32,54,42,0.04)]">
              {product.featuredImage?.url ? (
                <img
                  alt={product.featuredImage.altText || product.title}
                  className="aspect-[4/3] w-full object-cover"
                  src={product.featuredImage.url}
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-[#e8f1eb] text-8xl font-bold text-[#3c8060]">
                  {product.title.charAt(0)}
                </div>
              )}
            </section>
            <section className="rounded-2xl border border-[#dce5df] bg-white p-6 shadow-[0_8px_24px_rgba(32,54,42,0.04)] sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                Product details
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                {product.title}
              </h1>
              <p className="mt-2 text-sm text-[#87938c]">/{product.handle}</p>
              <p className="mt-6 text-3xl font-semibold text-[#2f8c59]">
                {variant?.price ? `$${variant.price}` : "Price unavailable"}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 border-y border-[#edf1ee] py-4 text-sm">
                <span className="text-[#718078]">Status</span>
                <strong>{product.status}</strong>
                <span className="text-[#718078]">Inventory</span>
                <strong>{product.totalInventory ?? 0} units</strong>
                <span className="text-[#718078]">Type</span>
                <strong>{product.productType || "General"}</strong>
              </div>
              {product.descriptionHtml ? (
                <div
                  className="prose prose-sm mt-6 max-w-none text-[#53645b]"
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                />
              ) : (
                <p className="mt-6 text-sm text-[#718078]">
                  No description available.
                </p>
              )}
              <button
                className="mt-8 block w-full rounded-xl bg-[#2f8c59] px-4 py-3 text-center text-sm font-bold text-white hover:bg-[#246f46] disabled:cursor-not-allowed disabled:bg-[#dce5df] disabled:text-[#87938c]"
                disabled={
                  !shopDomain || !variant?.id || addingVariantId === variant.id
                }
                onClick={(event) =>
                  addToCart(event, variant?.id?.split("/").pop())
                }
                type="button"
              >
                {addingVariantId === variant?.id ? "Adding..." : "Add to cart"}
              </button>
              {cartMessage ? (
                <p
                  className="mt-3 text-sm font-semibold text-[#2f8c59]"
                  role="status"
                >
                  {cartMessage}
                </p>
              ) : null}
            </section>
          </main>

          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                  Keep browsing
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  Related products
                </h2>
              </div>
              <a
                className="text-sm font-semibold text-[#2f8c59] hover:underline"
                href="/app/product"
              >
                View all
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((related) => {
                const relatedVariant = related.variants.nodes[0];
                return (
                  <article
                    className="overflow-hidden rounded-2xl border border-[#dce5df] bg-white shadow-[0_8px_24px_rgba(32,54,42,0.04)]"
                    key={related.id}
                  >
                    <a href={`/app/product/${related.id.split("/").pop()}`}>
                      {related.featuredImage?.url ? (
                        <img
                          alt={related.featuredImage.altText || related.title}
                          className="aspect-[4/3] w-full object-cover"
                          src={related.featuredImage.url}
                        />
                      ) : (
                        <div className="flex aspect-[4/3] items-center justify-center bg-[#e8f1eb] text-4xl font-bold text-[#3c8060]">
                          {related.title.charAt(0)}
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="truncate font-semibold">
                          {related.title}
                        </h3>
                        <p className="mt-1 text-sm font-semibold text-[#2f8c59]">
                          {relatedVariant?.price
                            ? `$${relatedVariant.price}`
                            : "Price unavailable"}
                        </p>
                      </div>
                    </a>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
