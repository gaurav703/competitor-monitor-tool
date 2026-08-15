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

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 transition-colors duration-150 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10";

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
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg tracking-tight">Your product</h2>
            <p className="mt-0.5 text-sm text-stone-500">Gemini uses this so analysis is about your product, not the market.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-50 hover:text-stone-900"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-50 hover:text-stone-900"
            >
              Add new
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={pending}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
        <dl className="mt-4 space-y-3">
          {[
            { label: "Name", value: product.name },
            { label: "Industry", value: product.industry },
            { label: "Description", value: product.description, pre: true },
            { label: "Owner email", value: product.ownerEmail },
          ].map((field) => (
            <div key={field.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{field.label}</dt>
              <dd className={`mt-0.5 text-sm ${field.pre ? "whitespace-pre-wrap text-stone-700" : "text-stone-900"}`}>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  const isEdit = Boolean(product && editing);
  return (
    <form
      key={isEdit ? `edit-${product?.id}` : "create"}
      onSubmit={onSubmit}
      className="rounded-xl border border-stone-200 bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg tracking-tight">
            {isEdit ? "Edit product" : product ? "Add new product" : "Your product"}
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">Gemini uses this so analysis is about your product, not the market.</p>
        </div>
        {product ? (
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setEditing(false);
              setError(null);
            }}
            className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        <input
          name="name"
          required
          placeholder="Product name"
          defaultValue={isEdit ? product?.name : undefined}
          className={inputClass}
        />
        <input
          name="industry"
          required
          placeholder="Industry (any)"
          defaultValue={isEdit ? product?.industry : undefined}
          className={inputClass}
        />
        <textarea
          name="description"
          required
          placeholder="Short description of your product"
          defaultValue={isEdit ? product?.description : undefined}
          className={inputClass}
          rows={3}
        />
        <input
          name="ownerEmail"
          type="email"
          required
          placeholder="Owner email (daily digest)"
          defaultValue={isEdit ? product?.ownerEmail : undefined}
          className={inputClass}
        />
      </div>
      {error ? (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <button
        disabled={pending}
        className="mt-4 w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-stone-800 active:bg-stone-950 disabled:opacity-50"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving…
          </span>
        ) : isEdit ? (
          "Save changes"
        ) : (
          "Save product"
        )}
      </button>
    </form>
  );
}
