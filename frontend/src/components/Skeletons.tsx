function Line({ className = "" }: { className?: string }) {
  return <span className={`skeleton-line ${className}`} />;
}

function ProductCardSkeleton() {
  return (
    <article className="card-soft overflow-hidden">
      <div className="skeleton-block aspect-[3/4] w-full" />
      <div className="space-y-3 p-4">
        <Line className="h-3 w-32" />
        <Line className="h-6 w-4/5" />
        <Line className="h-5 w-24" />
        <Line className="h-4 w-28" />
        <div className="flex gap-2 pt-1">
          <Line className="h-9 w-36 rounded-full" />
          <Line className="h-9 w-28 rounded-full" />
        </div>
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function AppBootSkeleton() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-10">
      <div className="mb-10 flex items-center justify-between">
        <div className="space-y-3">
          <Line className="h-3 w-24" />
          <Line className="h-8 w-64" />
          <Line className="h-4 w-36" />
        </div>
        <Line className="h-11 w-40 rounded-full" />
      </div>
      <HomeSkeleton />
    </main>
  );
}

export function HomeSkeleton() {
  return (
    <>
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="card-soft p-4">
            <Line className="h-3 w-28" />
            <Line className="mt-4 h-7 w-32" />
          </article>
        ))}
      </section>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Line key={i} className="h-10 w-36 rounded-full" />
        ))}
      </div>
      <section className="card-soft mb-6 space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Line className="h-11 min-w-[220px] flex-1 rounded-full" />
          <Line className="h-11 w-40 rounded-full" />
          <Line className="h-10 w-28 rounded-full" />
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
          <Line className="h-11 rounded-full" />
          <Line className="h-11 rounded-full" />
          <div className="rounded-2xl border border-line p-4">
            <div className="mb-3 flex justify-between">
              <Line className="h-4 w-20" />
              <Line className="h-4 w-32" />
            </div>
            <Line className="h-5 w-full rounded-full" />
            <div className="mt-3 flex justify-between">
              <Line className="h-6 w-24 rounded-full" />
              <Line className="h-6 w-24 rounded-full" />
            </div>
          </div>
        </div>
      </section>
      <ProductGridSkeleton />
    </>
  );
}

export function BrandsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <article key={i} className="card-soft p-5">
          <Line className="mb-5 h-12 w-36" />
          <Line className="h-7 w-40" />
          <Line className="mt-4 h-4 w-24" />
          <Line className="mt-2 h-4 w-32" />
          <Line className="mt-5 h-3 w-48" />
        </article>
      ))}
    </div>
  );
}

export function BrandPageSkeleton() {
  return (
    <>
      <Line className="mb-5 h-4 w-60" />
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <Line className="h-12 w-40" />
          <Line className="h-9 w-56" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <article key={i} className="card-soft p-4">
              <Line className="h-3 w-24" />
              <Line className="mt-4 h-7 w-28" />
            </article>
          ))}
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Line key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Line key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <ProductGridSkeleton />
    </>
  );
}

export function ProductDetailSkeleton() {
  return (
    <>
      <Line className="mb-6 h-4 w-72" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Line className="aspect-[3/4] w-full rounded-2xl" />
          <div className="mt-3 flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Line key={i} className="h-16 w-12 rounded-md" />
            ))}
          </div>
        </div>
        <div>
          <Line className="h-3 w-40" />
          <Line className="mt-4 h-10 w-4/5" />
          <Line className="mt-4 h-8 w-32" />
          <div className="mt-8 grid gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between border-b border-line py-2">
                <Line className="h-4 w-24" />
                <Line className="h-4 w-28" />
              </div>
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            <Line className="h-11 w-40 rounded-full" />
            <Line className="h-11 w-24 rounded-full" />
            <Line className="h-11 w-24 rounded-full" />
          </div>
        </div>
      </div>
    </>
  );
}
