import { formatEditionDate, formatClock } from "@/lib/format";
import { newspaperConfig } from "@/lib/config";

type MastheadProps = {
  generatedAt: Date;
};

export function Masthead({ generatedAt }: MastheadProps) {
  return (
    <header className="border-b-[3px] border-double border-stone-900 pb-3">
      <div className="flex items-end justify-between gap-4 border-b border-stone-900 pb-2 text-[11px] uppercase tracking-[0.14em] text-stone-700">
        <span>{newspaperConfig.ownerName}</span>
        <span>Edizione del mattino</span>
        <span>{formatClock(generatedAt)}</span>
      </div>

      <div className="py-4 text-center">
        <p className="mb-1 font-serif text-[11px] uppercase tracking-[0.35em] text-stone-600">
          Quotidiano personale
        </p>
        <h1 className="font-masthead text-[clamp(2.4rem,7vw,4.6rem)] leading-none font-bold tracking-tight text-stone-950">
          {newspaperConfig.brandName}
        </h1>
        <p className="mt-3 font-serif text-base italic text-stone-700">
          Una pagina, pronta per la stampante del mattino
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-stone-900 pt-2 text-xs uppercase tracking-[0.12em] text-stone-700">
        <span>{formatEditionDate(generatedAt)}</span>
        <span>Vol. I · N. 1</span>
        <span>
          {newspaperConfig.weather.city}, {newspaperConfig.weather.country}
        </span>
      </div>
    </header>
  );
}
