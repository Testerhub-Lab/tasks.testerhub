import React from "react";
import Card from "../../../components/ui/Card";

const SkeletonLine = ({ w = "w-full" }: { w?: string }) => (
  <div className={["h-3 rounded-full bg-white/10", w].join(" ")} />
);

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Issue header / details skeleton */}
      <div className="mx-auto max-w-6xl space-y-4">
        <Card className="animate-pulse space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <SkeletonLine w="w-24" />
              <SkeletonLine w="w-[420px] max-w-[70vw]" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 rounded-full bg-white/10" />
              <div className="h-8 w-20 rounded-full bg-white/10" />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-8 space-y-2">
              <SkeletonLine w="w-full" />
              <SkeletonLine w="w-[92%]" />
              <SkeletonLine w="w-[80%]" />
            </div>
            <div className="col-span-12 md:col-span-4 space-y-2">
              <SkeletonLine w="w-28" />
              <SkeletonLine w="w-36" />
              <SkeletonLine w="w-32" />
            </div>
          </div>
        </Card>
      </div>

      {/* Meta card skeleton */}
      <div className="mx-auto max-w-6xl">
        <Card className="animate-pulse flex flex-wrap items-center justify-between gap-3">
          <div className="h-4 w-64 rounded-full bg-white/10" />
          <div className="h-4 w-40 rounded-full bg-white/10" />
        </Card>
      </div>

      {/* Comments skeleton */}
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-6 w-32 rounded-full bg-white/10 animate-pulse" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="animate-pulse space-y-2">
              <div className="flex items-center justify-between">
                <div className="h-3 w-28 rounded-full bg-white/10" />
                <div className="h-3 w-20 rounded-full bg-white/10" />
              </div>
              <div className="space-y-2">
                <SkeletonLine />
                <SkeletonLine w="w-[85%]" />
              </div>
            </Card>
          ))}
        </div>

        <Card className="animate-pulse space-y-3">
          <div className="h-20 w-full rounded-2xl bg-white/10" />
          <div className="h-9 w-56 rounded-xl bg-white/10" />
          <div className="flex justify-end">
            <div className="h-9 w-24 rounded-xl bg-white/10" />
          </div>
        </Card>
      </div>
    </div>
  );
}
