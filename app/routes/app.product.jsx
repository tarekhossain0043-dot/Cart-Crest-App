import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query ProductIndex {
        products(first: 25, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            title
            handle
            status
            totalInventory
            featuredImage {
              url
              altText
            }
            variants(first: 1) {
              nodes {
                price
              }
            }
          }
        }
      }`,
  );
  const responseJson = await response.json();

  if (responseJson.errors?.length) {
    throw new Error(
      responseJson.errors.map(({ message }) => message).join(", "),
    );
  }

  return { products: responseJson.data?.products?.nodes ?? [] };
};

const statusStyles = {
  ACTIVE: "bg-[#e5f4e9] text-[#287044]",
  DRAFT: "bg-[#fff1d9] text-[#8b5b16]",
  ARCHIVED: "bg-[#edf0ee] text-[#637169]",
};

export default function ProductPage() {
  const { products } = useLoaderData();

  return (
    <s-page heading="Products">
      <div className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-[#18221d] sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                Catalog / Overview
              </p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Your products
              </h1>
              <p className="mt-3 text-base leading-7 text-[#64736b]">
                Browse your latest products and keep an eye on inventory health.
              </p>
            </div>
            <span className="rounded-full border border-[#dce5df] bg-white px-4 py-2 text-sm font-semibold text-[#53645b] shadow-sm">
              {products.length} products shown
            </span>
          </header>

          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cbd8cf] bg-white px-6 py-16 text-center">
              <p className="text-lg font-semibold">No products found</p>
              <p className="mt-2 text-sm text-[#718078]">
                Create a product in Shopify Admin to see it here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#dce5df] bg-white shadow-[0_8px_24px_rgba(32,54,42,0.04)]">
              <div className="hidden grid-cols-[minmax(0,1.8fr)_1fr_1fr_1fr] gap-4 border-b border-[#edf1ee] bg-[#fbfcfb] px-6 py-4 text-xs font-bold uppercase tracking-[0.12em] text-[#87938c] md:grid">
                <span>Product</span>
                <span>Status</span>
                <span>Inventory</span>
                <span>Price</span>
              </div>
              <div className="divide-y divide-[#edf1ee]">
                {products.map((product) => {
                  const variant = product.variants.nodes[0];
                  const statusClass =
                    statusStyles[product.status] ?? statusStyles.ARCHIVED;

                  return (
                    <a
                      className="grid gap-4 px-5 py-5 transition hover:bg-[#fbfdfb] md:grid-cols-[minmax(0,1.8fr)_1fr_1fr_1fr] md:items-center md:px-6"
                      href={`https://admin.shopify.com/store/products/${product.id.split("/").pop()}`}
                      key={product.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {product.featuredImage?.url ? (
                          <img
                            alt={product.featuredImage.altText || product.title}
                            className="h-12 w-12 rounded-xl border border-[#e3eae5] object-cover"
                            src={product.featuredImage.url}
                          />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e8f1eb] text-lg font-bold text-[#3c8060]">
                            {product.title.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#18221d]">
                            {product.title}
                          </p>
                          <p className="truncate text-xs text-[#87938c]">
                            /{product.handle}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:block">
                        <span className="text-xs font-semibold uppercase text-[#9aa69f] md:hidden">
                          Status
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass}`}
                        >
                          {product.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-[#53645b] md:block">
                        <span className="text-xs font-semibold uppercase text-[#9aa69f] md:hidden">
                          Inventory
                        </span>
                        <span>{product.totalInventory ?? 0} units</span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-semibold text-[#2f8c59] md:block">
                        <span className="text-xs font-semibold uppercase text-[#9aa69f] md:hidden">
                          Price
                        </span>
                        <span>
                          {variant?.price ? `$${variant.price}` : "—"}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
