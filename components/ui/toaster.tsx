"use client";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-right"
      toastOptions={{
        style: {
          background: "#18181b",
          border: "1px solid #27272a",
          color: "#fafafa",
        },
      }}
    />
  );
}
