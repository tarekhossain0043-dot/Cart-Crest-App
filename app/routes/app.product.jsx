import { useEffect, useState } from "react";
import { Link, useFetcher, useLoaderData, useLocation } from "react-router";
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
            productType
            vendor
            totalInventory
            featuredImage {
              url
              altText
            }
            activity: metafield(namespace: "$app", key: "product_activity") { value }
            variants(first: 1) {
              nodes {
                id
                price
                sku
                inventoryItem { id sku }
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
  const intent = String(formData.get("intent") || "delete");

  if (intent === "edit") {
    const productId = String(formData.get("productId") || "");
    const title = String(formData.get("title") || "").trim();
    const status = String(formData.get("status") || "ACTIVE");
    const productType = String(formData.get("productType") || "").trim();
    const vendor = String(formData.get("vendor") || "").trim();
    const sku = String(formData.get("sku") || "").trim();
    const imageUrl = String(formData.get("imageUrl") || "").trim();
    const imageFile = formData.get("imageFile");
    const activity = String(formData.get("activity") || "").trim();

    if (!productId || !title)
      return { error: "Product ID and name are required." };
    if (!["ACTIVE", "DRAFT", "ARCHIVED"].includes(status)) {
      return { error: "Choose a valid product status." };
    }

    const productResponse = await admin.graphql(
      `#graphql
        mutation UpdateProduct($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product { id title status productType vendor }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          product: {
            id: productId,
            title,
            status,
            productType,
            vendor,
            metafields: [
              {
                namespace: "$app",
                key: "product_activity",
                type: "single_line_text_field",
                value: activity,
              },
            ],
          },
        },
      },
    );
    const productResponseJson = await productResponse.json();
    if (productResponseJson.errors?.length) {
      return {
        error: productResponseJson.errors
          .map(({ message }) => message)
          .join(", "),
      };
    }
    const productUpdate = productResponseJson.data?.productUpdate;
    if (productUpdate?.userErrors?.length) {
      return {
        error: productUpdate.userErrors
          .map(({ message }) => message)
          .join(", "),
      };
    }

    const productData = productUpdate?.product;
    const variantId = String(formData.get("variantId") || "");
    if (variantId) {
      const variantResponse = await admin.graphql(
        `#graphql
          mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants { id inventoryItem { id sku } }
              userErrors { field message }
            }
          }`,
        {
          variables: {
            productId,
            variants: [{ id: variantId, inventoryItem: { sku } }],
          },
        },
      );
      const variantResponseJson = await variantResponse.json();
      if (variantResponseJson.errors?.length) {
        return {
          error: variantResponseJson.errors
            .map(({ message }) => message)
            .join(", "),
        };
      }
      const variantErrors =
        variantResponseJson.data?.productVariantsBulkUpdate?.userErrors ?? [];
      if (variantErrors.length)
        return {
          error: variantErrors.map(({ message }) => message).join(", "),
        };
    }

    let mediaSource = imageUrl;
    if (imageFile instanceof File && imageFile.size > 0) {
      const stagedResponse = await admin.graphql(
        `#graphql
          mutation StageProductImage($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
              stagedTargets { url resourceUrl parameters { name value } }
              userErrors { field message }
            }
          }`,
        {
          variables: {
            input: [
              {
                filename: imageFile.name,
                mimeType: imageFile.type || "image/jpeg",
                httpMethod: "POST",
                resource: "PRODUCT_IMAGE",
              },
            ],
          },
        },
      );
      const stagedResponseJson = await stagedResponse.json();
      if (stagedResponseJson.errors?.length) {
        return {
          error: stagedResponseJson.errors
            .map(({ message }) => message)
            .join(", "),
        };
      }
      const stagedUpload = stagedResponseJson.data?.stagedUploadsCreate;
      if (stagedUpload?.userErrors?.length) {
        return {
          error: stagedUpload.userErrors
            .map(({ message }) => message)
            .join(", "),
        };
      }
      const stagedTarget = stagedUpload?.stagedTargets?.[0];
      if (!stagedTarget)
        return { error: "Shopify could not prepare the image upload." };

      const uploadForm = new FormData();
      stagedTarget.parameters.forEach(({ name, value }) => {
        uploadForm.append(name, value);
      });
      uploadForm.append("file", imageFile);
      const uploadResponse = await fetch(stagedTarget.url, {
        method: "POST",
        body: uploadForm,
      });
      if (!uploadResponse.ok)
        return { error: "Image upload failed. Try another file." };
      mediaSource = stagedTarget.resourceUrl;
    }

    if (mediaSource) {
      const mediaResponse = await admin.graphql(
        `#graphql
          mutation AddProductImage($productId: ID!, $media: [CreateMediaInput!]!) {
            productCreateMedia(productId: $productId, media: $media) {
              media { alt }
              mediaUserErrors { field message }
            }
          }`,
        {
          variables: {
            productId,
            media: [{ originalSource: mediaSource, mediaContentType: "IMAGE" }],
          },
        },
      );
      const mediaResponseJson = await mediaResponse.json();
      if (mediaResponseJson.errors?.length) {
        return {
          error: mediaResponseJson.errors
            .map(({ message }) => message)
            .join(", "),
        };
      }
      const mediaErrors =
        mediaResponseJson.data?.productCreateMedia?.mediaUserErrors ?? [];
      if (mediaErrors.length)
        return { error: mediaErrors.map(({ message }) => message).join(", ") };
    }

    return { updatedProductId: productData?.id };
  }

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
const PRODUCTS_PER_PAGE = 5;

const LoadingSpinner = () => (
  <span
    aria-label="Loading"
    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
    role="status"
  />
);

export default function ProductPage() {
  const { products, shopDomain } = useLoaderData();
  const location = useLocation();
  const deleteFetcher = useFetcher();
  const [search, setSearch] = useState("");
  const [addingVariantId, setAddingVariantId] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [productToDelete, setProductToDelete] = useState(null);
  const [productToEdit, setProductToEdit] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const editFetcher = useFetcher();
  const isDeleting = deleteFetcher.state !== "idle";
  const isEditing = editFetcher.state !== "idle";
  const filteredProducts = products.filter((product) =>
    `${product.title} ${product.handle}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE),
  );
  const visibleProducts = filteredProducts.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  );
  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1,
  ).filter(
    (page) =>
      page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1,
  );

  const addToCart = async (event, variantId) => {
    event.preventDefault();
    if (!shopDomain || !variantId) return;

    const normalizedVariantId = Number(String(variantId).split("/").pop());
    if (!Number.isFinite(normalizedVariantId)) return;

    setAddingVariantId(variantId);
    setCartMessage("");
    try {
      const response = await fetch("/apps/cart-crest/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          items: [{ id: normalizedVariantId, quantity: 1 }],
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

  useEffect(() => {
    if (editFetcher.data?.updatedProductId) {
      setProductToEdit(null);
      window.location.reload();
    }
  }, [editFetcher.data]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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
              <div className="hidden grid-cols-[minmax(0,2fr)_minmax(90px,0.8fr)_minmax(100px,0.8fr)_minmax(90px,0.7fr)_110px_90px_75px] items-center gap-4 border-b border-[#edf1ee] bg-[#fbfcfb] px-6 py-4 text-xs font-bold uppercase tracking-[0.12em] text-[#87938c] md:grid">
                <span>Product</span>
                <span>Status</span>
                <span>Inventory</span>
                <span>Price</span>
                <span>Add</span>
                <span>Edit</span>
                <span>Delete</span>
              </div>
              <div className="divide-y divide-[#edf1ee]">
                {visibleProducts.map((product) => {
                  const variant = product.variants.nodes[0];
                  const variantId = variant?.id?.split("/").pop();
                  const isAdding = addingVariantId === variantId;
                  const statusClass =
                    statusStyles[product.status] ?? statusStyles.ARCHIVED;

                  return (
                    <div
                      className="grid gap-4 px-5 py-5 transition hover:bg-[#fbfdfb] md:grid-cols-[minmax(0,2fr)_minmax(90px,0.8fr)_minmax(100px,0.8fr)_minmax(90px,0.7fr)_110px_90px_75px] md:items-center md:px-6"
                      key={product.id}
                    >
                      <Link
                        className="flex min-w-0 items-center gap-3"
                        to={{
                          pathname: "/app/single-product",
                          search: location.search,
                        }}
                        state={{ product }}
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
                      </Link>
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
                        disabled={!shopDomain || !variant?.id || isAdding}
                        onClick={(event) => addToCart(event, variantId)}
                        type="button"
                      >
                        {isAdding ? (
                          <span className="inline-flex items-center gap-2">
                            <LoadingSpinner />
                            Adding...
                          </span>
                        ) : (
                          "Add to cart"
                        )}
                      </button>
                      <button
                        className="rounded-lg border border-[#abc9b4] px-3 py-2 text-center text-xs font-bold text-[#287044] transition hover:bg-[#f0f8f2] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isEditing}
                        onClick={() => setProductToEdit(product)}
                        type="button"
                      >
                        {isEditing ? (
                          <span className="inline-flex items-center gap-2">
                            <LoadingSpinner />
                            Edi...
                          </span>
                        ) : (
                          "Edit"
                        )}
                      </button>
                      <button
                        className="rounded-lg overflow-hidden border border-[#e4b7b1] px-3 py-2 text-center text-xs font-bold text-[#b34b3f] transition hover:bg-[#fff3f1] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isDeleting}
                        onClick={() => {
                          setDeleteMessage("");
                          setProductToDelete(product);
                        }}
                        type="button"
                      >
                        {isDeleting ? (
                          <span className="inline-flex items-center gap-2">
                            <LoadingSpinner />
                            Del...
                          </span>
                        ) : (
                          "Delete"
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              <footer className="flex flex-col gap-4 border-t border-[#edf1ee] bg-[#fbfcfb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs font-semibold text-[#718078]">
                  Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}-
                  {Math.min(
                    currentPage * PRODUCTS_PER_PAGE,
                    filteredProducts.length,
                  )}{" "}
                  of {filteredProducts.length}
                </p>
                <nav
                  aria-label="Product pagination"
                  className="flex items-center gap-1"
                >
                  <button
                    aria-label="Previous page"
                    className="rounded-lg border border-[#dce5df] px-3 py-2 text-xs font-bold text-[#53645b] transition hover:border-[#99b9a5] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((page) => page - 1)}
                    type="button"
                  >
                    Previous
                  </button>
                  {pageNumbers.map((page, index) => {
                    const previousPage = pageNumbers[index - 1];
                    return (
                      <span className="flex items-center gap-1" key={page}>
                        {previousPage && page - previousPage > 1 ? (
                          <span className="px-1 text-xs text-[#9aa69f]">
                            ...
                          </span>
                        ) : null}
                        <button
                          aria-current={
                            currentPage === page ? "page" : undefined
                          }
                          aria-label={`Go to page ${page}`}
                          className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition ${currentPage === page ? "bg-[#2f8c59] text-white" : "border border-[#dce5df] bg-white text-[#53645b] hover:border-[#99b9a5]"}`}
                          onClick={() => setCurrentPage(page)}
                          type="button"
                        >
                          {page}
                        </button>
                      </span>
                    );
                  })}
                  <button
                    aria-label="Next page"
                    className="rounded-lg border border-[#dce5df] px-3 py-2 text-xs font-bold text-[#53645b] transition hover:border-[#99b9a5] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((page) => page + 1)}
                    type="button"
                  >
                    Next
                  </button>
                </nav>
              </footer>
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
                {isDeleting ? (
                  <span className="inline-flex items-center gap-2">
                    <LoadingSpinner />
                    Deleting...
                  </span>
                ) : (
                  "Yes, delete product"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {productToEdit ? (
        <div
          aria-labelledby="edit-product-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#18221d]/55 px-4 py-8"
          role="dialog"
        >
          <div className="w-full max-h-[400px] h-full overflow-y-hidden max-w-2xl rounded-2xl border border-[#dce5df] bg-white p-6 shadow-2xl sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
              Catalog editor
            </p>
            <h2 className="mt-2 text-2xl font-semibold" id="edit-product-title">
              Edit product
            </h2>
            <div className="overflow-y-auto pt-2 h-[314px] scrollbar-none">
              <div className="overflow-y-hidden pt-6 pb-6">
                <editFetcher.Form
                  className="grid gap-4 sm:grid-cols-2 overflow-y-scroll scrollbar-none"
                  encType="multipart/form-data"
                  method="post"
                >
                  <input name="intent" type="hidden" value="edit" />
                  <input
                    name="productId"
                    type="hidden"
                    value={productToEdit.id}
                  />
                  <input
                    name="variantId"
                    type="hidden"
                    value={productToEdit.variants?.nodes?.[0]?.id || ""}
                  />
                  <label className="text-sm font-semibold sm:col-span-2">
                    Product name
                    <input
                      className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                      defaultValue={productToEdit.title}
                      name="title"
                      required
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Product Price
                    <input
                      className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                      defaultValue={productToEdit.price || "0"}
                      name="price"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Status
                    <select
                      className="mt-2 w-full rounded-xl border border-[#cbd8cf] bg-white px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                      defaultValue={productToEdit.status}
                      name="status"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="DRAFT">Draft</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Activity
                    <input
                      className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                      defaultValue={productToEdit.activity?.value || ""}
                      name="activity"
                      placeholder="e.g. Featured this week"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Product type
                    <input
                      className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                      defaultValue={productToEdit.productType || ""}
                      name="productType"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Vendor
                    <input
                      className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                      defaultValue={productToEdit.vendor || ""}
                      name="vendor"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    SKU
                    <input
                      className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                      defaultValue={
                        productToEdit.variants?.nodes?.[0]?.sku || ""
                      }
                      name="sku"
                    />
                  </label>
                  <label className="text-sm font-semibold sm:col-span-2">
                    Upload image file
                    <input
                      accept="image/*"
                      className="mt-2 block w-full rounded-xl border border-[#cbd8cf] bg-white px-3 py-3 font-normal outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-[#e8f1eb] file:px-3 file:py-2 file:font-semibold file:text-[#287044]"
                      name="imageFile"
                      type="file"
                    />
                  </label>
                  {/* <label className="text-sm font-semibold sm:col-span-2">
                    Image URL
                    <input
                      className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                      defaultValue={productToEdit.featuredImage?.url || ""}
                      name="imageUrl"
                      placeholder="https://..."
                      type="url"
                    />
                  </label> */}
                  {editFetcher.data?.error ? (
                    <p className="text-sm font-semibold text-[#b34b3f] sm:col-span-2">
                      {editFetcher.data.error}
                    </p>
                  ) : null}
                  <div className="flex flex-col-reverse gap-3 pt-3 sm:col-span-2 sm:flex-row sm:justify-end">
                    <button
                      className="rounded-xl border border-[#cbd8cf] px-4 py-3 text-sm font-bold text-[#53645b] hover:bg-[#f6f7f5]"
                      onClick={() => setProductToEdit(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded-xl bg-[#2f8c59] px-4 py-3 text-sm font-bold text-white hover:bg-[#246f46] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isEditing}
                      type="submit"
                    >
                      {isEditing ? (
                        <span className="inline-flex items-center gap-2">
                          <LoadingSpinner />
                          Saving...
                        </span>
                      ) : (
                        "Save changes"
                      )}
                    </button>
                  </div>
                </editFetcher.Form>
              </div>
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
