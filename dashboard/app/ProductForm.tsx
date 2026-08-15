"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ProductSummary = {
  id: string;
  name: string;
  industry: string;
  description: string;
  ownerEmail: string;
};

export function ProductForm({ product }: { product: ProductSummary | null }) {
  const router = useRouter();
  const [creating, setCreating] = useState(!product);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const isEdit = Boolean(product && editing);
    const response = await fetch("/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isEdit && product ? { id: product.id } : {}),
        name: data.get("name"),
        industry: data.get("industry"),
        description: data.get("description"),
        ownerEmail: data.get("ownerEmail"),
      }),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Could not save product.");
      return;
    }
    if (isEdit) {
      setEditing(false);
      router.refresh();
      return;
    }
    const saved = (await response.json()) as { _id: string };
    form.reset();
    setCreating(false);
    router.push(`/?userProductId=${saved._id}`);
    router.refresh();
  }

  async function remove() {
    if (!product) {
      return;
    }
    if (!window.confirm(`Delete product "${product.name}" and all of its competitors and history?`)) {
      return;
    }
    setError(null);
    setPending(true);
    const response = await fetch(`/api/products?id=${encodeURIComponent(product.id)}`, {
      method: "DELETE",
    });
    setPending(false);
    if (!response.ok) {
      setError("Could not delete product.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (product && !creating && !editing) {
    return (
      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg">Your product</h2>
            <p className="text-sm text-stone-600">Gemini uses this so analysis is about your product, not the market in general.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700"
            >
              Add new product
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={pending}
              className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Name</dt>
            <dd className="font-medium">{product.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Industry</dt>
            <dd>{product.industry}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Description</dt>
            <dd className="whitespace-pre-wrap text-stone-800">{product.description}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Owner email</dt>
            <dd>{product.ownerEmail}</dd>
          </div>
        </dl>
      </section>
    );
  }

  const isEdit = Boolean(product && editing);
  return (
    <form
      key={isEdit ? `edit-${product?.id}` : "create"}
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-stone-200 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg">
            {isEdit ? "Edit product" : product ? "Add new product" : "Your product"}
          </h2>
          <p className="text-sm text-stone-600">Gemini uses this so analysis is about your product, not the market in general.</p>
        </div>
        {product ? (
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setEditing(false);
              setError(null);
            }}
            className="shrink-0 rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700"
          >
            Cancel
          </button>
        ) : null}
      </div>
      <input
        name="name"
        required
        placeholder="Product name"
        defaultValue={isEdit ? product?.name : undefined}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
      />
      <input
        name="industry"
        required
        placeholder="Industry (any)"
        defaultValue={isEdit ? product?.industry : undefined}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
      />
      <textarea
        name="description"
        required
        placeholder="Short description"
        defaultValue={isEdit ? product?.description : undefined}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
        rows={3}
      />
      <input
        name="ownerEmail"
        type="email"
        required
        placeholder="Owner email (daily digest)"
        defaultValue={isEdit ? product?.ownerEmail : undefined}
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button disabled={pending} className="rounded bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "Saving…" : isEdit ? "Save changes" : "Save product"}
      </button>
    </form>
  );
}
