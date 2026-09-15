import { getAphorismOfTheDay } from "@/lib/aphorism";

export function AphorismSection() {
  const aphorism = getAphorismOfTheDay();

  return (
    <aside className="aphorism" aria-label="Aforisma del giorno">
      <p className="aphorism__kicker">Aforisma del giorno</p>
      <blockquote className="aphorism__quote">
        <p className="aphorism__text">«{aphorism.text}»</p>
        {aphorism.attribution ? (
          <footer className="aphorism__attr">— {aphorism.attribution}</footer>
        ) : null}
      </blockquote>
    </aside>
  );
}
