import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
    query DashboardProducts {
      products(first: 100, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id title handle status updatedAt totalInventory
          featuredImage { url altText }
          variants(first: 1) { nodes { price } }
        }
      }
    }`);
  const responseJson = await response.json();
  if (responseJson.errors?.length) {
    throw new Error(
      responseJson.errors.map(({ message }) => message).join(", "),
    );
  }
  return { products: responseJson.data?.products?.nodes ?? [] };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const title = String(formData.get("title") || "").trim();
  const status = String(formData.get("status") || "ACTIVE");
  const productType = String(formData.get("productType") || "").trim();
  const vendor = String(formData.get("vendor") || "").trim();
  const price = String(formData.get("price") || "0").trim();
  const sku = String(formData.get("sku") || "").trim();
  const imageFile = formData.get("imageFile");

  if (!title) return { error: "Product name is required." };
  if (!["ACTIVE", "DRAFT", "ARCHIVED"].includes(status)) {
    return { error: "Choose a valid product status." };
  }

  const productInput = {
    title,
    status,
    ...(productType ? { productType } : {}),
    ...(vendor ? { vendor } : {}),
    metafields: [
      {
        namespace: "$app",
        key: "demo_info",
        type: "single_line_text_field",
        value: "Created by React Router Template",
      },
    ],
  };

  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
            demoInfo: metafield(namespace: "$app", key: "demo_info") {
              jsonValue
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        product: productInput,
      },
    },
  );
  const responseJson = await response.json();
  if (responseJson.errors?.length) {
    throw new Error(
      responseJson.errors.map(({ message }) => message).join(", "),
    );
  }

  const productCreate = responseJson.data?.productCreate;
  if (productCreate?.userErrors?.length) {
    throw new Error(
      productCreate.userErrors.map(({ message }) => message).join(", "),
    );
  }

  const product = productCreate?.product;
  const variantId = product?.variants?.edges?.[0]?.node?.id;
  if (!product || !variantId) {
    throw new Error("Shopify did not return a product variant. Try again.");
  }
  const variantInput = {
    id: variantId,
    price,
    ...(sku ? { inventoryItem: { sku } } : {}),
  };

  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [variantInput],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();
  if (variantResponseJson.errors?.length) {
    throw new Error(
      variantResponseJson.errors.map(({ message }) => message).join(", "),
    );
  }
  const variantUpdate = variantResponseJson.data?.productVariantsBulkUpdate;
  if (variantUpdate?.userErrors?.length) {
    throw new Error(
      variantUpdate.userErrors.map(({ message }) => message).join(", "),
    );
  }

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
        error: stagedUpload.userErrors.map(({ message }) => message).join(", "),
      };
    }
    const stagedTarget = stagedUpload?.stagedTargets?.[0];
    if (!stagedTarget)
      return { error: "Shopify could not prepare the image upload." };

    const uploadForm = new FormData();
    stagedTarget.parameters.forEach(({ name, value }) =>
      uploadForm.append(name, value),
    );
    uploadForm.append("file", imageFile);
    const uploadResponse = await fetch(stagedTarget.url, {
      method: "POST",
      body: uploadForm,
    });
    if (!uploadResponse.ok)
      return { error: "Image upload failed. Try another file." };

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
          productId: product.id,
          media: [
            {
              originalSource: stagedTarget.resourceUrl,
              mediaContentType: "IMAGE",
            },
          ],
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
  return {
    product,
    variant: variantUpdate?.productVariants,
  };
};

export default function Index() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryForm, setRecoveryForm] = useState({
    flowName: "Abandoned Cart Recovery",
    trigger: "Customer abandons cart",
    delay: "1 hour",
    action: "Email",
    discount: "No discount",
    active: true,
  });
  const isLoading = ["loading", "submitting"].includes(fetcher.state);
  const openProductModal = () => setIsProductModalOpen(true);
  const openRecoveryFlow = () => setIsRecoveryModalOpen(true);
  const closeRecoveryFlow = () => setIsRecoveryModalOpen(false);
  const saveRecoveryFlow = () => {
    shopify.toast.show(
      `${recoveryForm.flowName || "Recovery flow"} saved and ${recoveryForm.active ? "activated" : "saved"}.`,
    );
    closeRecoveryFlow();
  };
  const activeProducts = products.filter(
    (product) => product.status === "ACTIVE",
  );
  const draftProducts = products.filter(
    (product) => product.status === "DRAFT",
  );
  const inventory = products.reduce(
    (total, product) => total + (product.totalInventory ?? 0),
    0,
  );
  const prices = products
    .map((product) => Number(product.variants?.nodes?.[0]?.price || 0))
    .filter((price) => price > 0);
  const catalogValue = prices.reduce((total, price) => total + price, 0);
  const averagePrice = prices.length ? catalogValue / prices.length : 0;
  const formatMoney = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const chartData = chartDays.map((date) => ({
    label: date.toLocaleDateString("en-US", { weekday: "short" }),
    count: products.filter((product) => {
      const updated = new Date(product.updatedAt);
      return updated.toDateString() === date.toDateString();
    }).length,
  }));
  //   Show More Button Event
  const [visible_item, setVisible_item] = useState(4);
  const handle_show_more = () => {
    visible_item;
    setVisible_item(10);
  };
  const maxChartCount = Math.max(1, ...chartData.map(({ count }) => count));
  const stats = [
    [
      formatMoney(catalogValue),
      "Catalog value",
      `${products.length} products`,
      "text-[#2f8c59]",
    ],
    [
      String(activeProducts.length),
      "Active products",
      `${draftProducts.length} drafts`,
      "text-[#2f8c59]",
    ],
    [
      String(inventory),
      "Inventory units",
      "Across your catalog",
      "text-[#2f8c59]",
    ],
    [
      formatMoney(averagePrice),
      "Average price",
      `${prices.length} priced items`,
      "text-[#2f8c59]",
    ],
  ];

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created successfully");
      setIsProductModalOpen(false);
    }
    if (fetcher.data?.error)
      shopify.toast.show(fetcher.data.error, { isError: true });
  }, [fetcher.data?.product?.id, fetcher.data?.error, shopify]);

  return (
    <s-page heading="Cart Crest">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={openProductModal}
        loading={isLoading}
      >
        Create test product
      </s-button>
      <div className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-[#18221d] sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                Store performance / Today
              </p>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-[#18221d] sm:text-5xl">
                Your catalog at a glance.
              </h1>
              <p className="mt-3 max-w-xl text-base leading-7 text-[#64736b]">
                Live product, pricing, and inventory data from your store.
              </p>
            </div>
            <div className="flex items-center justify-center max-w-[150px] w-full gap-2 self-center rounded-sm border border-[#dce5df] bg-white px-3 py-2 text-sm text-[#53645b] shadow-sm md:self-auto">
              <span className="h-2 w-2 rounded-full bg-[#37a566]" />
              <span className="text-sm">Live store data</span>
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(([value, label, change, color]) => (
              <div
                className="rounded-2xl border border-[#dce5df] bg-white p-5 shadow-[0_8px_24px_rgba(32,54,42,0.04)]"
                key={label}
              >
                <p className="text-sm text-[#718078]">{label}</p>
                <div className="mt-3 flex flex-col items-end justify-between gap-2">
                  <strong className="text-3xl font-semibold tracking-tight">
                    {value}
                  </strong>
                  <span className={`mb-1 text-xs font-semibold ${color}`}>
                    {change}
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-2xl border border-[#dce5df] bg-white p-5 shadow-[0_8px_24px_rgba(32,54,42,0.04)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#18221d]">
                    Product activity overview
                  </p>
                  <p className="mt-1 text-sm text-[#7a887f]">
                    Products updated over the last 7 days
                  </p>
                </div>
                <button
                  className="rounded-lg border border-[#dce5df] px-3 py-2 text-xs font-semibold text-[#53645b] transition hover:border-[#99b9a5]"
                  type="button"
                >
                  Last 7 days
                </button>
              </div>
              <div className="mt-8 flex h-52 items-end gap-2 border-b border-[#e7ede9] pb-0 sm:gap-4">
                {chartData.map(({ label, count }, index) => (
                  <div
                    className="group flex h-full flex-1 flex-col justify-end gap-2"
                    key={index}
                  >
                    <div
                      className={`rounded-t-lg transition group-hover:bg-[#2f8c59] ${index === 6 ? "bg-[#e1a24a]" : "bg-[#c7e5d2]"}`}
                      style={{ height: `${(count / maxChartCount) * 100}%` }}
                    />
                    <span className="text-center text-[11px] text-[#9aa69f]">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-5 text-xs text-[#718078]">
                <span className="flex items-center gap-2">
                  <i className="h-2 w-2 rounded-full bg-[#e1a24a]" />
                  Updated products
                </span>
                <span className="flex items-center gap-2">
                  <i className="h-2 w-2 rounded-full bg-[#c7e5d2]" />
                  Last 7 days
                </span>
              </div>
            </div>
            <div className="rounded-2xl bg-[#193a2a] p-6 text-white shadow-[0_12px_32px_rgba(25,58,42,0.18)]">
              <p className="text-sm font-semibold text-[#b8d9c4]">
                Attention needed
              </p>
              <div className="mt-7 flex items-end justify-between">
                <strong className="text-6xl font-semibold tracking-tight">
                  {draftProducts.length}
                </strong>
                <span className="mb-2 rounded-full bg-[#315b46] px-3 py-1 text-xs text-[#d8eddf]">
                  {draftProducts.length === 1
                    ? "1 draft"
                    : `${draftProducts.length} drafts`}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#b8d9c4]">
                Draft products are waiting for review before they go live in
                your catalog.
              </p>
              <button
                className="mt-8 w-full rounded-xl bg-[#e1a24a] px-4 py-3 text-sm font-bold text-[#193a2a] transition hover:bg-[#edb564]"
                type="button"
              >
                Review recovery queue <span aria-hidden="true">-&gt;</span>
              </button>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-2xl border border-[#dce5df] bg-white p-5 shadow-[0_8px_24px_rgba(32,54,42,0.04)] sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    Recent recovery activity
                  </p>
                  <p className="mt-1 text-sm text-[#7a887f]">
                    The latest wins from your store
                  </p>
                </div>
                <a
                  className="text-sm font-semibold text-[#2f8c59]"
                  href="#product-form"
                  onClick={(event) => {
                    event.preventDefault();
                    // openProductModal();
                    handle_show_more();
                  }}
                >
                  View all
                </a>
              </div>
              <div className="mt-6 divide-y divide-[#edf1ee]">
                {products.slice(0, visible_item).map((product, index) => {
                  const productPrice = Number(
                    product.variants?.nodes?.[0]?.price || 0,
                  );
                  const updatedAt = new Date(product.updatedAt);
                  const time = Number.isNaN(updatedAt.getTime())
                    ? "Recently"
                    : updatedAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                  const avatarColors = [
                    "bg-[#f8ddc9]",
                    "bg-[#d6e6f2]",
                    "bg-[#e5dbf1]",
                  ];
                  const initials = product.title
                    .split(" ")
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join("")
                    .toUpperCase();
                  return (
                    <div
                      className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"
                      key={product.id}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#53645b] ${avatarColors[index]}`}
                      >
                        {initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {product.title}
                        </p>
                        <p className="text-xs text-[#87938c]">
                          {product.status} product{" "}
                          <span className="mx-1">/</span> {time}
                        </p>
                      </div>
                      <strong className="text-sm font-semibold text-[#2f8c59]">
                        {productPrice ? formatMoney(productPrice) : "No price"}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-[#dce5df] bg-[#fffdf8] p-6 shadow-[0_8px_24px_rgba(32,54,42,0.04)]">
              <p className="text-sm font-semibold">Quick actions</p>
              <p className="mt-1 text-sm text-[#7a887f]">
                Keep your recovery engine moving.
              </p>
              <div className="mt-5 grid gap-2">
                <button
                  className="flex w-full items-center justify-between rounded-xl border border-[#e8e3d8] bg-white px-4 py-3 text-left text-sm font-semibold transition hover:border-[#e1a24a]"
                  onClick={openRecoveryFlow}
                  type="button"
                >
                  Create recovery flow{" "}
                  <span className="text-[#e1a24a]">-&gt;</span>
                </button>
                <button
                  className="flex items-center justify-between rounded-xl border border-[#e8e3d8] bg-white px-4 py-3 text-left text-sm font-semibold transition hover:border-[#e1a24a]"
                  onClick={openProductModal}
                  type="button"
                >
                  Create test product{" "}
                  <span className="text-[#e1a24a]">-&gt;</span>
                </button>
              </div>
              {fetcher.data?.product && (
                <p className="mt-4 rounded-lg bg-[#e7f4eb] p-3 text-xs text-[#2f8c59]">
                  Test product created successfully.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
      {isProductModalOpen ? (
        <div
          aria-labelledby="create-product-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto scrollbar-none bg-[#18221d]/55 px-4 py-8"
          role="dialog"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto scrollbar-none rounded-2xl border border-[#dce5df] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                  Product setup
                </p>
                <h2
                  className="mt-2 text-2xl font-semibold"
                  id="create-product-title"
                >
                  Create product and recovery flow
                </h2>
                <p className="mt-2 text-sm text-[#718078]">
                  Add the product details and image that should power this flow.
                </p>
              </div>
              <button
                aria-label="Close product form"
                className="leading-none text-[#718078] hover:text-[#18221d]"
                onClick={() => setIsProductModalOpen(false)}
                type="button"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 cursor-pointer transition-all duration-500 ease-in-out hover:bg-green-300 text-2xl font-medium text-black leading-8">
                  &times;
                </span>
              </button>
            </div>
            <fetcher.Form
              className="mt-6 grid gap-4 sm:grid-cols-2"
              encType="multipart/form-data"
              method="post"
            >
              <label className="text-sm font-semibold sm:col-span-2">
                Product name
                <input
                  className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                  name="title"
                  placeholder="e.g. Summer essentials"
                  required
                />
              </label>
              <label className="text-sm font-semibold">
                Price
                <input
                  className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                  defaultValue="100.00"
                  min="0"
                  name="price"
                  step="0.01"
                  type="number"
                />
              </label>
              <label className="text-sm font-semibold">
                Status
                <select
                  className="mt-2 w-full rounded-xl border border-[#cbd8cf] bg-white px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                  defaultValue="ACTIVE"
                  name="status"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Product type
                <input
                  className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                  name="productType"
                  placeholder="e.g. Accessories"
                />
              </label>
              <label className="text-sm font-semibold">
                Vendor
                <input
                  className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                  name="vendor"
                  placeholder="Brand or supplier"
                />
              </label>
              <label className="text-sm font-semibold">
                SKU
                <input
                  className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                  name="sku"
                  placeholder="Optional SKU"
                />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Product image
                <input
                  accept="image/*"
                  className="mt-2 block w-full rounded-xl border border-[#cbd8cf] bg-white px-3 py-3 font-normal outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-[#e8f1eb] file:px-3 file:py-2 file:font-semibold file:text-[#287044]"
                  name="imageFile"
                  type="file"
                />
              </label>
              {fetcher.data?.error ? (
                <p className="text-sm font-semibold text-[#b34b3f] sm:col-span-2">
                  {fetcher.data.error}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-3 pt-3 sm:col-span-2 sm:flex-row sm:justify-end">
                <button
                  className="rounded-xl border border-[#cbd8cf] px-4 py-3 text-sm font-bold text-[#53645b] hover:bg-[#f6f7f5]"
                  onClick={() => setIsProductModalOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-[#2f8c59] px-4 py-3 text-sm font-bold text-white hover:bg-[#246f46] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading ? "Creating..." : "Create product"}
                </button>
              </div>
            </fetcher.Form>
          </div>
        </div>
      ) : null}

      {isRecoveryModalOpen ? (
        <div
          aria-labelledby="create-recovery-flow-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#18221d]/55 px-4 py-8"
          role="dialog"
        >
          <div className="w-full max-w-xl rounded-2xl border border-[#dce5df] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                  Recovery flow setup
                </p>
                <h2
                  className="mt-2 text-2xl font-semibold text-[#18221d]"
                  id="create-recovery-flow-title"
                >
                  Create Recovery Flow
                </h2>
              </div>
              <button
                aria-label="Close recovery flow form"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#edf3ee] text-2xl text-[#53645b] hover:bg-[#e1eadf]"
                onClick={closeRecoveryFlow}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="text-sm font-semibold text-[#18221d]">
                Flow Name
                <input
                  className="mt-2 w-full rounded-xl border border-[#cbd8cf] px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                  onChange={(event) =>
                    setRecoveryForm((current) => ({
                      ...current,
                      flowName: event.target.value,
                    }))
                  }
                  value={recoveryForm.flowName}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-[#18221d]">
                  Trigger
                  <select
                    className="mt-2 w-full rounded-xl border border-[#cbd8cf] bg-white px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                    onChange={(event) =>
                      setRecoveryForm((current) => ({
                        ...current,
                        trigger: event.target.value,
                      }))
                    }
                    value={recoveryForm.trigger}
                  >
                    <option value="Customer abandons cart">
                      Customer abandons cart
                    </option>
                    <option value="Customer adds to cart but doesn't buy">
                      Customer adds to cart but does not buy
                    </option>
                  </select>
                </label>

                <label className="text-sm font-semibold text-[#18221d]">
                  Delay
                  <select
                    className="mt-2 w-full rounded-xl border border-[#cbd8cf] bg-white px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                    onChange={(event) =>
                      setRecoveryForm((current) => ({
                        ...current,
                        delay: event.target.value,
                      }))
                    }
                    value={recoveryForm.delay}
                  >
                    <option value="1 hour">1 hour</option>
                    <option value="6 hours">6 hours</option>
                    <option value="24 hours">24 hours</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-[#18221d]">
                  Recovery Action
                  <select
                    className="mt-2 w-full rounded-xl border border-[#cbd8cf] bg-white px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                    onChange={(event) =>
                      setRecoveryForm((current) => ({
                        ...current,
                        action: event.target.value,
                      }))
                    }
                    value={recoveryForm.action}
                  >
                    <option value="Email">Email</option>
                    <option value="Discount code">Discount code</option>
                    <option value="Recovery link">Recovery link</option>
                  </select>
                </label>

                <label className="text-sm font-semibold text-[#18221d]">
                  Discount
                  <select
                    className="mt-2 w-full rounded-xl border border-[#cbd8cf] bg-white px-3 py-3 font-normal outline-none focus:border-[#3c8060]"
                    onChange={(event) =>
                      setRecoveryForm((current) => ({
                        ...current,
                        discount: event.target.value,
                      }))
                    }
                    value={recoveryForm.discount}
                  >
                    <option value="No discount">No discount</option>
                    <option value="5%">5%</option>
                    <option value="10%">10%</option>
                    <option value="Custom">Custom</option>
                  </select>
                </label>
              </div>

              <div className="rounded-xl border border-[#e7ede9] bg-[#f6f7f5] p-4 text-sm text-[#53645b]">
                <p className="font-semibold text-[#18221d]">Flow preview</p>
                <div className="mt-3 space-y-2">
                  <p>
                    <span className="font-medium text-[#18221d]">Name:</span>{" "}
                    {recoveryForm.flowName || "Abandoned Cart Recovery"}
                  </p>
                  <p>
                    <span className="font-medium text-[#18221d]">Trigger:</span>{" "}
                    {recoveryForm.trigger}
                  </p>
                  <p>
                    <span className="font-medium text-[#18221d]">Wait:</span>{" "}
                    {recoveryForm.delay}
                  </p>
                  <p>
                    <span className="font-medium text-[#18221d]">Action:</span>{" "}
                    {recoveryForm.action}
                  </p>
                  <p>
                    <span className="font-medium text-[#18221d]">
                      Discount:
                    </span>{" "}
                    {recoveryForm.discount}
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm font-medium text-[#18221d]">
                <input
                  checked={recoveryForm.active}
                  className="h-4 w-4 rounded border-[#cbd8cf] text-[#2f8c59] focus:ring-[#2f8c59]"
                  onChange={(event) =>
                    setRecoveryForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Activate Flow
              </label>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  className="rounded-xl border border-[#cbd8cf] px-4 py-3 text-sm font-bold text-[#53645b] hover:bg-[#f6f7f5]"
                  onClick={closeRecoveryFlow}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-[#2f8c59] px-4 py-3 text-sm font-bold text-white hover:bg-[#246f46]"
                  onClick={saveRecoveryFlow}
                  type="button"
                >
                  Save & Activate
                </button>
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
