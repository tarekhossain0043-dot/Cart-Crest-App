import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query ProductIndex {
        shop { myshopifyDomain }
        products(first: 100, sortKey: UPDATED_AT, reverse: true) {
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
                id
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

  return {
    products: responseJson.data?.products?.nodes ?? [],
    shopDomain: responseJson.data?.shop?.myshopifyDomain ?? "",
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = String(formData.get("productId") || "");

  if (!productId) return { error: "Product ID is missing." };

  const response = await admin.graphql(
    `#graphql
      mutation DeleteProduct($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors { field message }
        }
      }`,
    { variables: { input: { id: productId } } },
  );
  const responseJson = await response.json();

  if (responseJson.errors?.length) {
    return {
      error: responseJson.errors.map(({ message }) => message).join(", "),
    };
  }

  const deleteResult = responseJson.data?.productDelete;
  if (deleteResult?.userErrors?.length) {
    return {
      error: deleteResult.userErrors.map(({ message }) => message).join(", "),
    };
  }

  return { deletedProductId: deleteResult?.deletedProductId };
};

const statusStyles = {
  ACTIVE: "bg-[#e5f4e9] text-[#287044]",
  DRAFT: "bg-[#fff1d9] text-[#8b5b16]",
  ARCHIVED: "bg-[#edf0ee] text-[#637169]",
};

export default function ProductPage() {
  const { products, shopDomain } = useLoaderData();
  const deleteFetcher = useFetcher();
  const [search, setSearch] = useState("");
  const [addingVariantId, setAddingVariantId] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [productToDelete, setProductToDelete] = useState(null);
  const isDeleting = deleteFetcher.state !== "idle";
  const filteredProducts = products.filter((product) =>
    `${product.title} ${product.handle}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

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

  useEffect(() => {
    if (deleteFetcher.data?.deletedProductId) {
      setDeleteMessage("Product deleted successfully.");
      setProductToDelete(null);
    }
    if (deleteFetcher.data?.error) {
      setDeleteMessage(deleteFetcher.data.error);
    }
  }, [deleteFetcher.data]);

  const deleteProduct = (product) => {
    const formData = new FormData();
    formData.set("productId", product.id);
    deleteFetcher.submit(formData, { method: "POST" });
  };

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
              {filteredProducts.length} products shown
            </span>
          </header>
          <main className="p-0 flex items-start justify-between mb-4">
            {/* Product Filtering */}
            {/*search bar*/}
            <div className="filter_product_left flex flex-col">
              <h1 className="m-0 p-0 text-2xl font-bold leading-[40px] tracking-tight capitalize">
                Product Filtering
              </h1>
              <p className="m-0 p-0 text-[16px] font-normal">
                List of dummy product.
              </p>
            </div>
            <input
              aria-label="Search products"
              type="search"
              placeholder="Search products..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-[#cbd8cf] bg-white px-4 py-3 text-sm outline-none focus:border-[#3c8060] sm:max-w-md"
            />
          </main>

          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cbd8cf] bg-white px-6 py-16 text-center">
              <p className="text-lg font-semibold">
                {products.length === 0
                  ? "No products found"
                  : "No matching products"}
              </p>
              <p className="mt-2 text-sm text-[#718078]">
                Create a product in Shopify Admin to see it here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#dce5df] bg-white shadow-[0_8px_24px_rgba(32,54,42,0.04)]">
              <div className="hidden grid-cols-[minmax(0,2fr)_minmax(90px,0.8fr)_minmax(100px,0.8fr)_minmax(90px,0.7fr)_110px_90px] items-center gap-4 border-b border-[#edf1ee] bg-[#fbfcfb] px-6 py-4 text-xs font-bold uppercase tracking-[0.12em] text-[#87938c] md:grid">
                <span>Product</span>
                <span>Status</span>
                <span>Inventory</span>
                <span>Price</span>
                <span>Add</span>
                <span>Delete</span>
              </div>
              <div className="divide-y divide-[#edf1ee]">
                {filteredProducts.map((product) => {
                  const variant = product.variants.nodes[0];
                  const statusClass =
                    statusStyles[product.status] ?? statusStyles.ARCHIVED;

                  return (
                    <div
                      className="grid gap-4 px-5 py-5 transition hover:bg-[#fbfdfb] md:grid-cols-[minmax(0,2fr)_minmax(90px,0.8fr)_minmax(100px,0.8fr)_minmax(90px,0.7fr)_110px_90px] md:items-center md:px-6"
                      key={product.id}
                    >
                      <a
                        className="flex min-w-0 items-center gap-3"
                        href={`/app/product/${product.id.split("/").pop()}`}
                      >
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
                      </a>
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
                      <button
                        className="rounded-lg bg-[#2f8c59] px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-[#246f46] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                          !shopDomain ||
                          !variant?.id ||
                          addingVariantId === variant.id
                        }
                        onClick={(event) =>
                          addToCart(event, variant?.id?.split("/").pop())
                        }
                        type="button"
                      >
                        {addingVariantId === variant?.id
                          ? "Adding..."
                          : "Add to cart"}
                      </button>
                      <button
                        className="rounded-lg border border-[#e4b7b1] px-3 py-2 text-center text-xs font-bold text-[#b34b3f] transition hover:bg-[#fff3f1] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isDeleting}
                        onClick={() => {
                          setDeleteMessage("");
                          setProductToDelete(product);
                        }}
                        type="button"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {cartMessage ? (
            <p
              className="mt-4 text-sm font-semibold text-[#2f8c59]"
              role="status"
            >
              {cartMessage}
            </p>
          ) : null}
          {deleteMessage ? (
            <p
              className="mt-2 text-sm font-semibold text-[#b34b3f]"
              role="status"
            >
              {deleteMessage}
            </p>
          ) : null}
        </div>
      </div>
      {productToDelete ? (
        <div
          aria-labelledby="delete-product-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#18221d]/55 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#dce5df] bg-white p-6 shadow-2xl sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b34b3f]">
              Permanent action
            </p>
            <h2
              className="mt-2 text-2xl font-semibold"
              id="delete-product-title"
            >
              Delete this product?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#64736b]">
              <strong className="text-[#18221d]">
                {productToDelete.title}
              </strong>{" "}
              will be permanently removed from your Shopify catalog. This action
              cannot be undone.
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-xl border border-[#cbd8cf] px-4 py-3 text-sm font-bold text-[#53645b] hover:bg-[#f6f7f5]"
                onClick={() => setProductToDelete(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-[#b34b3f] px-4 py-3 text-sm font-bold text-white hover:bg-[#963c32] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeleting}
                onClick={() => deleteProduct(productToDelete)}
                type="button"
              >
                {isDeleting ? "Deleting..." : "Yes, delete product"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
