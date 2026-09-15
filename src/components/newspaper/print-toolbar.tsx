"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintToolbar() {
  return (
    <div className="print-toolbar no-print mx-auto flex w-full max-w-[210mm] items-center justify-between gap-4 px-4 py-4 sm:px-0">
      <p className="font-serif text-sm text-stone-600">
        Anteprima edizione mattutina — una pagina A4
      </p>
      <Button
        type="button"
        onClick={() => window.print()}
        className="rounded-none bg-stone-900 text-stone-50 hover:bg-stone-800"
      >
        <Printer className="size-4" />
        Stampa
      </Button>
    </div>
  );
}
